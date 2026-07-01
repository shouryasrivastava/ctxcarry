import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const cli = path.join(root, "dist", "cli.js");

test("initializes store, records notes, compacts, and compiles Codex ctxcarry", () => {
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

  const state = JSON.parse(fs.readFileSync(path.join(cwd, ".ctxcarry", "state.json"), "utf8"));
  assert.equal(state.working.currentTask, "Fix OAuth redirect failure in production.");
  assert.deepEqual(state.episodic.decisions.map((item) => item.content), ["Do not rewrite the auth provider."]);
  assert.ok(state.working.touchedFiles.includes("example.ts"));

  const agents = fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8");
  assert.match(agents, /<!-- ctxcarry:start -->/);
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
  assert.equal((agents.match(/<!-- ctxcarry:start -->/g) ?? []).length, 1);
  assert.match(agents, /Preserve managed sections only/);
});

test("run creates a session, imports summary.md, and switch codex generates ctxcarry", () => {
  const cwd = makeTempDir();
  execFileSync("git", ["init"], { cwd, stdio: "ignore" });
  writeAgentScript(
    cwd,
    `import fs from "node:fs";
fs.mkdirSync("lib/auth", { recursive: true });
fs.writeFileSync("lib/auth/google.ts", "export const redirect = 'changed';\\n");
fs.writeFileSync(process.env.CTXCARRY_SESSION_SUMMARY, \`## Current Task
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

  const sessions = fs.readdirSync(path.join(cwd, ".ctxcarry", "sessions"));
  assert.equal(sessions.length, 1);
  assert.ok(fs.existsSync(path.join(cwd, ".ctxcarry", "sessions", sessions[0], "instructions.md")));
  assert.ok(fs.existsSync(path.join(cwd, ".ctxcarry", "sessions", sessions[0], "summary.md")));

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

test("session summaries are redacted before state and ctxcarrys are written", () => {
  const cwd = makeTempDir();
  writeAgentScript(
    cwd,
    `import fs from "node:fs";
fs.writeFileSync(process.env.CTXCARRY_SESSION_SUMMARY, \`## Current Task
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
    ".ctxcarry/events.jsonl",
    ".ctxcarry/state.json",
    ".ctxcarry/state.md",
    ".ctxcarry/ctxcarrys/codex.md",
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
fs.writeFileSync(process.env.CTXCARRY_SESSION_SUMMARY, \`## Current Task
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

  const sessions = fs.readdirSync(path.join(cwd, ".ctxcarry", "sessions"));
  const rawDir = path.join(cwd, ".ctxcarry", "sessions", sessions[0], "raw");
  assert.ok(fs.existsSync(path.join(rawDir, "summary.md")));
  assert.match(learnOutput, /ctxcarry Learned Guidance/);
  assert.ok(fs.existsSync(path.join(cwd, ".ctxcarry", "learned.md")));
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
  assert.match(output, /get_latest_ctxcarry/);
});

function run(cwd, ...args) {
  return execFileSync("node", [cli, ...args], {
    cwd,
    encoding: "utf8"
  });
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ctxcarry-test-"));
}

test("setup detects package manager and verify commands", () => {
  const cwd = makeTempDir();
  fs.writeFileSync(path.join(cwd, "pnpm-lock.yaml"), "");
  fs.writeFileSync(
    path.join(cwd, "package.json"),
    JSON.stringify({ scripts: { test: "node test.js", lint: "eslint .", typecheck: "tsc", build: "tsc -p ." } }),
  );

  const output = execFileSync("node", [cli, "setup"], { cwd, encoding: "utf8" });
  const config = JSON.parse(fs.readFileSync(path.join(cwd, "ctxcarry.config.json"), "utf8"));

  assert.match(output, /ctxcarry setup complete/);
  assert.equal(config.packageManager, "pnpm");
  assert.deepEqual(config.verify.commands, ["pnpm test", "pnpm lint", "pnpm typecheck", "pnpm build"]);
  assert.ok(fs.existsSync(path.join(cwd, ".ctxcarry", "board.md")));
});

test("enter codex prepares handoff and launches mocked command", () => {
  const cwd = makeTempDir();
  const bin = path.join(cwd, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "codex"), `#!/bin/sh\necho launched > "${path.join(cwd, "codex.log")}"\n`);
  fs.chmodSync(path.join(bin, "codex"), 0o755);

  execFileSync("node", [cli, "init"], { cwd });
  execFileSync("node", [cli, "note", "--type", "task", "--text", "Fix launch flow"], { cwd });
  execFileSync("node", [cli, "enter", "codex"], {
    cwd,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });

  assert.equal(fs.readFileSync(path.join(cwd, "codex.log"), "utf8").trim(), "launched");
  assert.match(fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8"), /Codex Handoff/);
  assert.equal(fs.existsSync(path.join(cwd, cwd.slice(1), "AGENTS.md")), false);
});

test("run passes prompt to agent command", () => {
  const cwd = makeTempDir();
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "ctxcarry-bin-"));
  fs.writeFileSync(
    path.join(bin, "codex"),
    `#!/bin/sh
printf "%s" "$*" > "${path.join(cwd, "prompt.log")}"
cat > "$CTXCARRY_SESSION_SUMMARY" <<'EOF'
## Current Task
Use prompt

## Files Changed
- None

## Decisions
- None

## Constraints
- None

## Failures
- None

## Commands Run
- None

## Next Step
Done
EOF
`,
  );
  fs.chmodSync(path.join(bin, "codex"), 0o755);

  execFileSync("node", [cli, "init"], { cwd });
  execFileSync("node", [cli, "run", "codex", "--prompt", "Fix launch flow"], {
    cwd,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });

  assert.equal(fs.readFileSync(path.join(cwd, "prompt.log"), "utf8"), "exec Fix launch flow");
});

test("verify records pass fail summaries and redacts secrets", () => {
  const cwd = makeTempDir();
  execFileSync("node", [cli, "init"], { cwd });
  const configPath = path.join(cwd, "ctxcarry.config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.verify = {
    commands: [
      "node -e \"console.log('ok')\"",
      "node -e \"console.error('OPENAI_API_KEY=sk-test-123'); process.exit(1)\"",
    ],
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  assert.throws(() => execFileSync("node", [cli, "verify"], { cwd, encoding: "utf8" }));
  const latest = fs.readFileSync(path.join(cwd, ".ctxcarry", "verification", "latest.md"), "utf8");
  const events = fs.readFileSync(path.join(cwd, ".ctxcarry", "events.jsonl"), "utf8");

  assert.match(latest, /Status: FAIL/);
  assert.doesNotMatch(latest, /sk-test-123/);
  assert.match(events, /verification/);
});

test("worktree create stores metadata and clean requires force", () => {
  const cwd = makeTempDir();
  fs.writeFileSync(path.join(cwd, "README.md"), "test\n");
  execFileSync("git", ["init"], { cwd });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });
  execFileSync("git", ["add", "README.md"], { cwd });
  execFileSync("git", ["commit", "-m", "init"], { cwd });
  execFileSync("node", [cli, "init"], { cwd });

  execFileSync("node", [cli, "worktree", "create", "Fix failing tests"], { cwd });
  const records = JSON.parse(fs.readFileSync(path.join(cwd, ".ctxcarry", "worktrees.json"), "utf8"));
  assert.equal(records.length, 1);
  assert.equal(records[0].task, "Fix failing tests");
  assert.match(records[0].branch, /^ctxcarry\/fix-failing-tests/);

  assert.throws(() => execFileSync("node", [cli, "worktree", "clean"], { cwd }));
  execFileSync("node", [cli, "worktree", "clean", "--force"], { cwd });
});

