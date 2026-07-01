# ctxcarry

<p align="center">
  <img src="./assets/ctxcarry-ascii.svg" width="100%" alt="ctxcarry" />
</p>

Local-first loop engineering for coding agents.

ctxcarry helps developers run Claude, Codex, and other coding agents without losing context, polluting the main repo, or trusting unreviewed generated code.

It stores durable project memory in `.ctxcarry/`, writes compact handoffs for the next agent, runs verification, isolates work in git worktrees, and supports generator/evaluator loops where one agent writes the change and another reviews it.

The core idea:

Coding agents should not own your context. Your repo should.

## Demo

![ctxcarry demo](./ctxcarry%20gif.gif)

Before asking for stars, add:

- `LICENSE`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `docs/demo.md`
- `docs/loop-engineering.md`
- `examples/`
- `assets/demo.gif`
- GitHub Actions CI badge
- npm package publishing, if ready

Local-first memory, handoff, and loop orchestration for coding agents.

`ctxcarry` keeps agent work durable across Claude, Codex, and other local coding
tools. It records what happened, prepares compact handoffs, runs verification,
isolates tasks in git worktrees, and can run generator/evaluator loops on a
schedule.

The goal is simple: make agent work reviewable, repeatable, and recoverable
without sending your project state to a hosted coordination service.

## What It Does

- Stores durable project memory under `.ctxcarry/`.
- Captures session summaries, decisions, constraints, failures, and next steps.
- Writes handoff blocks into `AGENTS.md` or `CLAUDE.md`.
- Runs verification and stores pass/fail artifacts.
- Creates isolated git worktrees for agent tasks.
- Runs generator/evaluator loops so the author does not grade its own work.
- Discovers local tasks from failed checks, board items, failed loops, and TODOs.
- Schedules unattended local loops with macOS `launchd`.
- Keeps token use under control with compact handoffs, trimmed artifacts, and loop limits.

## Security Note

Unknown repositories and agents can be risky. Treat agent execution as untrusted automation: review setup commands, inspect diffs, run verification, and prefer isolated worktrees before letting generated changes near your main checkout. Recent reporting around AI coding agents has highlighted how agents can be manipulated into running malicious setup commands from seemingly normal repositories, so ctxcarry is designed around local state, reviewable artifacts, verification, and generator/evaluator separation.

## Quick Start

Install and build from this repository:

```bash
pnpm install
pnpm build
npm install -g .
```

Initialize a project:

```bash
ctxcarry init
```

Run a normal wrapped agent session:

```bash
ctxcarry run codex
```

Run a generator/evaluator loop:

```bash
ctxcarry loop \
  --task "Fix the failing tests" \
  --generator codex \
  --evaluator codex
```

Discover local work and run the top task:

```bash
ctxcarry discover
ctxcarry loop --from-discovery --generator codex --evaluator codex
```

## How It Works

```text
Repo
  |
  |  ctxcarry discover
  v
Discovered task
  |
  |  ctxcarry loop
  v
Isolated git worktree
  |
  |  generator agent writes changes
  v
Verification runs in that worktree
  |
  |  evaluator agent reviews diff + verification
  v
Verdict: PASS / FAIL / NEEDS_REVIEW
  |
  v
.ctxcarry/board.md + .ctxcarry/loops/<id>/
```

The important rule is separation: the generator writes the change, and the
evaluator assumes the change is broken until it proves otherwise.

## Core Concepts

### Memory

ctxcarry writes local state to disk:

```text
.ctxcarry/state.json
.ctxcarry/state.md
.ctxcarry/events.jsonl
.ctxcarry/sessions/<session-id>/
```

Sessions are expected to write a short `summary.md` with durable state. Future
agents can continue from that summary without rereading the entire conversation.

### Handoffs

Compile a handoff for another agent:

```bash
ctxcarry compile --agent codex --budget 4000
ctxcarry switch claude --budget 4000
```

For Codex, ctxcarry writes a managed block in `AGENTS.md`. For Claude, it writes
to `CLAUDE.md`.

### Verification

`ctxcarry verify` runs the configured commands from `ctxcarry.config.json` and
stores artifacts:

```text
.ctxcarry/verification/latest.md
.ctxcarry/verification/<timestamp>.json
```

Typical generated config for this repo:

```json
{
  "verify": {
    "commands": ["pnpm test", "pnpm build"]
  }
}
```

### Worktrees

Worktrees keep agent tasks isolated from your main checkout:

```bash
ctxcarry worktree create "Fix flaky test"
ctxcarry worktree list
ctxcarry worktree clean --force
```

Loop runs use this same idea automatically.

### Loops

Run one task through a generator and evaluator:

