import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const cli = path.join(root, "dist", "cli.js");

test("initializes store, records notes, compacts, and compiles Codex handoff", () => {
  const cwd = makeTempDir();
  execFileSync("git", ["init"], { cwd, stdio: "ignore" });
  fs.writeFileSync(path.join(cwd, "example.ts"), "export const value = 1;\n");

  run(cwd, "init");
  run(cwd, "note", "--type", "task", "--text", "Fix OAuth redirect failure in production.");
  run(cwd, "note", "--type", "decision", "--text", "Do not rewrite the auth provider.");
  run(cwd, "note", "--type", "failure", "--text", "session.test.ts fails because session token is undefined.");
  run(cwd, "note", "--type", "next", "--text", "Inspect redirect URI construction.");
  run(cwd, "capture");
  run(cwd, "compact");
  run(cwd, "compile", "--agent", "codex");

  const state = JSON.parse(fs.readFileSync(path.join(cwd, ".handoff", "state.json"), "utf8"));
  assert.equal(state.working.currentTask, "Fix OAuth redirect failure in production.");
  assert.deepEqual(state.episodic.decisions.map((item) => item.content), ["Do not rewrite the auth provider."]);
  assert.ok(state.working.touchedFiles.includes("example.ts"));

  const agents = fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8");
  assert.match(agents, /<!-- handoff:start -->/);
  assert.match(agents, /Fix OAuth redirect failure/);
  assert.match(agents, /Do not rewrite the auth provider/);
  assert.match(agents, /Inspect redirect URI construction/);
});