test("loop persists state and evaluator receives verification summary", () => {
  const cwd = makeTempDir();
  const bin = path.join(cwd, "bin");
  const seen = path.join(cwd, "evaluator-seen.md");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "ctxcarry"), "#!/bin/sh\nexit 0\n");
  fs.writeFileSync(
    path.join(bin, "codex"),
    `#!/bin/sh\nprintf "%s" "$CTXCARRY_EVALUATOR_INSTRUCTIONS" > "${seen}"\nprintf "PASS\\nOPENAI_API_KEY=sk-test-123\\n" > "$CTXCARRY_VERDICT_PATH"\n`,
  );
  fs.chmodSync(path.join(bin, "ctxcarry"), 0o755);
  fs.chmodSync(path.join(bin, "codex"), 0o755);
  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node -e \"console.log('ok')\"" } }));
  fs.writeFileSync(path.join(cwd, "pnpm-lock.yaml"), "");
  execFileSync("git", ["init"], { cwd });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });
  execFileSync("git", ["add", "package.json", "pnpm-lock.yaml"], { cwd });
  execFileSync("git", ["commit", "-m", "init"], { cwd });
  execFileSync("node", [cli, "setup"], { cwd });
  const configPath = path.join(cwd, "ctxcarry.config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.verify = { commands: ["node -e \"console.log('verification ok')\""] };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  execFileSync("node", [cli, "loop", "--task", "Fix failing tests", "--generator", "claude", "--evaluator", "codex"], {
    cwd,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });

  const loopsDir = path.join(cwd, ".ctxcarry", "loops");
  const loopIds = fs.readdirSync(loopsDir);
  assert.equal(loopIds.length, 1);
  const verdict = fs.readFileSync(path.join(loopsDir, loopIds[0], "verdict.md"), "utf8");
  assert.match(verdict, /PASS/);
  assert.doesNotMatch(verdict, /sk-test-123/);
  assert.match(fs.readFileSync(seen, "utf8"), /Verification/);
  assert.match(fs.readFileSync(seen, "utf8"), /\.ctxcarry\/evaluator-verdict\.md/);
  assert.match(fs.readFileSync(path.join(cwd, ".ctxcarry", "board.md"), "utf8"), /Done/);
});

