import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  assert,
  criticalPresence,
  correctnessFixtures,
  estimateTokens,
  exactItemRecall,
  fixtureNames,
  itemRecall,
  percent,
  precision,
  prepareFixture,
  readFile,
  readState,
  repoRoot,
  runCli,
  scalarRecall,
  stressFixtures,
  timed
} from "./lib.js";

type Format = "markdown" | "json";

interface CompressionRow {
  fixture: string;
  group: string;
  originalTokens: number;
  handoffTokens: number;
  savedTokens: number;
  compressionRatio: number;
  latencyMs: number;
}

interface AccuracyRow {
  fixture: string;
  group: string;
  exactRecall: number;
  fuzzyRecall: number;
  precision: number;
  contradictionCount: number;
  budgetRecall: number;
  redactionPassed: boolean;
  taskRecall: number;
  fileRecall: number;
  decisionRecall: number;
  constraintRecall: number;
  failureRecall: number;
  commandRecall: number;
  nextStepRecall: number;
  overallRecall: number;
}

interface BaselineRow {
  fixture: string;
  group: string;
  mode: "no handoff" | "raw transcript" | "naive truncation" | "Handoff handoff";
  tokens: number;
  criticalFactPresence: number;
}

interface BudgetStressRow {
  fixture: string;
  group: string;
  budgetTokens: number;
  handoffTokens: number;
  criticalFactRecall: number;
}

interface TruncationResistanceRow {
  fixture: string;
  rawTranscript: number;
  first2kTokens: number;
  last2kTokens: number;
  handoffHandoff: number;
}

interface E2ERow {
  status: "PASS" | "FAIL";
  agentsMdExists: boolean;
  managedBlockExists: boolean;
  handoffTokens: number;
  withinBudget: boolean;
  redactionPassed: boolean;
}

interface LatencyRow {
  operation: string;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
}

interface RedactionResult {
  status: "PASS" | "FAIL";
  knownFakeSecretsTested: string[];
  outputsScanned: string[];
  leaks: string[];
}

interface BenchmarkReport {
  environment: Record<string, string>;
  keyResults: Record<string, string>;
  compression: CompressionRow[];
  compressionTotal: CompressionRow;
  accuracy: AccuracyRow[];
  baseline: BaselineRow[];
  budgetStress: BudgetStressRow[];
  truncationResistance: TruncationResistanceRow[];
  e2e: E2ERow;
  latency: LatencyRow[];
  redaction: RedactionResult;
}

const args = parseArgs(process.argv.slice(2));
const report = collectReport();
const rendered = args.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report);

if (args.out) {
  fs.writeFileSync(path.resolve(args.out), rendered);
}

process.stdout.write(rendered);

function collectReport(): BenchmarkReport {
  const redaction = redactionBenchmark();
  const compression = compressionBenchmark();
  const compressionTotalRow = compressionTotal(compression);
  const accuracy = recallBenchmark();
  const baseline = baselineBenchmark();
  const budgetStress = budgetStressBenchmark();
  const truncationResistance = truncationResistanceBenchmark();
  const e2e = e2eBenchmark(redaction.status === "PASS");
  const latency = latencyBenchmark();
  return {
    environment: environmentMetadata(),
    keyResults: keyResults(compressionTotalRow, accuracy, e2e, redaction),
    compression,
    compressionTotal: compressionTotalRow,
    accuracy,
    baseline,
    budgetStress,
    truncationResistance,
    e2e,
    latency,
    redaction
  };
}

function environmentMetadata(): Record<string, string> {
  return {
    "Handoff package version": packageVersion(),
    "Node version": process.version,
    "Platform / arch": `${process.platform}/${process.arch}`,
    "CPU model": os.cpus()[0]?.model ?? "not available",
    Date: new Date().toISOString(),
    "Git commit": gitCommit()
  };
}

