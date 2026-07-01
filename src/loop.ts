import fs from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { compileAgent } from "./compile.js";
import { discoverTasks, latestDiscoveryTask, writeDiscovery } from "./discover.js";
import { createWorktree } from "./worktree.js";
import { renderVerificationSummary, runVerifyCommands, writeVerification } from "./verify.js";
import { updateBoard } from "./board.js";
import { ctxcarryPath } from "./paths.js";
import { redactText } from "./redact.js";
import { readConfig } from "./store.js";
import { estimateTokens } from "./tokens.js";

interface ParsedArgsLike {
  positional: string[];
  flags: Record<string, string | boolean>;
}

interface TokenPolicy {
  max_prompt_tokens: number;
  max_artifact_tokens: number;
  max_loops_per_run: number;
  expensive_model_requires_flag: boolean;
}

export function loopCommand(args: ParsedArgsLike): void {
  const config = readConfig();
  const tokenPolicy = tokenPolicyFromConfig(config);
  const loopConfig = (config as { loop?: { generator?: string; evaluator?: string } }).loop;
  const generator = stringFlag(args, "generator") ?? loopConfig?.generator ?? "codex";
  const evaluator = stringFlag(args, "evaluator") ?? loopConfig?.evaluator ?? "codex";
  const limit = Math.min(numberFlag(args, "limit") ?? 1, tokenPolicy.max_loops_per_run);

  const tasks = tasksForLoop(args, limit);
  if (!tasks.length) {
    console.log("No loop tasks found.");
    return;
  }

  if (args.flags["from-discovery"] && !args.flags["allow-dirty"]) {
    assertNoDirtySourceChanges();
  }

  for (const task of tasks) {
    runSingleLoop(task, generator, evaluator, tokenPolicy, args);
  }
}

function runSingleLoop(task: string, generator: string, evaluator: string, tokenPolicy: TokenPolicy, args: ParsedArgsLike): void {
  if (estimateTokens(task) > tokenPolicy.max_prompt_tokens) {
    throw new Error(`Task prompt exceeds token budget (${tokenPolicy.max_prompt_tokens}).`);
  }

  const loopId = new Date().toISOString().replace(/[:.]/g, "-");
  const loopDir = ctxcarryPath("loops", loopId);
  fs.mkdirSync(loopDir, { recursive: true });
  writeLoopFile(loopDir, "task.txt", task);

  updateBoard(task, "In Progress");
  const worktree = createWorktree(task);
  console.log(`In worktree ${worktree.path}`);

  execFileSync("ctxcarry", ["setup"], { cwd: worktree.path, stdio: "inherit" });
  execFileSync("ctxcarry", ["run", generator, "--prompt", generatorPrompt(task)], { cwd: worktree.path, stdio: "inherit" });

  updateBoard(task, "Verifying");
  const config = readConfig();
  const verification = runVerifyCommands(config.verify?.commands ?? [], worktree.path);
  writeVerification(verification);

  const worktreeVerdictPath = `${worktree.path}/.ctxcarry/evaluator-verdict.md`;
  fs.mkdirSync(`${worktree.path}/.ctxcarry`, { recursive: true });
  const diff = trimToTokenBudget(summarizeDiff(worktree.path), tokenPolicy.max_artifact_tokens);
  writeLoopFile(loopDir, "diff.md", diff);
  writeLoopFile(loopDir, "verification.md", renderVerificationSummary(verification));

  const evaluatorInstructions = renderEvaluatorInstructions(task, worktreeVerdictPath, renderVerificationSummary(verification), diff);
  if (estimateTokens(evaluatorInstructions) > tokenPolicy.max_prompt_tokens) {
    throw new Error(`Evaluator prompt exceeds token budget (${tokenPolicy.max_prompt_tokens}).`);
  }
  writeLoopFile(loopDir, "evaluator.md", evaluatorInstructions);

  compileAgent(evaluator, config.default_budget_tokens);
  execFileSync(evaluator, agentPromptArgs(evaluator, evaluatorInstructions), {
    cwd: worktree.path,
    stdio: "inherit",
    env: { ...process.env, CTXCARRY_EVALUATOR_INSTRUCTIONS: evaluatorInstructions, CTXCARRY_VERDICT_PATH: worktreeVerdictPath },
  });

  const verdict = fs.existsSync(worktreeVerdictPath) ? fs.readFileSync(worktreeVerdictPath, "utf8").trim() : "NEEDS_REVIEW\nNo verdict file was written.";
  writeLoopFile(loopDir, "verdict.md", verdict);
  updateBoard(task, verdict.startsWith("PASS") ? "Done" : verdict.startsWith("FAIL") ? "Failed" : "Needs Review");
  console.log(`Loop ${loopId} complete.`);
}