test("loop verifies the generated worktree", () => {
  const cwd = makeTempDir();
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "ctxcarry-bin-"));
  const verdictPath = path.join(cwd, "seen-verdict-path.txt");
  const evaluatorInstructions = path.join(cwd, "seen-evaluator-instructions.txt");
  fs.writeFileSync(
    path.join(bin, "ctxcarry"),
    `#!/bin/sh
if [ "$1" = "setup" ]; then
  exit 0
fi
if [ "$1" = "run" ]; then
  cat > package.json <<'JSON'
{
  "scripts": {
    "test": "node -e \"process.exit(1)\""
  }
}
JSON
  exit 0
fi
exec node "${cli}" "$@"
`,
  );
  fs.writeFileSync(
    path.join(bin, "codex"),
    `#!/bin/sh
printf "%s" "$CTXCARRY_VERDICT_PATH" > "${verdictPath}"
printf "%s" "$CTXCARRY_EVALUATOR_INSTRUCTIONS" > "${evaluatorInstructions}"
printf "PASS\\n" > "$CTXCARRY_VERDICT_PATH"
`,
  );
  fs.writeFileSync(path.join(bin, "pnpm"), "#!/bin/sh\necho generated worktree verification failed >&2\nexit 1\n");
  fs.chmodSync(path.join(bin, "ctxcarry"), 0o755);
  fs.chmodSync(path.join(bin, "codex"), 0o755);
  fs.chmodSync(path.join(bin, "pnpm"), 0o755);

  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } }, null, 2));
  fs.writeFileSync(path.join(cwd, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  execFileSync("git", ["init"], { cwd, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });
  execFileSync("git", ["add", "package.json", "pnpm-lock.yaml"], { cwd });
  execFileSync("git", ["commit", "-m", "init"], { cwd, stdio: "ignore" });

  execFileSync("node", [cli, "setup"], { cwd });
  execFileSync("node", [cli, "loop", "--task", "Break generated worktree", "--generator", "codex", "--evaluator", "codex"], {
    cwd,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    encoding: "utf8",
  });

  const loops = fs.readdirSync(path.join(cwd, ".ctxcarry", "loops")).sort();
  const verification = fs.readFileSync(path.join(cwd, ".ctxcarry", "loops", loops[loops.length - 1], "verification.md"), "utf8");
  assert.match(verification, /Verification failed: pnpm test/);
});

test("discover writes ranked local tasks", () => {
  const cwd = makeTempDir();
  execFileSync("node", [cli, "init"], { cwd });
  fs.writeFileSync(path.join(cwd, ".ctxcarry", "board.md"), "# ctxcarry Board\n\n| Status | Task | Updated |\n| --- | --- | --- |\n| Failed | Fix flaky smoke test | 2026-01-01T00:00:00.000Z |\n");

  const output = execFileSync("node", [cli, "discover", "--skip-verify", "--limit", "1", "--json"], { cwd, encoding: "utf8" });
  const result = JSON.parse(output);

  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].title, "Fix flaky smoke test");
  assert.equal(result.tasks[0].source, "board");
  assert.ok(fs.existsSync(path.join(cwd, ".ctxcarry", "discovery", "latest.json")));
  assert.match(fs.readFileSync(path.join(cwd, ".ctxcarry", "discovery", "latest.md"), "utf8"), /Fix flaky smoke test/);
});