test("compile preserves user-authored content outside managed block", () => {
  const cwd = makeTempDir();
  fs.writeFileSync(path.join(cwd, "AGENTS.md"), "# Existing Guidance\n\nKeep this.\n");

  run(cwd, "init");
  run(cwd, "note", "--type", "task", "--text", "Continue implementation.");
  run(cwd, "compact");
  run(cwd, "compile", "--agent", "codex");
  run(cwd, "note", "--type", "decision", "--text", "Preserve managed sections only.");
  run(cwd, "compact");
  run(cwd, "compile", "--agent", "codex");

  const agents = fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8");
  assert.match(agents, /# Existing Guidance/);
  assert.match(agents, /Keep this\./);
  assert.equal((agents.match(/<!-- handoff:start -->/g) ?? []).length, 1);
  assert.match(agents, /Preserve managed sections only/);
});

test("run creates a session, imports summary.md, and switch codex generates handoff", () => {
  const cwd = makeTempDir();
  execFileSync("git", ["init"], { cwd, stdio: "ignore" });
  writeAgentScript(
    cwd,
    `import fs from "node:fs";
fs.mkdirSync("lib/auth", { recursive: true });
fs.writeFileSync("lib/auth/google.ts", "export const redirect = 'changed';\\n");
fs.writeFileSync(process.env.HANDOFF_SESSION_SUMMARY, \`## Current Task
Fix Google OAuth redirect bug

## Files Changed
- lib/auth/google.ts

## Decisions
- Do not rewrite the auth provider

## Constraints
- Preserve existing email login behavior

## Failures
- Production callback returns 400

## Commands Run
- pnpm test auth

## Next Step
Check redirect URI construction
\`);
`
  );

  run(cwd, "init");
  setAgentCommand(cwd, "claude", "node agent.mjs");
  const output = run(cwd, "run", "claude");
  assert.match(output, /Recorded session/);

  const sessions = fs.readdirSync(path.join(cwd, ".handoff", "sessions"));
  assert.equal(sessions.length, 1);
  assert.ok(fs.existsSync(path.join(cwd, ".handoff", "sessions", sessions[0], "instructions.md")));
  assert.ok(fs.existsSync(path.join(cwd, ".handoff", "sessions", sessions[0], "summary.md")));

  const switchOutput = run(cwd, "switch", "codex");
  assert.match(switchOutput, /Next: run `codex`/);

  const agents = fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8");
  assert.match(agents, /Fix Google OAuth redirect bug/);
  assert.match(agents, /lib\/auth\/google.ts/);
  assert.match(agents, /Do not rewrite the auth provider/);
  assert.match(agents, /Production callback returns 400/);
  assert.match(agents, /Check redirect URI construction/);
});

test("run fallback without summary still captures branch and changed files", () => {
  const cwd = makeTempDir();
  execFileSync("git", ["init"], { cwd, stdio: "ignore" });
  writeAgentScript(
    cwd,
    `import fs from "node:fs";
fs.mkdirSync("src", { recursive: true });
fs.writeFileSync("src/fallback.ts", "export const fallback = true;\\n");
`
  );

  run(cwd, "init");
  setAgentCommand(cwd, "claude", "node agent.mjs");
  run(cwd, "run", "claude");
  run(cwd, "switch", "codex");

  const agents = fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8");
  assert.match(agents, /Continue work from latest agent session/);
  assert.match(agents, /src\/fallback.ts/);
  assert.match(agents, /Current Branch/);
});

test("session summaries are redacted before state and handoffs are written", () => {
  const cwd = makeTempDir();
  writeAgentScript(
    cwd,
    `import fs from "node:fs";
fs.writeFileSync(process.env.HANDOFF_SESSION_SUMMARY, \`## Current Task
Remove leaked credentials

## Files Changed
- lib/auth/env.ts

## Decisions
- Redact before writing events

## Constraints
- Keep labels

## Failures
- OPENAI_API_KEY=sk-test-123 appeared in output
- DATABASE_URL=postgres://user:pass@host/db appeared in state

## Commands Run
- pnpm test redaction

## Next Step
Apply recursive redaction
\`);
`
  );

  run(cwd, "init");
  setAgentCommand(cwd, "claude", "node agent.mjs");
  run(cwd, "run", "claude");
  run(cwd, "switch", "codex");

  const scanned = [
    ".handoff/events.jsonl",
    ".handoff/state.json",
    ".handoff/state.md",
    ".handoff/handoffs/codex.md",
    "AGENTS.md"
  ].map((file) => fs.readFileSync(path.join(cwd, file), "utf8").join?.() ?? fs.readFileSync(path.join(cwd, file), "utf8"));

  for (const content of scanned) {
    assert.doesNotMatch(content, /sk-test-123/);
    assert.doesNotMatch(content, /postgres:\/\/user:pass@host\/db/);
  }
});

test("run archives raw session artifacts and learn applies guidance", () => {
  const cwd = makeTempDir();
  writeAgentScript(
    cwd,
    `import fs from "node:fs";
fs.writeFileSync(process.env.HANDOFF_SESSION_SUMMARY, \`## Current Task
Learn from failure

## Files Changed
- src/learn.ts

## Decisions
- Keep learned guidance local

## Constraints
- Review learned guidance before relying on it

## Failures
- Previous retry bug was resolved

## Commands Run
- pnpm test

## Next Step
Apply learned guidance
\`);
`
  );

  run(cwd, "init");
  setAgentCommand(cwd, "claude", "node agent.mjs");
  run(cwd, "run", "claude");
  run(cwd, "note", "--type", "resolved", "--text", "Previous retry bug was resolved");
  run(cwd, "compact");
  const learnOutput = run(cwd, "learn", "--apply");

  const sessions = fs.readdirSync(path.join(cwd, ".handoff", "sessions"));
  const rawDir = path.join(cwd, ".handoff", "sessions", sessions[0], "raw");
  assert.ok(fs.existsSync(path.join(rawDir, "summary.md")));
  assert.match(learnOutput, /Handoff Learned Guidance/);
  assert.ok(fs.existsSync(path.join(cwd, ".handoff", "learned.md")));
  assert.match(fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8"), /Keep learned guidance local/);
});

test("mcp server lists tools over stdio", () => {
  const cwd = makeTempDir();
  run(cwd, "init");
  const childInput = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n";
  const output = execFileSync("node", [cli, "mcp", "serve"], {
    cwd,
    input: childInput,
    encoding: "utf8",
    timeout: 1000
  });
  assert.match(output, /get_current_task/);
  assert.match(output, /get_latest_handoff/);
});

function run(cwd, ...args) {
  return execFileSync("node", [cli, ...args], {
    cwd,
    encoding: "utf8"
  });
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "handoff-test-"));
}

function writeAgentScript(cwd, source) {
  fs.writeFileSync(path.join(cwd, "agent.mjs"), source);
}

function setAgentCommand(cwd, agent, command) {
  const configPath = path.join(cwd, "handoff.config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.agents[agent].command = command;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}