function tasksForLoop(args: ParsedArgsLike, limit: number): string[] {
  const task = stringFlag(args, "task");
  if (task) return [task];

  if (!args.flags["from-discovery"]) {
    throw new Error('Usage: ctxcarry loop --task "..." --generator claude --evaluator codex');
  }

  const discovery = discoverTasks({ limit });
  writeDiscovery(discovery);
  if (discovery.tasks.length) {
    return discovery.tasks.slice(0, limit).map((item) => item.title);
  }
  const latest = latestDiscoveryTask();
  return latest ? [latest.title] : [];
}

function renderEvaluatorInstructions(task: string, verdictPath: string, verification: string, diff: string): string {
  return `# Evaluator Instructions

Task: ${task}
Verdict path: ${verdictPath}

Assume the generator made mistakes.
Inspect the diff.
Run or review verification.
Look for regressions.
Do not grade based on the generator's summary alone.
Return PASS, FAIL, or NEEDS_REVIEW with reasons.
Write the verdict to the verdict path.

## Verification

${verification}

## Diff

${diff}
`;
}

function summarizeDiff(cwd: string): string {
  try {
    const status = execSync("git status --short", { cwd, encoding: "utf8", maxBuffer: 12000 });
    const diff = execSync("git diff --stat && git diff -- .", { cwd, encoding: "utf8", maxBuffer: 12000 });
    const untracked = status
      .split("\n")
      .filter((line) => line.startsWith("?? "))
      .map((line) => line.slice(3).trim())
      .filter((file) => !file.startsWith(".ctxcarry/") && file !== "ctxcarry.config.json")
      .slice(0, 5)
      .map((file) => {
        try {
          const content = fs.readFileSync(`${cwd}/${file}`, "utf8");
          return `## Untracked ${file}\n\n${content.slice(0, 2000)}`;
        } catch {
          return `## Untracked ${file}`;
        }
      })
      .join("\n\n");
    return redactText([status.trim() && `# Status\n${status.trim()}`, diff.trim() && `# Diff\n${diff.trim()}`, untracked].filter(Boolean).join("\n\n"));
  } catch (error) {
    return redactText(String(error));
  }
}

function writeLoopFile(loopDir: string, filename: string, content: string): void {
  fs.writeFileSync(`${loopDir}/${filename}`, `${redactText(content).trimEnd()}\n`);
}

function generatorPrompt(task: string): string {
  return [
    task,
    "",
    "Work autonomously in this ctxcarry worktree. Make the smallest correct change, run the configured verification commands when relevant, and write the required ctxcarry session summary before exiting.",
  ].join("\n");
}

function agentPromptArgs(agent: string, prompt: string): string[] {
  if (agent === "claude") return ["-p", prompt];
  if (agent === "codex") return ["exec", prompt];
  return [prompt];
}

function tokenPolicyFromConfig(config: ReturnType<typeof readConfig>): TokenPolicy {
  const tokenConfig = (config as { tokens?: Partial<TokenPolicy> }).tokens;
  return {
    max_prompt_tokens: tokenConfig?.max_prompt_tokens ?? 12000,
    max_artifact_tokens: tokenConfig?.max_artifact_tokens ?? 6000,
    max_loops_per_run: tokenConfig?.max_loops_per_run ?? 1,
    expensive_model_requires_flag: tokenConfig?.expensive_model_requires_flag ?? true,
  };
}

function trimToTokenBudget(content: string, maxTokens: number): string {
  if (estimateTokens(content) <= maxTokens) return content;
  const maxChars = Math.max(200, maxTokens * 4);
  const head = content.slice(0, Math.floor(maxChars * 0.6));
  const tail = content.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n\n... trimmed to fit ctxcarry token budget ...\n\n${tail}`;
}

function assertNoDirtySourceChanges(): void {
  const status = execSync("git status --porcelain", { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes(" .ctxcarry/") && !line.endsWith("ctxcarry.config.json"));
  if (status.length) {
    throw new Error("Refusing discovery loop with dirty source changes. Commit or pass --allow-dirty.");
  }
}

function stringFlag(args: ParsedArgsLike, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}

function numberFlag(args: ParsedArgsLike, name: string): number | undefined {
  const value = stringFlag(args, name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
