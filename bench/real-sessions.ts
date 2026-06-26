import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { estimateTokens } from "./lib.js";

interface RealSessionRow {
  sessionId: string;
  hasSummary: boolean;
  rawTokens: number;
  summaryTokens: number;
  handoffTokens: number;
  savedTokens: number;
  compressionRatio: number;
  changedFiles: number;
  exitStatus: string;
  requiredSectionsPresent: string;
  redactionPassed: string;
  compileLatencyMs: number;
}

interface RealSessionReport {
  environment: Record<string, string>;
  projectRoot: string;
  sessionsFound: number;
  totals: {
    rawTokens: number;
    handoffTokens: number;
    savedTokens: number;
    compressionRatio: number;
  };
  rows: RealSessionRow[];
  notes: string[];
}

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(args.project ?? process.cwd());
const report = collectReport(projectRoot);
const rendered = args.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report);

if (args.out) {
  fs.writeFileSync(path.resolve(args.out), rendered);
}

process.stdout.write(rendered);

function collectReport(root: string): RealSessionReport {
  const sessionsRoot = path.join(root, ".ctxcarry", "sessions");
  const sessionIds = fs.existsSync(sessionsRoot)
    ? fs.readdirSync(sessionsRoot).filter((entry) => fs.statSync(path.join(sessionsRoot, entry)).isDirectory()).sort()
    : [];
  const rows = sessionIds.map((sessionId) => benchmarkSession(root, sessionId));
  const rawTokens = rows.reduce((sum, row) => sum + row.rawTokens, 0);
  const handoffTokens = rows.reduce((sum, row) => sum + row.handoffTokens, 0);
  const savedTokens = rawTokens - handoffTokens;

  return {
    environment: environmentMetadata(root),
    projectRoot: root,
    sessionsFound: rows.length,
    totals: {
      rawTokens,
      handoffTokens,
      savedTokens,
      compressionRatio: rawTokens === 0 ? 0 : savedTokens / rawTokens
    },
    rows,
    notes: [
      "This report uses real local ctxcarry session artifacts.",
      "It does not measure task-success rate or recall unless you separately provide expected facts.",
      "Use it to inspect real-session compression, summary quality, redaction, changed-file capture, and ctxcarry size."
    ]
  };
}

function benchmarkSession(root: string, sessionId: string): RealSessionRow {
  const sessionDir = path.join(root, ".ctxcarry", "sessions", sessionId);
  const summaryPath = path.join(sessionDir, "summary.md");
  const summary = fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, "utf8") : "";
  const rawText = readSessionRawText(sessionDir);
  const before = readJson(path.join(sessionDir, "before.json"));
  const after = readJson(path.join(sessionDir, "after.json"));

  const started = performance.now();
  runCli(root, "switch", "codex");
  const compileLatencyMs = performance.now() - started;

  const ctxcarryPath = path.join(root, ".ctxcarry", "ctxcarrys", "codex.md");
  const ctxcarry = fs.existsSync(ctxcarryPath) ? fs.readFileSync(ctxcarryPath, "utf8") : "";
  const rawTokens = estimateTokens(rawText);
  const handoffTokens = estimateTokens(ctxcarry);
  const savedTokens = rawTokens - handoffTokens;
  const changedFiles = new Set<string>([
    ...arrayOfStrings(before?.changedFiles),
    ...arrayOfStrings(after?.changedFiles)
  ]);

  return {
    sessionId,
    hasSummary: summary.length > 0,
    rawTokens,
    summaryTokens: estimateTokens(summary),
    handoffTokens,
    savedTokens,
    compressionRatio: rawTokens === 0 ? 0 : savedTokens / rawTokens,
    changedFiles: changedFiles.size,
    exitStatus: inferExitStatus(root, sessionId),
    requiredSectionsPresent: requiredSectionsPresent(summary),
    redactionPassed: containsKnownFakeSecret(rawText + "\n" + ctxcarry) ? "FAIL" : "PASS",
    compileLatencyMs
  };
}

function readSessionRawText(sessionDir: string): string {
  const parts: string[] = [];
  for (const name of ["instructions.md", "summary.md", "before.json", "after.json"]) {
    const file = path.join(sessionDir, name);
    if (fs.existsSync(file)) {
      parts.push(`--- ${name} ---\n${fs.readFileSync(file, "utf8")}`);
    }
  }
  return parts.join("\n\n");
}

