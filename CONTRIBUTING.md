# Contributing to ctxcarry

Thanks for improving ctxcarry. This project is local-first infrastructure for
coding agents, so contributions should keep agent work durable, inspectable, and
safe to review.

## Development Setup

Requirements:

- Node.js 20+
- pnpm
- git
- Codex or Claude Code for manual agent-loop testing

Install dependencies and build:

```bash
pnpm install
pnpm build
```

Run the CLI from source:

```bash
node dist/cli.js --help
```

Install the local CLI globally while developing:

```bash
npm install -g .
ctxcarry --help
```

## Project Layout

```text
src/cli.ts          command dispatch
src/store.ts        local .ctxcarry state and config
src/capture.ts      wrapped agent sessions
src/compile.ts      handoff rendering
src/verify.ts       verification commands and artifacts
src/worktree.ts     git worktree isolation
src/loop.ts         generator/evaluator loop orchestration
src/discover.ts     local task discovery
src/schedule.ts     launchd scheduled loops
src/mcp-server.ts   MCP access to local memory
tests/cli.test.mjs  integration-oriented CLI tests
```

Generated runtime state lives under `.ctxcarry/` and should not be committed.

## Verification

Run before opening a PR:

```bash
pnpm test
pnpm build
```

Optional smoke checks:

```bash
pnpm run smoke
ctxcarry verify
```

Benchmarks are useful for larger changes to memory, compression, retrieval, or
session summarization:

```bash
pnpm run bench
pnpm run bench:compression
pnpm run bench:recall
```

Do not rely on a generator summary alone. If you change loop behavior, inspect
the generated loop artifacts and evaluator verdict.

## Manual Loop Testing

Use a disposable checkout or expect `.ctxcarry/` artifacts to be created.

Discovery:

```bash
ctxcarry discover --limit 3
cat .ctxcarry/discovery/latest.md
```

PASS-style loop:

```bash
ctxcarry loop \
  --task "Inspect the project and make no code changes. Run verification and report whether it passes." \
  --generator codex \
  --evaluator codex
```

FAIL-style loop:

```bash
ctxcarry loop \
  --task "In the isolated worktree only, intentionally make verification fail, then stop." \
  --generator codex \
  --evaluator codex
```

Inspect the latest loop:

```bash
cat "$(ls -td .ctxcarry/loops/* | head -1)/verification.md"
cat "$(ls -td .ctxcarry/loops/* | head -1)/verdict.md"
ctxcarry board
```

Scheduled loop smoke test:

```bash
ctxcarry schedule run \
  --limit 1 \
  --allow-dirty \
  --generator codex \
  --evaluator codex \
  --timeout-seconds 60
```

Use a longer timeout for real unattended runs.

## Coding Guidelines

- Keep changes surgical and consistent with the existing TypeScript style.
- Prefer deterministic local behavior over hosted services.
- Keep `.ctxcarry/` files plain Markdown or JSON when possible.
- Redact secret-looking values before writing persisted output.
- Preserve existing command behavior unless the change is intentional and tested.
- Avoid adding dependencies unless they remove real complexity.
- Use worktrees for agent-generated changes that need review.

## Loop Engineering Rules

The loop system should preserve these invariants:

- The generator and evaluator are separate roles.
- The generator works in an isolated git worktree.
- Verification runs in the generated worktree, not the controller checkout.
- The evaluator receives the diff and verification summary.
- The evaluator writes a durable verdict: `PASS`, `FAIL`, or `NEEDS_REVIEW`.
- Loop artifacts are persisted under `.ctxcarry/loops/<id>/`.
- Scheduled jobs have a timeout.

If you change any of these paths, add or update an integration test.

## Documentation

Update `README.md` when changing:

- command names or flags
- setup/install instructions
- loop/discovery/scheduling behavior
- token-control behavior
- expected files under `.ctxcarry/`

Keep examples copy-pasteable.

## Release Process

For a release:

```bash
pnpm test
pnpm build
npm pack --dry-run
```

Bump `package.json`, commit, tag, and push:

```bash
git add README.md CONTRIBUTING.md package.json src tests
git commit -m "Release ctxcarry vX.Y.Z"
git tag vX.Y.Z
git push origin master
git push origin vX.Y.Z
```

Publish to npm:

```bash
npm login
npm whoami
npm publish --access public
```

If your local npm cache has permission issues, use a temporary cache:

```bash
NPM_CONFIG_CACHE=/tmp/ctxcarry-npm-cache npm pack --dry-run
NPM_CONFIG_CACHE=/tmp/ctxcarry-npm-cache npm publish --access public
```

## Security

Do not include credentials, tokens, private URLs, or sensitive logs in issues,
tests, fixtures, screenshots, or committed `.ctxcarry/` artifacts.

If a bug involves private output, reduce it to a minimal synthetic reproduction.
