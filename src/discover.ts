import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { updateBoard } from "./board.js";
import { ctxcarryPath, rootPath } from "./paths.js";
import { redactText } from "./redact.js";
import { readConfig } from "./store.js";
import { estimateTokens } from "./tokens.js";
import { runVerifyCommands, renderVerificationSummary } from "./verify.js";

export interface DiscoveryTask {
  id: string;
  source: "verification" | "board" | "verdict" | "todo";
  priority: number;
  title: string;
  detail: string;
  tokenEstimate: number;
}

export interface DiscoveryResult {
  timestamp: string;
  tasks: DiscoveryTask[];
}

export interface DiscoveryOptions {
  limit?: number;
  json?: boolean;
  skipVerify?: boolean;
}

export function discoverCommand(args: { flags: Record<string, string | boolean> }): DiscoveryResult {
  const limit = numberFlag(args.flags.limit) ?? 10;
  const result = discoverTasks({ limit, skipVerify: Boolean(args.flags["skip-verify"]) });
  writeDiscovery(result);
  if (args.flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderDiscoveryMarkdown(result));
  }
  return result;
}

export function discoverTasks(options: DiscoveryOptions = {}): DiscoveryResult {
  const limit = options.limit ?? 10;
  const tasks: DiscoveryTask[] = [];

  if (!options.skipVerify) {
    const config = readConfig();
    const verification = runVerifyCommands(config.verify?.commands ?? []);
    if (!verification.passed) {
      const failed = verification.commands.filter((command) => !command.passed).map((command) => command.command).join(", ");
      tasks.push(makeTask("verification", 100, `Fix failing verification: ${failed}`, renderVerificationSummary(verification)));
    }
  }

  tasks.push(...discoverBoardTasks());
  tasks.push(...discoverLoopVerdicts());
  tasks.push(...discoverTodoTasks());

  const ranked = tasks
    .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title))
    .slice(0, limit);
  return { timestamp: new Date().toISOString(), tasks: ranked };
}

export function latestDiscoveryTask(): DiscoveryTask | undefined {
  const latestPath = ctxcarryPath("discovery", "latest.json");
  if (!fs.existsSync(latestPath)) return undefined;
  const result = JSON.parse(fs.readFileSync(latestPath, "utf8")) as DiscoveryResult;
  return result.tasks[0];
}

export function writeDiscovery(result: DiscoveryResult): void {
  const dir = ctxcarryPath("discovery");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "latest.json"), `${JSON.stringify(redactDiscovery(result), null, 2)}\n`);
  fs.writeFileSync(path.join(dir, "latest.md"), renderDiscoveryMarkdown(result));
}

export function renderDiscoveryMarkdown(result: DiscoveryResult): string {
  const lines = ["# ctxcarry Discovery", "", `Timestamp: ${result.timestamp}`, ""];
  if (!result.tasks.length) {
    lines.push("No tasks discovered.", "");
    return lines.join("\n");
  }
  for (const task of result.tasks) {
    lines.push(`## ${task.title}`, "", `Source: ${task.source}`, `Priority: ${task.priority}`, `Token estimate: ${task.tokenEstimate}`, "", task.detail.trim(), "");
  }
  return lines.join("\n");
}

function discoverBoardTasks(): DiscoveryTask[] {
  const boardPath = ctxcarryPath("board.md");
  if (!fs.existsSync(boardPath)) return [];
  const tasks: DiscoveryTask[] = [];
  for (const line of fs.readFileSync(boardPath, "utf8").split("\n")) {
    const match = line.match(/^\|\s*(Todo|Needs Review|Failed)\s*\|\s*(.*?)\s*\|/i);
    if (!match) continue;
    const status = match[1];
    const title = match[2].trim();
    const priority = status === "Failed" ? 90 : status === "Needs Review" ? 80 : 60;
    tasks.push(makeTask("board", priority, title, `Board status: ${status}`));
  }
  return tasks;
}

function discoverLoopVerdicts(): DiscoveryTask[] {
  const loopsDir = ctxcarryPath("loops");
  if (!fs.existsSync(loopsDir)) return [];
  const tasks: DiscoveryTask[] = [];
  for (const entry of fs.readdirSync(loopsDir)) {
    const verdictPath = path.join(loopsDir, entry, "verdict.md");
    const taskPath = path.join(loopsDir, entry, "task.txt");
    if (!fs.existsSync(verdictPath)) continue;
    const verdict = fs.readFileSync(verdictPath, "utf8");
    if (!/^(FAIL|NEEDS_REVIEW)\b/.test(verdict.trim())) continue;
    const title = fs.existsSync(taskPath) ? fs.readFileSync(taskPath, "utf8").trim() : `Review failed loop ${entry}`;
    tasks.push(makeTask("verdict", verdict.startsWith("FAIL") ? 85 : 75, title, verdict));
  }
  return tasks;
}

function discoverTodoTasks(): DiscoveryTask[] {
  const tasks: DiscoveryTask[] = [];
  for (const file of listProjectFiles(rootPath())) {
    const rel = path.relative(rootPath(), file);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!/\b(TODO|FIXME)\b/i.test(line)) continue;
      tasks.push(makeTask("todo", 30, `Resolve ${rel}:${index + 1}`, line.trim()));
      if (tasks.length >= 20) return tasks;
    }
  }
  return tasks;
}

function listProjectFiles(dir: string): string[] {
  const ignored = new Set([".git", ".ctxcarry", "node_modules", "dist", "build", "coverage"]);
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listProjectFiles(full));
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs|md|json|yml|yaml)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function makeTask(source: DiscoveryTask["source"], priority: number, title: string, detail: string): DiscoveryTask {
  const redactedTitle = redactText(title).trim();
  const redactedDetail = redactText(detail).trim();
  return {
    id: `${source}-${Buffer.from(redactedTitle).toString("base64url").slice(0, 12)}`,
    source,
    priority,
    title: redactedTitle,
    detail: redactedDetail,
    tokenEstimate: estimateTokens(`${redactedTitle}\n${redactedDetail}`),
  };
}

function redactDiscovery(result: DiscoveryResult): DiscoveryResult {
  return {
    ...result,
    tasks: result.tasks.map((task) => ({
      ...task,
      title: redactText(task.title),
      detail: redactText(task.detail),
    })),
  };
}

function numberFlag(value: string | boolean | undefined): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
