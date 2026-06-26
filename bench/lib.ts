import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

export interface ExpectedState {
  currentTask: string;
  touchedFiles: string[];
  decisions: string[];
  constraints: string[];
  failures: string[];
  lastCommands: string[];
  nextSteps: string[];
}

export interface PreparedFixture {
  name: string;
  group: FixtureGroup;
  fixtureDir: string;
  workDir: string;
  rawContext: string;
  expected: ExpectedState;
  criticalFacts: string[];
}

export const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
export const cliPath = path.join(repoRoot, "dist", "cli.js");
export const fixturesRoot = path.join(repoRoot, "bench", "fixtures");
export type FixtureGroup = "correctness" | "stress";

export const correctnessFixtures = ["oauth-bug", "failing-tests", "refactor-session", "budget-pressure", "secret-heavy-session"];
export const stressFixtures = ["huge-test-log", "long-agent-session", "noisy-logs", "large-diff", "raw-transcript-baseline"];

export function fixtureNames(): string[] {
  return [...correctnessFixtures, ...stressFixtures];
}

export function prepareFixture(name: string): PreparedFixture {
  const fixtureDir = path.join(fixturesRoot, name);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `handoff-bench-${name}-`));
  runCli(workDir, "init");
  fs.copyFileSync(path.join(fixtureDir, "events.jsonl"), path.join(workDir, ".handoff", "events.jsonl"));
  const group = stressFixtures.includes(name) ? "stress" : "correctness";
  const seedRawContext = fs.readFileSync(path.join(fixtureDir, "raw-context.md"), "utf8");
  const expected = JSON.parse(fs.readFileSync(path.join(fixtureDir, "expected-state.json"), "utf8")) as ExpectedState;
  const criticalFactsPath = path.join(fixtureDir, "expected-critical-facts.json");
  const criticalFacts = fs.existsSync(criticalFactsPath)
    ? (JSON.parse(fs.readFileSync(criticalFactsPath, "utf8")) as string[])
    : [
        expected.currentTask,
        ...expected.touchedFiles,
        ...expected.decisions,
        ...expected.constraints,
        ...expected.failures,
        ...expected.nextSteps
      ];
  const rawContext = group === "stress" ? expandStressRawContext(name, seedRawContext, expected) : seedRawContext;
  return { name, group, fixtureDir, workDir, rawContext, expected, criticalFacts };
}

