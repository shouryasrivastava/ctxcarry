# Contributing to ctxcarry

Thanks for helping improve ctxcarry.

ctxcarry is local-first developer tooling for moving coding-agent work between Claude Code, Codex, and future agents without losing repo state. Contributions should preserve that focus: reliable session capture, compact project memory, safe local storage, and honest benchmarks.

## Development Setup

Requirements:

- Node.js 20+
- pnpm
- git

Install dependencies and build:

```bash
pnpm install
pnpm run build
```

Run the CLI locally:

```bash
node dist/cli.js --help
```

Or link it globally during development:

```bash
pnpm link --global
ctxcarry --help
```

## Test Before Opening a PR

Run:

```bash
pnpm test
pnpm run bench
```

For real-session benchmark smoke testing:

```bash
pnpm run bench:real -- --project /path/to/a/project
pnpm run bench:continuation -- --project /path/to/a/project
```

Do not claim real-agent success rates unless the benchmark actually executes agents and measures outcomes. If a metric is not measured, label it `not measured`.

## Project Structure

```text
src/
  cli.ts              CLI entrypoint
  capture.ts          agent session capture
  distill.ts          deterministic state distillation
  compile.ts          AGENTS.md / CLAUDE.md generation
  mcp-server.ts       stdio MCP retrieval tools
  learn.ts            learned guidance generation
  content-router.ts   log/diff/transcript routing
  archive.ts          reversible raw session artifact archive

bench/
  fixtures/           deterministic synthetic/local benchmark fixtures
  report.ts           Headroom-style benchmark report
  real-sessions.ts    real local session benchmark
  continuation.ts     continuation-mode benchmark scaffold

tests/
  cli.test.mjs        CLI and workflow tests
```

## Design Principles

- Keep ctxcarry local-first.
- Store source-of-truth memory under `.ctxcarry/`.
- Prefer deterministic compaction before model-based summarization.
- Preserve useful state, not full transcripts.
- Redact secrets before writing generated state or ctxcarrys.
- Keep generated ctxcarrys small and agent-specific.
- Do not fabricate benchmark results.

## Benchmark Rules

Synthetic stress fixtures are allowed, but must be clearly labeled synthetic/local. They are useful for testing scale and compaction behavior, not proof of production telemetry.

Benchmark reports should distinguish:

- deterministic fixture results
- real local session artifacts
- planned but not yet measured real-agent execution metrics

If you add a benchmark metric, it must be computed from the current run.

## Release Checklist

Before publishing:

```bash
pnpm test
pnpm run bench
pnpm run build
npm pack
```

Install the packed tarball into a temp prefix and verify the CLI:

```bash
prefix=$(mktemp -d /tmp/ctxcarry-prefix-XXXXXX)
npm install -g --prefix "$prefix" ./ctxcarry-0.3.0.tgz
"$prefix/bin/ctxcarry" --help
```

Publishing currently uses the scoped package:

```bash
npm publish --access public
```

## Pull Request Guidelines

Good PRs include:

- a clear problem statement
- a focused implementation
- tests for new behavior
- benchmark updates when benchmarked behavior changes
- documentation updates for user-facing commands

Avoid unrelated refactors in feature PRs.

## Security

Do not commit real secrets, real user session logs, or private repository data.

If you find a redaction bug, open an issue with a synthetic reproduction. Do not include live credentials or private logs.
