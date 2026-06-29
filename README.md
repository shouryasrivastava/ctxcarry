# ctxcarry

Local-first context carryover for coding-agent workflows.

```bash
npm install -g ctxcarry
ctxcarry setup
ctxcarry run claude
ctxcarry enter codex
```

`ctxcarry` keeps Claude Code and Codex working from the same local state. It captures session context, compacts it, prepares handoffs, runs verification, and can isolate tasks in git worktrees.

## Quick Start

Inside a project:

```bash
ctxcarry setup
ctxcarry run claude
ctxcarry enter codex
```

`ctxcarry setup` creates `.ctxcarry/`, detects package-manager verification commands, detects local agent commands, writes `ctxcarry.config.json`, and creates `.ctxcarry/board.md`.

The current manual workflow still works:

```bash
ctxcarry run claude
ctxcarry switch codex
codex
```

## Commands

```bash
ctxcarry setup
ctxcarry setup --aliases
ctxcarry run claude
ctxcarry enter codex
ctxcarry enter codex --no-launch
ctxcarry verify
ctxcarry board
```

`ctxcarry setup --aliases` prints optional shell aliases:

```bash
alias claude='ctxcarry run claude --'
alias codex='ctxcarry enter codex --'
```

## Verification

`ctxcarry verify` reads `verify.commands` from `ctxcarry.config.json`, runs each command, and writes:

```text
.ctxcarry/verification/latest.md
.ctxcarry/verification/<timestamp>.json
```

Verification events are appended to `.ctxcarry/events.jsonl`. Command output is summarized and redacted before it is stored.

## Worktrees

```bash
ctxcarry worktree create "Fix failing tests"
ctxcarry worktree list
ctxcarry worktree clean
ctxcarry worktree clean --force
```

Worktrees use `git worktree` when the current project supports it. Metadata is stored in `.ctxcarry/worktrees.json`. `clean` refuses to remove worktrees unless `--force` is passed.

## Advanced: Loops

```bash
ctxcarry loop --task "Fix failing tests" --generator claude --evaluator codex
```

The loop command creates an isolated worktree, runs the generator through the existing `ctxcarry run` flow, runs verification, and launches the evaluator with verification and diff summaries. Loop state is stored in:

```text
.ctxcarry/loops/<loop-id>/
```

Evaluators are instructed to assume the generator made mistakes, inspect the diff, run or review verification, look for regressions, and return `PASS`, `FAIL`, or `NEEDS_REVIEW` with reasons.

## Board

```bash
ctxcarry board
```

The board lives at `.ctxcarry/board.md` and tracks task status as `Todo`, `In Progress`, `Verifying`, `Done`, `Failed`, or `Needs Review`.

## Safety

ctxcarry stores state locally under `.ctxcarry/` and `ctxcarry.config.json`. It does not require a hosted service.

Safety features:

- Worktrees isolate agent tasks from the main checkout.
- Verification results record pass/fail status, duration, summaries, and failing commands.
- Stored verification and evaluator outputs are redacted for common secret patterns.
- Worktree cleanup requires explicit confirmation with `--force`.

## MCP Retrieval

ctxcarry can expose local session memory to MCP-compatible tools:

```bash
ctxcarry mcp serve
```

Available tools include `get_relevant_session_events` and `expand_session_artifact`.

## Development

```bash
pnpm install
pnpm test
pnpm run bench
```