export function runCli(cwd: string, ...args: string[]): string {
  return execFileSync("node", [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

export function timed<T>(fn: () => T): { value: T; ms: number } {
  const started = performance.now();
  const value = fn();
  return {
    value,
    ms: performance.now() - started
  };
}

export function readState(workDir: string): any {
  return JSON.parse(fs.readFileSync(path.join(workDir, ".handoff", "state.json"), "utf8"));
}

export function readFile(workDir: string, relativePath: string): string {
  return fs.readFileSync(path.join(workDir, relativePath), "utf8");
}

export function estimateTokens(text: string): number {
  return text.trim() ? Math.ceil(text.length / 4) : 0;
}

export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function itemRecall(actualItems: string[], expectedItems: string[]): number {
  if (expectedItems.length === 0) {
    return 1;
  }
  const found = expectedItems.filter((expected) => actualItems.some((actual) => normalize(actual).includes(normalize(expected))));
  return found.length / expectedItems.length;
}

export function exactItemRecall(actualItems: string[], expectedItems: string[]): number {
  if (expectedItems.length === 0) {
    return 1;
  }
  const actual = new Set(actualItems.map(normalize));
  return expectedItems.filter((expected) => actual.has(normalize(expected))).length / expectedItems.length;
}

export function precision(actualItems: string[], expectedItems: string[]): number {
  if (actualItems.length === 0) {
    return expectedItems.length === 0 ? 1 : 0;
  }
  const expected = expectedItems.map(normalize);
  const correct = actualItems.filter((actual) => expected.some((item) => normalize(actual).includes(item) || item.includes(normalize(actual))));
  return correct.length / actualItems.length;
}

export function criticalPresence(text: string, facts: string[]): number {
  if (facts.length === 0) {
    return 1;
  }
  const normalized = normalize(text);
  return facts.filter((fact) => normalized.includes(normalize(fact))).length / facts.length;
}

export function scalarRecall(actual: string, expected: string): number {
  return normalize(actual).includes(normalize(expected)) ? 1 : 0;
}

export function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function expandStressRawContext(name: string, seed: string, expected: ExpectedState): string {
  const distributedFacts = distributeFacts(expected);
  const generators: Record<string, () => string> = {
    "huge-test-log": () =>
      stagedStress(distributedFacts, [
        "FAIL tests/checkout/retry.test.ts > retries failed checkout request",
        "    at tests/checkout/retry.test.ts:42:18",
        "    at src/checkout/retry.ts:31:12",
        "    at node_modules/vitest/dist/runner.js:100:10",
        "stdout | checkout retry | scheduling retry after 250ms",
        "stderr | retry worker | fake timers have not advanced",
        "info test-runner collected 918 unrelated tests",
        "warn open handle detected: Timeout",
        "PASS tests/unrelated/health.test.ts"
      ], 420),
    "long-agent-session": () =>
      stagedStress(distributedFacts, [
        "Assistant: reading src/index/search-index.ts and src/index/file-walker.ts again.",
        "Assistant: stale idea rejected: replace lexical index with embeddings.",
        "Assistant: stale idea rejected: introduce cloud sync for index files.",
        "Tool output: pnpm run build passed after TypeScript error in file-walker.ts was fixed.",
        "Resolved failure retained only in history: TypeScript error in file-walker.ts is fixed.",
        "Exploration note: watcher daemon deferred because index remains local-only.",
        "Dead end: cloud sync is out of scope for this migration."
      ], 520),
    "noisy-logs": () =>
      stagedStress(distributedFacts, [
        "INFO websocket heartbeat received",
        "INFO websocket reconnect attempt scheduled",
        "WARN websocket reconnect jitter exceeded expected window",
        "WARN websocket reconnect already pending",
        "DEBUG socket state CONNECTING",
        "DEBUG socket state CLOSED",
        "ERROR ECONNRESET while reconnecting websocket",
        "    at tests/ws/reconnect.test.ts:58:11",
        "    at src/ws/client.ts:87:14"
      ], 290),
    "large-diff": () =>
      stagedStress(distributedFacts, [
        "diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml",
        "+  generated dependency metadata repeated for benchmark scale",
        "-  generated dependency metadata repeated for benchmark scale",
        "diff --git a/generated/settings-snapshot.json b/generated/settings-snapshot.json",
        "+  large generated snapshot line that should not become handoff state",
        "diff --git a/generated/client.ts b/generated/client.ts",
        "+  generated API client line repeated for scale",
        "diff --git a/storybook-static/assets.json b/storybook-static/assets.json",
        "+  generated static asset manifest noise"
      ], 240),
    "raw-transcript-baseline": () =>
      stagedStress(distributedFacts, [
        "Assistant reasoning: maybe change renderer, maybe change serializer, maybe inspect snapshots.",
        "Rejected idea: change HTML export behavior.",
        "Tool output: repeated full markdown serializer omitted from useful handoff.",
        "Assistant pasted a complete renderer file that is not needed for handoff.",
        "Assistant debated table escaping and list serialization.",
        "Tool output: snapshot diff repeated with unchanged report sections."
      ], 360)
  };
  return `# Synthetic Stress Transcript: ${name}\n\n${generators[name]?.() ?? seed}`;
}

function repeatBlock(lines: string[], count: number): string {
  const block = `${lines.join("\n")}\n`;
  return block.repeat(count);
}

function stagedStress(facts: string[], noiseLines: string[], repeatCount: number): string {
  const one = Math.floor(repeatCount * 0.25);
  const two = Math.floor(repeatCount * 0.35);
  const three = Math.floor(repeatCount * 0.25);
  const four = repeatCount - one - two - three;
  return [
    "## Session Start",
    facts[0],
    repeatBlock(noiseLines, one),
    "## Middle Failed Attempt And Constraint",
    facts.slice(1, 3).join("\n"),
    repeatBlock(noiseLines, two),
    "## Late Middle Changed Files And Active Failure",
    facts.slice(3, 6).join("\n"),
    repeatBlock(noiseLines, three),
    "## Final State",
    facts.slice(6).join("\n"),
    repeatBlock(noiseLines, four)
  ].join("\n");
}

function distributeFacts(expected: ExpectedState): string[] {
  return [
    `Current task: ${expected.currentTask}`,
    ...expected.constraints.map((item) => `Constraint: ${item}`),
    ...expected.decisions.map((item) => `Decision: ${item}`),
    ...expected.touchedFiles.map((item) => `Touched file: ${item}`),
    ...expected.failures.map((item) => `Failure: ${item}`),
    ...expected.lastCommands.map((item) => `Command: ${item}`),
    ...expected.nextSteps.map((item) => `Next step: ${item}`)
  ];
}