function keyResults(total: CompressionRow, accuracy: AccuracyRow[], e2e: E2ERow, redaction: RedactionResult): Record<string, string> {
  const meanCriticalRecall = accuracy.reduce((sum, row) => sum + row.fuzzyRecall, 0) / accuracy.length;
  const meanBudgetRecall = accuracy.reduce((sum, row) => sum + row.budgetRecall, 0) / accuracy.length;
  const contradictions = accuracy.reduce((sum, row) => sum + row.contradictionCount, 0);
  return {
    "Total raw benchmark tokens": String(total.originalTokens),
    "Total handoff tokens": String(total.handoffTokens),
    "Total saved tokens": String(total.savedTokens),
    "Overall compression": percent(total.compressionRatio),
    "Mean critical-fact recall": percent(meanCriticalRecall),
    "Mean budget recall": percent(meanBudgetRecall),
    "Contradictions found": String(contradictions),
    "E2E status": e2e.status,
    "Redaction": redaction.status
  };
}

function compressionBenchmark(): CompressionRow[] {
  return fixtureNames().map((name) => {
    const fixture = prepareFixture(name);
    runCli(fixture.workDir, "compact");
    const result = timed(() => runCli(fixture.workDir, "compile", "--agent", "codex"));
    const handoff = readFile(fixture.workDir, ".handoff/handoffs/codex.md");
    const originalTokens = estimateTokens(fixture.rawContext);
    const handoffTokens = estimateTokens(handoff);
    const savedTokens = originalTokens - handoffTokens;
    return {
      fixture: name,
      group: fixture.group,
      originalTokens,
      handoffTokens,
      savedTokens,
      compressionRatio: originalTokens === 0 ? 0 : savedTokens / originalTokens,
      latencyMs: result.ms
    };
  });
}

function compressionTotal(rows: CompressionRow[]): CompressionRow {
  const originalTokens = rows.reduce((sum, row) => sum + row.originalTokens, 0);
  const handoffTokens = rows.reduce((sum, row) => sum + row.handoffTokens, 0);
  const savedTokens = originalTokens - handoffTokens;
  return {
    fixture: "TOTAL",
    group: "all",
    originalTokens,
    handoffTokens,
    savedTokens,
    compressionRatio: originalTokens === 0 ? 0 : savedTokens / originalTokens,
    latencyMs: rows.reduce((sum, row) => sum + row.latencyMs, 0)
  };
}

function recallBenchmark(): AccuracyRow[] {
  return fixtureNames().map((name) => {
    const fixture = prepareFixture(name);
    runCli(fixture.workDir, "compact");
    runCli(fixture.workDir, "compile", "--agent", "codex", "--budget", "4000");
    const state = readState(fixture.workDir);
    const handoff = readFile(fixture.workDir, ".handoff/handoffs/codex.md");
    const actualItems = stateItems(state);
    const expectedItems = expectedItemsFromFixture(fixture.expected);
    const row: AccuracyRow = {
      fixture: name,
      group: fixture.group,
      exactRecall: exactItemRecall(actualItems, expectedItems),
      fuzzyRecall: criticalPresence(handoff, fixture.criticalFacts),
      precision: precision(actualItems, expectedItems),
      contradictionCount: contradictionCount(handoff),
      budgetRecall: criticalPresence(handoff, fixture.criticalFacts),
      redactionPassed: !containsKnownFakeSecret(handoff),
      taskRecall: scalarRecall(state.working.currentTask, fixture.expected.currentTask),
      fileRecall: itemRecall(state.working.touchedFiles, fixture.expected.touchedFiles),
      decisionRecall: itemRecall(state.episodic.decisions.map((item: any) => item.content), fixture.expected.decisions),
      constraintRecall: itemRecall(state.working.constraints.map((item: any) => item.content), fixture.expected.constraints),
      failureRecall: itemRecall(state.working.failures.map((item: any) => item.content), fixture.expected.failures),
      commandRecall: itemRecall(state.working.lastCommands, fixture.expected.lastCommands),
      nextStepRecall: itemRecall(state.working.nextSteps.map((item: any) => item.content), fixture.expected.nextSteps),
      overallRecall: 0
    };
    row.overallRecall =
      (row.taskRecall +
        row.fileRecall +
        row.decisionRecall +
        row.constraintRecall +
        row.failureRecall +
        row.commandRecall +
        row.nextStepRecall) /
      7;
    return row;
  });
}