test("loop can run from discovery", () => {
  const cwd = makeTempDir();
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "ctxcarry-bin-"));
  const evaluatorInstructions = path.join(cwd, "seen-evaluator-instructions.txt");
  fs.writeFileSync(
    path.join(bin, "ctxcarry"),
    `#!/bin/sh
if [ "$1" = "setup" ]; then
  exit 0
fi
if [ "$1" = "run" ]; then
  exit 0
fi
exec node "${cli}" "$@"
`,
  );
  fs.writeFileSync(
    path.join(bin, "codex"),
    `#!/bin/sh
printf "%s" "$CTXCARRY_EVALUATOR_INSTRUCTIONS" > "${evaluatorInstructions}"
printf "PASS\\n" > "$CTXCARRY_VERDICT_PATH"
`,
  );
  fs.chmodSync(path.join(bin, "ctxcarry"), 0o755);
  fs.chmodSync(path.join(bin, "codex"), 0o755);

  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } }, null, 2));
  fs.writeFileSync(path.join(cwd, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  execFileSync("git", ["init"], { cwd, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });
  execFileSync("git", ["add", "package.json", "pnpm-lock.yaml"], { cwd });
  execFileSync("git", ["commit", "-m", "init"], { cwd, stdio: "ignore" });
  execFileSync("node", [cli, "setup"], { cwd });
  fs.writeFileSync(path.join(cwd, ".ctxcarry", "board.md"), "# ctxcarry Board\n\n| Status | Task | Updated |\n| --- | --- | --- |\n| Todo | Inspect discovered task | 2026-01-01T00:00:00.000Z |\n");

  execFileSync("node", [cli, "loop", "--from-discovery", "--generator", "codex", "--evaluator", "codex"], {
    cwd,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    encoding: "utf8",
  });

  assert.match(fs.readFileSync(evaluatorInstructions, "utf8"), /Inspect discovered task/);
  assert.match(fs.readFileSync(path.join(cwd, ".ctxcarry", "board.md"), "utf8"), /Done/);
});

test("schedule install writes launchd plist under HOME", () => {
  const cwd = makeTempDir();
  const home = makeTempDir();
  execFileSync("node", [cli, "init"], { cwd });

  execFileSync("node", [cli, "schedule", "install", "--every", "30m", "--limit", "2", "--timeout-seconds", "300"], {
    cwd,
    env: { ...process.env, HOME: home },
  });

  const plistPath = path.join(home, "Library", "LaunchAgents", "com.ctxcarry.local-loop.plist");
  const plist = fs.readFileSync(plistPath, "utf8");
  assert.match(plist, /StartInterval/);
  assert.match(plist, /1800/);
  assert.match(plist, /--limit/);
  assert.match(plist, /--timeout-seconds/);
  assert.match(plist, /300/);
});

test("schedule forwards loop options to loop runs", () => {
  const cwd = makeTempDir();
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "ctxcarry-bin-"));
  const seen = path.join(cwd, "schedule-commands.log");
  fs.writeFileSync(
    path.join(bin, "ctxcarry"),
    `#!/bin/sh
printf "%s\\n" "$*" >> "${seen}"
exit 0
`,
  );
  fs.chmodSync(path.join(bin, "ctxcarry"), 0o755);
  execFileSync("node", [cli, "init"], { cwd });

  execFileSync("node", [cli, "schedule", "run", "--limit", "1", "--allow-dirty", "--generator", "codex", "--evaluator", "codex", "--timeout-seconds", "5"], {
    cwd,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });

  const commands = fs.readFileSync(seen, "utf8");
  assert.match(commands, /discover/);
  assert.match(commands, /loop --from-discovery --limit 1 --allow-dirty --generator codex --evaluator codex/);
});

function writeAgentScript(cwd, source) {
  fs.writeFileSync(path.join(cwd, "agent.mjs"), source);
}

function setAgentCommand(cwd, agent, command) {
  const configPath = path.join(cwd, "ctxcarry.config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.agents[agent].command = command;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}
