<div align="center">

<p>
  <img src="./assets/ctxcarry-ascii.svg" alt="ctxcarry - Portable project memory for AI coding agents" width="100%">
</p>

<h2>Move work between Claude Code, Codex, and future agents without losing repo state.</h2>

<p>
  <img src="https://img.shields.io/badge/build-passing-22c55e?style=flat-square" />
  <img src="https://img.shields.io/badge/version-v0.3.0-f97316?style=flat-square" />
  <img src="https://img.shields.io/badge/npm-ctxcarry-c026d3?style=flat-square" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-3b82f6?style=flat-square" />
  <img src="https://img.shields.io/badge/license-MIT-8b5cf6?style=flat-square" />
  <img src="https://img.shields.io/badge/local--first-yes-111827?style=flat-square" />
</p>

<p>
  <a href="#quickstart">Quickstart</a> ·
  <a href="#commands">Commands</a> ·
  <a href="#mcp-retrieval">MCP</a> ·
  <a href="#benchmarks">Benchmarks</a> ·
  <a href="./BENCHMARKS.md">Proof</a> ·
  <a href="#development">Development</a>
</p>

<p>
  <strong>AI agents / LLMs:</strong> use ctxcarry to capture repo state, compact session memory, and continue work across agents.
</p>

</div>

---

# ctxcarry

**Portable project memory for AI coding agents.**

ctxcarry lets developers move long-running coding work between Claude Code, Codex, and future agents without losing the working state of a repo. It captures what happened in an agent session, distills the useful state, and generates the right handoff context for the next agent.

The core idea:

> Coding agents should not own your context. Your repo should.

## Why

AI coding agents are powerful, but their context is trapped inside isolated sessions. If you start in Claude Code and then switch to Codex, the next agent usually does not know:

- what task was in progress
- which files changed
- what tests failed
- what decisions were made
- what constraints matter
- what the next step should be

ctxcarry stores that state locally in your repository and compiles compact agent-specific context files.

## Quickstart

```bash
npm install -g ctxcarry
```

Inside a project:

```bash
ctxcarry init
ctxcarry run claude
ctxcarry switch codex
codex
```

That creates a Claude session, captures before/after git state, asks Claude to write a structured summary, compacts the result, updates `AGENTS.md`, and prepares Codex to continue.

## What It Generates

ctxcarry stores source-of-truth state under `.ctxcarry/`:

```text
.ctxcarry/
  events.jsonl
  commands.jsonl
  state.json
  state.md
  learned.md
  sessions/
  ctxcarrys/
    codex.md
    claude.md
```

Generated agent files:

- `AGENTS.md` for Codex
- `CLAUDE.md` for Claude Code
- `.ctxcarry/ctxcarrys/codex.md`
- `.ctxcarry/ctxcarrys/claude.md`

## Commands

```bash
ctxcarry init
ctxcarry run claude
ctxcarry switch codex
ctxcarry status
```

Useful extras:

```bash
ctxcarry capture
ctxcarry compact
ctxcarry compile --agent codex
ctxcarry compile --agent claude
handoff tokens
```

Add explicit context when needed:

```bash
ctxcarry note --type task --text "Fix Google OAuth redirect bug"
ctxcarry note --type decision --text "Do not rewrite the auth provider"
ctxcarry note --type constraint --text "Preserve existing email login behavior"
ctxcarry note --type failure --text "Production callback returns 400"
ctxcarry note --type next --text "Check redirect URI construction"
```

## Session Summaries

Before launching an agent, ctxcarry writes:

```text
.ctxcarry/sessions/<session-id>/instructions.md
```

The instruction asks the agent to write:

```text
.ctxcarry/sessions/<session-id>/summary.md
```

with strict headings:

```md
## Current Task
## Files Changed
## Decisions
## Constraints
## Failures
## Commands Run
## Next Step
```

If the summary exists, ctxcarry parses it into structured memory. If it does not, ctxcarry falls back to git snapshots, changed files, branch, and diff summary.

## MCP Retrieval

Serve local project memory to MCP-compatible clients:

```bash
ctxcarry mcp serve
```

Available tools:

- `get_current_task`
- `get_latest_ctxcarry`
- `get_relevant_session_events`
- `expand_session_artifact`
- `summarize_latest_failure`

## Learning

Mine local sessions for durable guidance:

```bash
ctxcarry learn
ctxcarry learn --apply
```

`--apply` writes `.ctxcarry/learned.md` and updates `AGENTS.md` / `CLAUDE.md` with learned guidance.

## Benchmarks

Run deterministic local fixture benchmarks:

```bash
pnpm run bench
pnpm run bench -- --format json
pnpm run bench -- --out BENCHMARKS.md
```

Current synthetic/local fixture headline:

| Metric | Value |
| --- | ---: |
| Total raw benchmark tokens | 210,371 |
| Total handoff tokens | 2,053 |
| Total saved tokens | 208,324 |
| Overall compression | 99.0% |
| Mean critical-fact recall | 100.0% |
| Mean budget recall | 100.0% |
| Contradictions found | 0 |
| Redaction checks | PASS |

These are deterministic synthetic/local fixture benchmarks, not production telemetry or real agent-execution results.

Run benchmarks on real local sessions:

```bash
pnpm run bench:real -- --project /path/to/your/project
pnpm run bench:continuation -- --project /path/to/your/project
```

Real-session benchmarks report observable local artifacts only. They do not fabricate task-success or recall metrics.

## Development

```bash
pnpm install
pnpm run build
pnpm test
pnpm run bench
```

Link locally:

```bash
pnpm link --global
ctxcarry --help
```

## Status

ctxcarry is early local-first developer tooling. The current focus is reliable Claude Code to Codex handoff, local session capture, compact project memory, and measurable benchmark quality.

## License

MIT