function baselineBenchmark(): BaselineRow[] {
  const rows: BaselineRow[] = [];
  for (const name of fixtureNames()) {
    const fixture = prepareFixture(name);
    runCli(fixture.workDir, "compact");
    runCli(fixture.workDir, "compile", "--agent", "codex");
    const handoff = readFile(fixture.workDir, ".handoff/handoffs/codex.md");
    rows.push({
      fixture: name,
      group: fixture.group,
      mode: "no handoff",
      tokens: 0,
      criticalFactPresence: 0
    });
    rows.push({
      fixture: name,
      group: fixture.group,
      mode: "raw transcript",
      tokens: estimateTokens(fixture.rawContext),
      criticalFactPresence: criticalPresence(fixture.rawContext, fixture.criticalFacts)
    });
    const naive = naiveTruncate(fixture.rawContext, 2000);
    rows.push({
      fixture: name,
      group: fixture.group,
      mode: "naive truncation",
      tokens: estimateTokens(naive),
      criticalFactPresence: criticalPresence(naive, fixture.criticalFacts)
    });
    rows.push({
      fixture: name,
      group: fixture.group,
      mode: "Handoff handoff",
      tokens: estimateTokens(handoff),
      criticalFactPresence: criticalPresence(handoff, fixture.criticalFacts)
    });
  }
  return rows;
}

function naiveTruncate(text: string, budgetTokens: number): string {
  return text.slice(0, budgetTokens * 4);
}

function truncationResistanceBenchmark(): TruncationResistanceRow[] {
  return stressFixtures.map((name) => {
    const fixture = prepareFixture(name);
    runCli(fixture.workDir, "compact");
    runCli(fixture.workDir, "compile", "--agent", "codex");
    const handoff = readFile(fixture.workDir, ".handoff/handoffs/codex.md");
    return {
      fixture: name,
      rawTranscript: criticalPresence(fixture.rawContext, fixture.criticalFacts),
      first2kTokens: criticalPresence(firstTokens(fixture.rawContext, 2000), fixture.criticalFacts),
      last2kTokens: criticalPresence(lastTokens(fixture.rawContext, 2000), fixture.criticalFacts),
      handoffHandoff: criticalPresence(handoff, fixture.criticalFacts)
    };
  });
}

function firstTokens(text: string, budgetTokens: number): string {
  return text.slice(0, budgetTokens * 4);
}

function lastTokens(text: string, budgetTokens: number): string {
  return text.slice(Math.max(0, text.length - budgetTokens * 4));
}

function budgetStressBenchmark(): BudgetStressRow[] {
  const budgets = [250, 500, 1000, 2000];
  const rows: BudgetStressRow[] = [];
  for (const name of fixtureNames()) {
    const fixture = prepareFixture(name);
    for (const budget of budgets) {
      runCli(fixture.workDir, "compact");
      runCli(fixture.workDir, "compile", "--agent", "codex", "--budget", String(budget));
      const handoff = readFile(fixture.workDir, ".handoff/handoffs/codex.md");
      rows.push({
        fixture: name,
        group: fixture.group,
        budgetTokens: budget,
        handoffTokens: estimateTokens(handoff),
        criticalFactRecall: criticalPresence(handoff, fixture.criticalFacts)
      });
    }
  }
  return rows;
}

function e2eBenchmark(redactionPassed: boolean): E2ERow {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-e2e-report-"));
  const budget = 4000;
  execFileSync("git", ["init"], { cwd: workDir, stdio: "ignore" });
  fs.mkdirSync(path.join(workDir, "lib", "auth"), { recursive: true });
  fs.writeFileSync(path.join(workDir, "lib", "auth", "google.ts"), "export const redirect = '';\n");

  runCli(workDir, "init");
  runCli(workDir, "note", "--type", "task", "--text", "Fix Google OAuth redirect bug");
  runCli(workDir, "note", "--type", "decision", "--text", "Do not rewrite the auth provider");
  runCli(workDir, "note", "--type", "failure", "--text", "Production callback returns 400");
  runCli(workDir, "note", "--type", "next", "--text", "Check redirect URI construction");
  fs.appendFileSync(path.join(workDir, "lib", "auth", "google.ts"), "export const changed = true;\n");
  runCli(workDir, "capture");
  runCli(workDir, "switch", "codex", "--budget", String(budget));

  const agentsPath = path.join(workDir, "AGENTS.md");
  const agentsMdExists = fs.existsSync(agentsPath);
  const agents = agentsMdExists ? fs.readFileSync(agentsPath, "utf8") : "";
  const managedBlockExists = agents.includes("<!-- handoff:start -->") && agents.includes("<!-- handoff:end -->");
  const handoffTokens = estimateTokens(agents);
  const withinBudget = handoffTokens <= budget;
  const status =
    agentsMdExists &&
    managedBlockExists &&
    withinBudget &&
    agents.includes("Fix Google OAuth redirect bug") &&
    agents.includes("lib/auth/google.ts") &&
    agents.includes("Do not rewrite the auth provider") &&
    agents.includes("Production callback returns 400") &&
    agents.includes("Check redirect URI construction") &&
    redactionPassed
      ? "PASS"
      : "FAIL";

  return { status, agentsMdExists, managedBlockExists, handoffTokens, withinBudget, redactionPassed };
}