```bash
ctxcarry loop \
  --task "Improve README command examples" \
  --generator codex \
  --evaluator codex
```

Loop artifacts are written to:

```text
.ctxcarry/loops/<loop-id>/task.txt
.ctxcarry/loops/<loop-id>/diff.md
.ctxcarry/loops/<loop-id>/verification.md
.ctxcarry/loops/<loop-id>/evaluator.md
.ctxcarry/loops/<loop-id>/verdict.md
```

The evaluator writes one of:

```text
PASS
FAIL
NEEDS_REVIEW
```

### Discovery

Discovery finds local work:

```bash
ctxcarry discover
ctxcarry discover --skip-verify --limit 5
ctxcarry discover --json
```

Current sources:

- failed `ctxcarry verify`
- `.ctxcarry/board.md` tasks
- failed or incomplete loop verdicts
- `TODO` and `FIXME` markers

Discovery writes:

```text
.ctxcarry/discovery/latest.md
.ctxcarry/discovery/latest.json
```

### Scheduling

Install a local macOS schedule:

```bash
ctxcarry schedule install \
  --every 1h \
  --limit 1 \
  --allow-dirty \
  --generator codex \
  --evaluator codex \
  --timeout-seconds 1800
```

Run it manually:

```bash
ctxcarry schedule run \
  --limit 1 \
  --allow-dirty \
  --generator codex \
  --evaluator codex \
  --timeout-seconds 1800
```

Inspect or remove it:

```bash
ctxcarry schedule status
ctxcarry schedule uninstall
```

Schedule logs are stored in:

```text
.ctxcarry/schedule/
```

## Token Control

Loop engineering can get expensive. ctxcarry uses a conservative default model:

- compact handoffs instead of full transcripts
- summarized verification output
- trimmed diff artifacts in evaluator prompts
- one scheduled loop per run by default
- explicit timeouts for scheduled jobs
- token estimates via `ctxcarry tokens`

Useful commands:

```bash
ctxcarry tokens --agent codex --budget 4000
ctxcarry compact
```

Recommended operating pattern:

- Use cheap/default agents for discovery and simple tasks.
- Use stronger or more expensive models only for high-risk generator/evaluator runs.
- Keep scheduled runs limited until the loop has proven useful on real work.
- Do not treat a `PASS` verdict as a substitute for human judgment on important code.

## Command Reference

```text
ctxcarry init
ctxcarry setup [--aliases]
ctxcarry capture [--agent claude]
ctxcarry note --type decision|failure|todo|constraint|task|next|resolved --text "..."
ctxcarry run <agent> [--prompt "..."]
ctxcarry enter <agent> [--no-launch]
ctxcarry compact
ctxcarry compile --agent codex|claude [--budget 4000]
ctxcarry switch <agent> [--budget 4000]
ctxcarry verify
ctxcarry board
ctxcarry worktree <create|list|clean>
ctxcarry discover [--limit 10] [--json] [--skip-verify]
ctxcarry loop --task "..." --generator codex --evaluator codex
ctxcarry loop --from-discovery [--limit 1] [--allow-dirty]
ctxcarry schedule <install|uninstall|status|run>
ctxcarry status
ctxcarry tokens [--agent codex] [--budget 4000]
ctxcarry learn [--apply]
ctxcarry mcp serve
```

## MCP Retrieval

ctxcarry can expose local session memory to MCP-compatible clients:

```bash
ctxcarry mcp serve
```

Available tools include:

- `get_relevant_session_events`
- `expand_session_artifact`

## When To Use It

Use ctxcarry when you:

- work with multiple coding agents
- want durable context across sessions
- need local worktree isolation
- want evaluator review before trusting generated code
- want scheduled maintenance loops while keeping state local

Skip or keep it manual when:

- the repo has weak or unreliable verification
- the task requires high product judgment
- token cost matters more than automation
- you are not prepared to review generated changes

## Safety Notes

- Generated work happens in git worktrees.
- Verification results and verdicts are stored on disk.
- Secret-looking values are redacted in stored outputs.
- Worktree cleanup requires `--force`.
- Scheduled jobs should use `--timeout-seconds`.
- Commit ctxcarry changes before relying on loop worktrees; worktrees are based on git state.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm run bench
```

Useful scripts:

- `pnpm build` compiles TypeScript.
- `pnpm test` builds and runs the Node test suite.
- `pnpm run smoke` builds and prints CLI help.
- `pnpm run bench` runs benchmark tooling.

## Status

ctxcarry is local-first agent infrastructure. It is intentionally plain:
Markdown, JSON, git worktrees, shell commands, and MCP. The core idea is not to
hide agent work. The core idea is to make it inspectable.
