# Text Compression vs Handoff Compaction

Handoff does not currently perform Headroom-style inline text compression.

Headroom compresses the live context stream before it reaches the model: tool outputs, logs, RAG chunks, files, prompts, and sometimes model output. Handoff currently works at a different layer: it captures an agent session, extracts durable project state, and compiles a small handoff for the next agent.

In short:

- Headroom asks: "How do we shrink everything the model sees right now?"
- Handoff asks: "What is the minimum project state the next coding agent needs to continue?"

These are complementary, not mutually exclusive.

## What Handoff Does Today

- Captures Claude/Codex session metadata.
- Records before/after git snapshots.
- Imports a structured session `summary.md` when the agent writes one.
- Falls back to changed files, branch, and diff summaries.
- Distills state into task, files, decisions, constraints, failures, commands, and next step.
- Generates `AGENTS.md`, `CLAUDE.md`, and `.handoff/handoffs/*`.
- Runs synthetic and real-session benchmarks for compression, budget recall, redaction, and handoff shape.

This is deterministic compaction, not semantic compression of arbitrary text.

## Ideas Worth Borrowing

1. Content router

Handoff should route captured material by type before compaction:

- test logs -> failure signature, failing test, top app frame, command
- diffs -> changed files, hunks, file-level summary
- agent transcript -> decisions, failed attempts, constraints, next step
- package output -> install result and errors only
- secrets -> redact before persistence

2. Reversible raw archive

Handoff should keep raw session artifacts locally and emit compact references in handoffs:

```text
See .handoff/sessions/<id>/summary.md
Expand raw command output: .handoff/sessions/<id>/raw/<event-id>.log
```

This gives the next agent compact state first, with local expansion available when needed.

3. Retrieval instead of prompt stuffing

The long-term MCP server should expose tools like:

- `get_current_task`
- `get_latest_handoff`
- `get_relevant_session_events`
- `expand_session_artifact`
- `summarize_latest_failure`

That lets agents pull context on demand instead of loading everything upfront.

4. Learn from failed sessions

A future `handoff learn` command should mine resolved failures and write durable guidance:

- `AGENTS.md` for Codex
- `CLAUDE.md` for Claude Code
- `.handoff/memory.json` as source of truth

Example learned rule:

```text
For OAuth bugs, compare production redirect URI construction before changing provider code.
```

5. Better real-session benchmarks

Current real-session benchmarks measure observable local artifacts. The next step is a continuation benchmark:

- no handoff
- raw transcript
- naive truncation
- Handoff handoff

Measured outcomes should include task success, tokens used, repeated failed attempts, and time to first correct action.

## What Handoff Should Not Copy Blindly

- It should not become a generic prompt proxy before the handoff workflow is excellent.
- It should not require a model-based compressor for the local-first MVP.
- It should not claim accuracy preservation from synthetic compression metrics alone.
- It should not hide that stress fixtures are synthetic/local.

## Near-Term v0.3 Direction

The highest-value Headroom-inspired additions for Handoff are:

1. Content-aware distillation for logs, diffs, transcripts, and command output.
2. Reversible raw session archive with compact references.
3. MCP retrieval for dynamic project memory.
4. Real-agent continuation benchmarks.
5. `handoff learn` for failed-session guidance.