function latencyBenchmark(): LatencyRow[] {
  const operations: Array<[string, (workDir: string) => void]> = [
    ["capture", (workDir) => runCli(workDir, "capture")],
    ["compact", (workDir) => runCli(workDir, "compact")],
    ["compile codex", (workDir) => runCli(workDir, "compact") && runCli(workDir, "compile", "--agent", "codex")],
    ["switch codex", (workDir) => runCli(workDir, "switch", "codex")],
    ["tokens", (workDir) => runCli(workDir, "compact") && runCli(workDir, "tokens")]
  ];

  return operations.map(([operation, run]) => {
    const samples: number[] = [];
    for (let index = 0; index < 9; index += 1) {
      const fixture = prepareFixture("huge-test-log");
      samples.push(timed(() => run(fixture.workDir)).ms);
    }
    return summarizeLatency(operation, samples);
  });
}

function redactionBenchmark(): RedactionResult {
  const secrets = [
    ["OPENAI_API_KEY", "OPENAI_API_KEY=sk-test-123"],
    ["ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY=abc123"],
    ["DATABASE_URL", "DATABASE_URL=postgres://user:pass@host/db"],
    ["JWT_SECRET", "JWT_SECRET=supersecret"],
    ["PRIVATE_KEY", "PRIVATE_KEY=-----BEGIN PRIVATE KEY----- fake-private-key -----END PRIVATE KEY-----"]
  ];
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-redaction-"));
  runCli(workDir, "init");
  runCli(workDir, "note", "--type", "task", "--text", "Verify redaction");
  for (const [, secret] of secrets) {
    runCli(workDir, "note", "--type", "failure", "--text", secret);
  }
  runCli(workDir, "compact");
  runCli(workDir, "compile", "--agent", "codex");
  runCli(workDir, "compile", "--agent", "claude");

  const outputs = [
    ".handoff/events.jsonl",
    ".handoff/state.json",
    ".handoff/state.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".handoff/handoffs/codex.md",
    ".handoff/handoffs/claude.md"
  ];
  const leaks: string[] = [];
  for (const output of outputs) {
    const content = readFile(workDir, output);
    for (const [label, secret] of secrets) {
      if (content.includes(secret)) {
        leaks.push(`${output}: ${label}`);
      }
    }
  }
  return {
    status: leaks.length === 0 ? "PASS" : "FAIL",
    knownFakeSecretsTested: secrets.map(([label]) => label),
    outputsScanned: outputs,
    leaks
  };
}

