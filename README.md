# Handoff

**Portable project memory for AI coding agents.**

Handoff lets developers move long-running coding work between Claude Code, Codex, and future agents without losing the working state of a repo. It captures what happened in an agent session, distills the useful state, and generates the right handoff context for the next agent.

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

Handoff stores that state locally in your repository and compiles compact agent-specific context files.

## Quickstart

```bash
npm install -g handoff
```

Inside a project:

```bash
handoff init
handoff run claude
handoff switch codex
codex
```

That creates a Claude session, captures before/after git state, asks Claude to write a structured summary, compacts the result, updates `AGENTS.md`, and prepares Codex to continue.

## What It Generates

Handoff stores source-of-truth state under `.handoff/`:

```text
.handoff/
  events.jsonl
  commands.jsonl
  state.json
  state.md
  learned.md
  sessions/
  handoffs/
    codex.md
    claude.md
```

Generated agent files:

- `AGENTS.md` for Codex
- `CLAUDE.md` for Claude Code
- `.handoff/handoffs/codex.md`
- `.handoff/handoffs/claude.md`

## Commands

```bash
handoff init
handoff run claude
handoff switch codex
handoff status
```

Useful extras:

```bash
handoff capture
handoff compact
handoff compile --agent codex
handoff compile --agent claude
handoff tokens
```

Add explicit context when needed:

```bash
handoff note --type task --text "Fix Google OAuth redirect bug"
handoff note --type decision --text "Do not rewrite the auth provider"
handoff note --type constraint --text "Preserve existing email login behavior"
handoff note --type failure --text "Production callback returns 400"
handoff note --type next --text "Check redirect URI construction"
```

## Session Summaries

Before launching an agent, Handoff writes:

```text
.handoff/sessions/<session-id>/instructions.md
```

The instruction asks the agent to write:

```text
.handoff/sessions/<session-id>/summary.md
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

If the summary exists, Handoff parses it into structured memory. If it does not, Handoff falls back to git snapshots, changed files, branch, and diff summary.

## MCP Retrieval

Serve local project memory to MCP-compatible clients:

```bash
handoff mcp serve
```

Available tools:

- `get_current_task`
- `get_latest_handoff`
- `get_relevant_session_events`
- `expand_session_artifact`
- `summarize_latest_failure`

## Learning

Mine local sessions for durable guidance:

```bash
handoff learn
handoff learn --apply
```

`--apply` writes `.handoff/learned.md` and updates `AGENTS.md` / `CLAUDE.md` with learned guidance.

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
| Total handoff tokens | 2,047 |
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

## Handoff vs Text Compression

Handoff is not a generic prompt compressor. It does deterministic project-state compaction:

- current task
- files changed
- decisions
- constraints
- failures
- commands
- next step

It is complementary to live prompt-compression tools. See [docs/headroom-inspired-improvements.md](docs/headroom-inspired-improvements.md).

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
handoff --help
```

## Status

Handoff is early local-first developer tooling. The current focus is reliable Claude Code to Codex handoff, local session capture, compact project memory, and measurable benchmark quality.

## License

MIT