function requiredSectionsPresent(summary: string): string {
  if (!summary) {
    return "not measured";
  }
  const required = ["Current Task", "Files Changed", "Decisions", "Constraints", "Failures", "Commands Run", "Next Step"];
  const present = required.filter((heading) => new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "m").test(summary));
  return `${present.length}/${required.length}`;
}

function inferExitStatus(root: string, sessionId: string): string {
  const eventsPath = path.join(root, ".ctxcarry", "events.jsonl");
  if (!fs.existsSync(eventsPath)) {
    return "not measured";
  }
  const events = fs
    .readFileSync(eventsPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const session = events.find((event) => event.type === "agent_session" && event.sessionId === sessionId);
  return typeof session?.exitCode === "number" ? String(session.exitCode) : "not measured";
}

function renderMarkdown(report: RealSessionReport): string {
  return [
    "# ctxcarry Real Session Benchmark Report",
    "",
    "This report is generated from real local `.ctxcarry/sessions` artifacts. It does not fabricate recall or task-success metrics.",
    "",
    "## Environment",
    table(["Field", "Value"], Object.entries(report.environment)),
    "",
    "## Key Results",
    table(
      ["Metric", "Value"],
      [
        ["Project root", report.projectRoot],
        ["Sessions found", String(report.sessionsFound)],
        ["Total raw session tokens", String(report.totals.rawTokens)],
        ["Total handoff tokens", String(report.totals.handoffTokens)],
        ["Total saved tokens", String(report.totals.savedTokens)],
        ["Overall compression", percent(report.totals.compressionRatio)]
      ]
    ),
    "",
    "## Sessions",
    table(
      [
        "Session",
        "Summary",
        "Raw tokens",
        "Summary tokens",
        "handoff tokens",
        "Compression",
        "Changed files",
        "Exit",
        "Sections",
        "Redaction",
        "Switch latency ms"
      ],
      report.rows.map((row) => [
        row.sessionId,
        row.hasSummary ? "yes" : "no",
        String(row.rawTokens),
        String(row.summaryTokens),
        String(row.handoffTokens),
        percent(row.compressionRatio),
        String(row.changedFiles),
        row.exitStatus,
        row.requiredSectionsPresent,
        row.redactionPassed,
        row.compileLatencyMs.toFixed(1)
      ])
    ),
    "",
    "## Notes",
    ...report.notes.map((note) => `- ${note}`),
    "",
    "## Reproduce",
    "",
    "```bash",
    "ctxcarry init",
    "ctxcarry run claude",
    "ctxcarry switch codex",
    "pnpm run bench:real -- --project /path/to/your/repo --out REAL_BENCHMARKS.md",
    "```"
  ].join("\n");
}

function parseArgs(argv: string[]): { project?: string; format: "markdown" | "json"; out?: string } {
  let project: string | undefined;
  let format: "markdown" | "json" = "markdown";
  let out: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--project") {
      project = requiredValue(argv, ++index, "--project");
    } else if (arg === "--format") {
      const value = requiredValue(argv, ++index, "--format");
      if (value !== "markdown" && value !== "json") {
        throw new Error("--format must be markdown or json.");
      }
      format = value;
    } else if (arg === "--out") {
      out = requiredValue(argv, ++index, "--out");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { project, format, out };
}

function runCli(cwd: string, ...args: string[]): string {
  return execFileSync("node", [path.join(process.cwd(), "dist", "cli.js"), ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function environmentMetadata(root: string): Record<string, string> {
  return {
    "Node version": process.version,
    "Platform / arch": `${process.platform}/${process.arch}`,
    "CPU model": os.cpus()[0]?.model ?? "not available",
    Date: new Date().toISOString(),
    "Git commit": gitCommit(root)
  };
}

function gitCommit(root: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "not available";
  }
}

function readJson(file: string): any {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function containsKnownFakeSecret(text: string): boolean {
  return ["sk-test-123", "ANTHROPIC_API_KEY=abc123", "postgres://user:pass@host/db", "JWT_SECRET=supersecret", "fake-private-key"].some((secret) =>
    text.includes(secret)
  );
}

function table(headers: string[], rows: string[][]): string {
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function requiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