function renderMarkdown(report: BenchmarkReport): string {
  const totalRaw = Number(report.keyResults["Total raw benchmark tokens"]);
  const totalHandoff = Number(report.keyResults["Total handoff tokens"]);
  return [
    "# Handoff Benchmark Report",
    "",
    `In deterministic local fixture benchmarks, Handoff reduced ${formatInteger(totalRaw)} raw context tokens to ${formatInteger(totalHandoff)} handoff tokens while preserving ${report.keyResults["Mean critical-fact recall"]} of handoff-critical facts.`,
    "",
    "The stress fixtures are deterministic synthetic workloads designed to simulate large test logs, noisy transcripts, large diffs, and repeated agent-session context. They are useful for measuring compaction behavior under scale, but they are not production telemetry or real agent-execution results.",
    "",
    "## Key Results",
    table(["Metric", "Value"], Object.entries(report.keyResults)),
    "",
    "## Environment Metadata",
    table(["Field", "Value"], Object.entries(report.environment)),
    "",
    "## Correctness Fixture Results",
    table(
      ["Fixture", "Original tokens", "Handoff tokens", "Compression", "Critical recall", "Budget recall", "Contradictions"],
      correctnessFixtures.map((fixture) => {
        const compression = report.compression.find((row) => row.fixture === fixture)!;
        const accuracy = report.accuracy.find((row) => row.fixture === fixture)!;
        return [
          fixture,
          String(compression.originalTokens),
          String(compression.handoffTokens),
          percent(compression.compressionRatio),
          percent(accuracy.fuzzyRecall),
          percent(accuracy.budgetRecall),
          String(accuracy.contradictionCount)
        ];
      })
    ),
    "",
    "## Stress Fixture Results",
    "",
    "Stress fixtures contain large amounts of repeated logs, stale agent-session text, noisy diffs, and irrelevant output. Handoff's handoff remains small because it extracts the current task, relevant files, decisions, constraints, failures, commands, and next step instead of preserving raw transcript text.",
    "",
    table(
      ["Fixture", "Original tokens", "Handoff tokens", "Compression", "Critical recall", "Budget recall", "Contradictions"],
      stressFixtures.map((fixture) => {
        const compression = report.compression.find((row) => row.fixture === fixture)!;
        const accuracy = report.accuracy.find((row) => row.fixture === fixture)!;
        return [
          fixture,
          String(compression.originalTokens),
          String(compression.handoffTokens),
          percent(compression.compressionRatio),
          percent(accuracy.fuzzyRecall),
          percent(accuracy.budgetRecall),
          String(accuracy.contradictionCount)
        ];
      })
    ),
    "",
    "## Compression Performance",
    table(
      ["Fixture", "Group", "Original tokens", "Handoff tokens", "Saved tokens", "Compression ratio", "Latency ms"],
      [...report.compression, report.compressionTotal].map((row) => [
        row.fixture,
        row.group,
        String(row.originalTokens),
        String(row.handoffTokens),
        String(row.savedTokens),
        percent(row.compressionRatio),
        row.latencyMs.toFixed(1)
      ])
    ),
    "",
    "## Handoff Accuracy",
    table(
      ["Fixture", "Group", "Exact recall", "Fuzzy recall", "Precision", "Contradictions", "Budget recall", "Redaction", "Overall field recall"],
      report.accuracy.map((row) => [
        row.fixture,
        row.group,
        percent(row.exactRecall),
        percent(row.fuzzyRecall),
        percent(row.precision),
        String(row.contradictionCount),
        percent(row.budgetRecall),
        yesNo(row.redactionPassed),
        percent(row.overallRecall)
      ])
    ),
    "",
    "## Baseline Comparison",
    table(
      ["Fixture", "Group", "Mode", "Tokens", "Critical-fact presence"],
      report.baseline.map((row) => [row.fixture, row.group, row.mode, String(row.tokens), percent(row.criticalFactPresence)])
    ),
    "",
    "## Truncation Resistance",
    table(
      ["Fixture", "Raw Transcript", "First 2k Tokens", "Last 2k Tokens", "Handoff Handoff"],
      report.truncationResistance.map((row) => [
        row.fixture,
        percent(row.rawTranscript),
        percent(row.first2kTokens),
        percent(row.last2kTokens),
        percent(row.handoffHandoff)
      ])
    ),
    "",
    "## Budget Stress",
    table(
      ["Fixture", "Group", "Budget", "Handoff tokens", "Critical-fact recall"],
      report.budgetStress.map((row) => [row.fixture, row.group, String(row.budgetTokens), String(row.handoffTokens), percent(row.criticalFactRecall)])
    ),
    "",
    "## E2E Claude-to-Codex",
    table(
      ["Status", "AGENTS.md exists", "Managed block exists", "Handoff tokens", "Within budget", "Redaction passed"],
      [[report.e2e.status, yesNo(report.e2e.agentsMdExists), yesNo(report.e2e.managedBlockExists), String(report.e2e.handoffTokens), yesNo(report.e2e.withinBudget), yesNo(report.e2e.redactionPassed)]]
    ),
    "",
    "## Latency Overhead",
    table(
      ["Operation", "P50 ms", "P95 ms", "P99 ms", "Mean ms"],
      report.latency.map((row) => [row.operation, row.p50.toFixed(1), row.p95.toFixed(1), row.p99.toFixed(1), row.mean.toFixed(1)])
    ),
    "",
    "## Redaction Checks",
    table(
      ["Known fake secrets tested", "Outputs scanned", "Status"],
      [[report.redaction.knownFakeSecretsTested.join(", "), report.redaction.outputsScanned.join(", "), report.redaction.status]]
    ),
    report.redaction.leaks.length > 0 ? `\nLeaks:\n${report.redaction.leaks.map((leak) => `- ${leak}`).join("\n")}` : "",
    "",
    "## Reproducing Results",
    "",
    "```bash",
    "pnpm install",
    "pnpm run bench -- --format markdown",
    "pnpm run bench -- --format json",
    "pnpm run bench -- --out BENCHMARKS.md",
    "```",
    "",
    "Use `pnpm run bench:compression`, `pnpm run bench:recall`, and `pnpm run bench:e2e` for narrower checks. Real-agent continuation benchmarks comparing no handoff, raw transcript, naive truncation, and Handoff handoff are planned next."
  ]
    .filter((part) => part !== "")
    .join("\n");
}

