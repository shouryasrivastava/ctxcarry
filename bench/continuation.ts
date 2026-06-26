import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { criticalPresence, estimateTokens } from "./lib.js";

interface Row {
  mode: string;
  tokens: number;
  expectedFactPresence: string;
  taskSuccess: string;
  repeatedFailedAttempts: string;
}

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(args.project ?? process.cwd());
const expectedFacts = args.expectedFacts ? JSON.parse(fs.readFileSync(path.resolve(args.expectedFacts), "utf8")) as string[] : [];
const rows = collectRows(projectRoot, expectedFacts);
const report = render(rows, expectedFacts.length > 0);

if (args.out) fs.writeFileSync(path.resolve(args.out), report);
process.stdout.write(report);

function collectRows(root: string, expectedFacts: string[]): Row[] {
  runCli(root, "switch", "codex");
  const raw = readAllSessionText(root);
  const handoff = readIfExists(path.join(root, ".handoff", "handoffs", "codex.md"));
  return [
    row("no handoff", "", expectedFacts),
    row("raw transcript", raw, expectedFacts),
    row("naive first-2k truncation", raw.slice(0, 8000), expectedFacts),
    row("naive last-2k truncation", raw.slice(Math.max(0, raw.length - 8000)), expectedFacts),
    row("Handoff handoff", handoff, expectedFacts)
  ];
}

function row(mode: string, text: string, expectedFacts: string[]): Row {
  return {
    mode,
    tokens: estimateTokens(text),
    expectedFactPresence: expectedFacts.length > 0 ? `${(criticalPresence(text, expectedFacts) * 100).toFixed(1)}%` : "not measured",
    taskSuccess: "not measured",
    repeatedFailedAttempts: "not measured"
  };
}

function render(rows: Row[], hasFacts: boolean): string {
  return [
    "# Handoff Real-Agent Continuation Benchmark",
    "",
    "This scaffold compares context modes using real local session artifacts. It does not execute agents or fabricate success rates.",
    hasFacts ? "Expected facts were provided, so fact presence is measured." : "No expected facts file was provided, so fact presence is not measured.",
    "",
    table(["Mode", "Tokens", "Expected-fact presence", "Task success", "Repeated failed attempts"], rows.map((item) => [item.mode, String(item.tokens), item.expectedFactPresence, item.taskSuccess, item.repeatedFailedAttempts])),
    "",
    "Run with expected facts:",
    "",
    "```bash",
    "pnpm run bench:continuation -- --project /path/to/repo --expected-facts expected-facts.json",
    "```"
  ].join("\n");
}

function readAllSessionText(root: string): string {
  const sessionsRoot = path.join(root, ".handoff", "sessions");
  if (!fs.existsSync(sessionsRoot)) return "";
  const parts: string[] = [];
  for (const sessionId of fs.readdirSync(sessionsRoot).sort()) {
    const dir = path.join(sessionsRoot, sessionId);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of ["instructions.md", "summary.md", "before.json", "after.json"]) {
      parts.push(readIfExists(path.join(dir, file)));
    }
  }
  return parts.join("\n");
}

function runCli(cwd: string, ...cliArgs: string[]): string {
  return execFileSync("node", [path.join(process.cwd(), "dist", "cli.js"), ...cliArgs], { cwd, encoding: "utf8" });
}

function readIfExists(file: string): string {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function table(headers: string[], rows: string[][]): string {
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

function parseArgs(argv: string[]): { project?: string; expectedFacts?: string; out?: string } {
  const parsed: { project?: string; expectedFacts?: string; out?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--project") parsed.project = argv[++index];
    else if (arg === "--expected-facts") parsed.expectedFacts = argv[++index];
    else if (arg === "--out") parsed.out = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}