function table(headers: string[], rows: Array<Array<string>>): string {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

function parseArgs(argv: string[]): { format: Format; out?: string } {
  let format: Format = "markdown";
  let out: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--format") {
      const value = argv[index + 1];
      if (value !== "markdown" && value !== "json") {
        throw new Error("--format must be markdown or json.");
      }
      format = value;
      index += 1;
    } else if (arg === "--out") {
      out = argv[index + 1];
      if (!out) {
        throw new Error("--out requires a file path.");
      }
      index += 1;
    } else {
      throw new Error(`Unknown benchmark argument: ${arg}`);
    }
  }
  return { format, out };
}

function stateItems(state: any): string[] {
  return [
    state.working.currentTask,
    ...state.working.touchedFiles,
    ...state.episodic.decisions.map((item: any) => item.content),
    ...state.working.constraints.map((item: any) => item.content),
    ...state.working.failures.map((item: any) => item.content),
    ...state.working.lastCommands,
    ...state.working.nextSteps.map((item: any) => item.content)
  ];
}

function expectedItemsFromFixture(expected: any): string[] {
  return [
    expected.currentTask,
    ...expected.touchedFiles,
    ...expected.decisions,
    ...expected.constraints,
    ...expected.failures,
    ...expected.lastCommands,
    ...expected.nextSteps
  ];
}

function contradictionCount(text: string): number {
  const lower = text.toLowerCase();
  const patterns: Array<[string, string]> = [
    ["do not add redis", "add redis"],
    ["do not rewrite", "rewrite the auth provider"],
    ["do not change", "change session cookie format"],
    ["keep html export behavior unchanged", "change html export behavior"]
  ];
  return patterns.filter(([constraint, contradiction]) => lower.includes(constraint) && lower.includes(contradiction) && lower.indexOf(contradiction) < lower.indexOf(constraint)).length;
}

function containsKnownFakeSecret(text: string): boolean {
  return [
    "sk-test-123",
    "ANTHROPIC_API_KEY=abc123",
    "postgres://user:pass@host/db",
    "JWT_SECRET=supersecret",
    "fake-private-key"
  ].some((secret) => text.includes(secret));
}

function summarizeLatency(operation: string, samples: number[]): LatencyRow {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    operation,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    mean: sorted.reduce((sum, sample) => sum + sample, 0) / sorted.length
  };
}

function percentile(sortedSamples: number[], rank: number): number {
  assert(sortedSamples.length > 0, "Latency benchmark had no samples.");
  const index = Math.min(sortedSamples.length - 1, Math.ceil(rank * sortedSamples.length) - 1);
  return sortedSamples[index];
}

function packageVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as { version?: string };
  return pkg.version ?? "unknown";
}

function gitCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "not available";
  }
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
