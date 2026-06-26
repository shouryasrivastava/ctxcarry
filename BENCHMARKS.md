# ctxcarry Benchmark Report
In deterministic local fixture benchmarks, ctxcarry reduced 210,616 raw context tokens to 2,053 handoff tokens while preserving 100.0% of handoff-critical facts.
The stress fixtures are deterministic synthetic workloads designed to simulate large test logs, noisy transcripts, large diffs, and repeated agent-session context. They are useful for measuring compaction behavior under scale, but they are not production telemetry or real agent-execution results.
## Key Results
| Metric | Value |
| --- | --- |
| Total raw benchmark tokens | 210616 |
| Total handoff tokens | 2053 |
| Total saved tokens | 208563 |
| Overall compression | 99.0% |
| Mean critical-fact recall | 100.0% |
| Mean budget recall | 100.0% |
| Contradictions found | 0 |
| E2E status | PASS |
| Redaction | PASS |
## Environment Metadata
| Field | Value |
| --- | --- |
| ctxcarry package version | 0.3.0 |
| Node version | v20.17.0 |
| Platform / arch | darwin/arm64 |
| CPU model | Apple M1 |
| Date | 2026-06-26T12:13:31.705Z |
| Git commit | a282e77 |
## Correctness Fixture Results
| Fixture | Original tokens | handoff tokens | Compression | Critical recall | Budget recall | Contradictions |
| --- | --- | --- | --- | --- | --- | --- |
| oauth-bug | 580 | 184 | 68.3% | 100.0% | 100.0% | 0 |
| failing-tests | 378 | 208 | 45.0% | 100.0% | 100.0% | 0 |
| refactor-session | 327 | 184 | 43.7% | 100.0% | 100.0% | 0 |
| budget-pressure | 391 | 226 | 42.2% | 100.0% | 100.0% | 0 |
| secret-heavy-session | 249 | 197 | 20.9% | 100.0% | 100.0% | 0 |
## Stress Fixture Results
Stress fixtures contain large amounts of repeated logs, stale agent-session text, noisy diffs, and irrelevant output. ctxcarry's ctxcarry remains small because it extracts the current task, relevant files, decisions, constraints, failures, commands, and next step instead of preserving raw transcript text.
| Fixture | Original tokens | handoff tokens | Compression | Critical recall | Budget recall | Contradictions |
| --- | --- | --- | --- | --- | --- | --- |
| huge-test-log | 44350 | 298 | 99.3% | 100.0% | 100.0% | 0 |
| long-agent-session | 69084 | 207 | 99.7% | 100.0% | 100.0% | 0 |
| noisy-logs | 25299 | 171 | 99.3% | 100.0% | 100.0% | 0 |
| large-diff | 32459 | 202 | 99.4% | 100.0% | 100.0% | 0 |
| raw-transcript-baseline | 37499 | 176 | 99.5% | 100.0% | 100.0% | 0 |
## Compression Performance
| Fixture | Group | Original tokens | handoff tokens | Saved tokens | Compression ratio | Latency ms |
| --- | --- | --- | --- | --- | --- | --- |
| oauth-bug | correctness | 580 | 184 | 396 | 68.3% | 40.9 |
| failing-tests | correctness | 378 | 208 | 170 | 45.0% | 41.7 |
| refactor-session | correctness | 327 | 184 | 143 | 43.7% | 41.8 |
| budget-pressure | correctness | 391 | 226 | 165 | 42.2% | 41.5 |
| secret-heavy-session | correctness | 249 | 197 | 52 | 20.9% | 41.2 |
| huge-test-log | stress | 44350 | 298 | 44052 | 99.3% | 41.5 |
| long-agent-session | stress | 69084 | 207 | 68877 | 99.7% | 41.5 |
| noisy-logs | stress | 25299 | 171 | 25128 | 99.3% | 41.2 |
| large-diff | stress | 32459 | 202 | 32257 | 99.4% | 43.4 |
| raw-transcript-baseline | stress | 37499 | 176 | 37323 | 99.5% | 41.8 |
| TOTAL | all | 210616 | 2053 | 208563 | 99.0% | 416.5 |
## ctxcarry Accuracy
| Fixture | Group | Exact recall | Fuzzy recall | Precision | Contradictions | Budget recall | Redaction | Overall field recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| oauth-bug | correctness | 100.0% | 100.0% | 100.0% | 0 | 100.0% | yes | 100.0% |
| failing-tests | correctness | 100.0% | 100.0% | 100.0% | 0 | 100.0% | yes | 100.0% |
| refactor-session | correctness | 100.0% | 100.0% | 100.0% | 0 | 100.0% | yes | 100.0% |
| budget-pressure | correctness | 100.0% | 100.0% | 100.0% | 0 | 100.0% | yes | 100.0% |
| secret-heavy-session | correctness | 100.0% | 100.0% | 100.0% | 0 | 100.0% | yes | 100.0% |
| huge-test-log | stress | 77.8% | 100.0% | 100.0% | 0 | 100.0% | yes | 100.0% |
| long-agent-session | stress | 100.0% | 100.0% | 100.0% | 0 | 100.0% | yes | 100.0% |
| noisy-logs | stress | 100.0% | 100.0% | 100.0% | 0 | 100.0% | yes | 100.0% |
| large-diff | stress | 100.0% | 100.0% | 100.0% | 0 | 100.0% | yes | 100.0% |
| raw-transcript-baseline | stress | 100.0% | 100.0% | 100.0% | 0 | 100.0% | yes | 100.0% |
## Baseline Comparison
| Fixture | Group | Mode | Tokens | Critical-fact presence |
| --- | --- | --- | --- | --- |
| oauth-bug | correctness | no handoff | 0 | 0.0% |
| oauth-bug | correctness | raw transcript | 580 | 100.0% |
| oauth-bug | correctness | naive truncation | 580 | 100.0% |
| oauth-bug | correctness | ctxcarry handoff | 184 | 100.0% |
| failing-tests | correctness | no handoff | 0 | 0.0% |
| failing-tests | correctness | raw transcript | 378 | 100.0% |
| failing-tests | correctness | naive truncation | 378 | 100.0% |
| failing-tests | correctness | ctxcarry handoff | 208 | 100.0% |
| refactor-session | correctness | no handoff | 0 | 0.0% |
| refactor-session | correctness | raw transcript | 327 | 100.0% |
| refactor-session | correctness | naive truncation | 327 | 100.0% |
| refactor-session | correctness | ctxcarry handoff | 184 | 100.0% |
| budget-pressure | correctness | no handoff | 0 | 0.0% |
| budget-pressure | correctness | raw transcript | 391 | 100.0% |
| budget-pressure | correctness | naive truncation | 391 | 100.0% |
| budget-pressure | correctness | ctxcarry handoff | 226 | 100.0% |
| secret-heavy-session | correctness | no handoff | 0 | 0.0% |
| secret-heavy-session | correctness | raw transcript | 249 | 80.0% |
| secret-heavy-session | correctness | naive truncation | 249 | 80.0% |
| secret-heavy-session | correctness | ctxcarry handoff | 197 | 100.0% |
| huge-test-log | stress | no handoff | 0 | 0.0% |
| huge-test-log | stress | raw transcript | 44350 | 100.0% |
| huge-test-log | stress | naive truncation | 2000 | 40.0% |
| huge-test-log | stress | ctxcarry handoff | 298 | 100.0% |
| long-agent-session | stress | no handoff | 0 | 0.0% |
| long-agent-session | stress | raw transcript | 69084 | 100.0% |
| long-agent-session | stress | naive truncation | 2000 | 40.0% |
| long-agent-session | stress | ctxcarry handoff | 207 | 100.0% |
| noisy-logs | stress | no handoff | 0 | 0.0% |
| noisy-logs | stress | raw transcript | 25299 | 100.0% |
| noisy-logs | stress | naive truncation | 2000 | 40.0% |
| noisy-logs | stress | ctxcarry handoff | 171 | 100.0% |
| large-diff | stress | no handoff | 0 | 0.0% |
| large-diff | stress | raw transcript | 32459 | 100.0% |
| large-diff | stress | naive truncation | 2000 | 20.0% |
| large-diff | stress | ctxcarry handoff | 202 | 100.0% |
| raw-transcript-baseline | stress | no handoff | 0 | 0.0% |
| raw-transcript-baseline | stress | raw transcript | 37499 | 100.0% |
| raw-transcript-baseline | stress | naive truncation | 2000 | 20.0% |
| raw-transcript-baseline | stress | ctxcarry handoff | 176 | 100.0% |
## Truncation Resistance
| Fixture | Raw Transcript | First 2k Tokens | Last 2k Tokens | ctxcarry handoff |
| --- | --- | --- | --- | --- |
| huge-test-log | 100.0% | 40.0% | 20.0% | 100.0% |
| long-agent-session | 100.0% | 40.0% | 20.0% | 100.0% |
| noisy-logs | 100.0% | 40.0% | 20.0% | 100.0% |
| large-diff | 100.0% | 20.0% | 0.0% | 100.0% |
| raw-transcript-baseline | 100.0% | 20.0% | 0.0% | 100.0% |
## Budget Stress
| Fixture | Group | Budget | handoff tokens | Critical-fact recall |
| --- | --- | --- | --- | --- |
| oauth-bug | correctness | 250 | 184 | 100.0% |
| oauth-bug | correctness | 500 | 184 | 100.0% |
| oauth-bug | correctness | 1000 | 184 | 100.0% |
| oauth-bug | correctness | 2000 | 184 | 100.0% |
| failing-tests | correctness | 250 | 208 | 100.0% |
| failing-tests | correctness | 500 | 208 | 100.0% |
| failing-tests | correctness | 1000 | 208 | 100.0% |
| failing-tests | correctness | 2000 | 208 | 100.0% |
| refactor-session | correctness | 250 | 184 | 100.0% |
| refactor-session | correctness | 500 | 184 | 100.0% |
| refactor-session | correctness | 1000 | 184 | 100.0% |
| refactor-session | correctness | 2000 | 184 | 100.0% |
| budget-pressure | correctness | 250 | 226 | 100.0% |
| budget-pressure | correctness | 500 | 226 | 100.0% |
| budget-pressure | correctness | 1000 | 226 | 100.0% |
| budget-pressure | correctness | 2000 | 226 | 100.0% |
| secret-heavy-session | correctness | 250 | 197 | 100.0% |
| secret-heavy-session | correctness | 500 | 197 | 100.0% |
| secret-heavy-session | correctness | 1000 | 197 | 100.0% |
| secret-heavy-session | correctness | 2000 | 197 | 100.0% |
| huge-test-log | stress | 250 | 156 | 100.0% |
| huge-test-log | stress | 500 | 298 | 100.0% |
| huge-test-log | stress | 1000 | 298 | 100.0% |
| huge-test-log | stress | 2000 | 298 | 100.0% |
| long-agent-session | stress | 250 | 207 | 100.0% |
| long-agent-session | stress | 500 | 207 | 100.0% |
| long-agent-session | stress | 1000 | 207 | 100.0% |
| long-agent-session | stress | 2000 | 207 | 100.0% |
| noisy-logs | stress | 250 | 171 | 100.0% |
| noisy-logs | stress | 500 | 171 | 100.0% |
| noisy-logs | stress | 1000 | 171 | 100.0% |
| noisy-logs | stress | 2000 | 171 | 100.0% |
| large-diff | stress | 250 | 202 | 100.0% |
| large-diff | stress | 500 | 202 | 100.0% |
| large-diff | stress | 1000 | 202 | 100.0% |
| large-diff | stress | 2000 | 202 | 100.0% |
| raw-transcript-baseline | stress | 250 | 176 | 100.0% |
| raw-transcript-baseline | stress | 500 | 176 | 100.0% |
| raw-transcript-baseline | stress | 1000 | 176 | 100.0% |
| raw-transcript-baseline | stress | 2000 | 176 | 100.0% |
## E2E Claude-to-Codex
| Status | AGENTS.md exists | Managed block exists | handoff tokens | Within budget | Redaction passed |
| --- | --- | --- | --- | --- | --- |
| PASS | yes | yes | 138 | yes | yes |
## Latency Overhead
| Operation | P50 ms | P95 ms | P99 ms | Mean ms |
| --- | --- | --- | --- | --- |
| capture | 77.4 | 78.9 | 78.9 | 77.7 |
| compact | 42.0 | 42.5 | 42.5 | 41.9 |
| compile codex | 83.2 | 83.7 | 83.7 | 83.2 |
| switch codex | 42.6 | 47.6 | 47.6 | 43.6 |
| tokens | 85.0 | 87.1 | 87.1 | 85.0 |
## Redaction Checks
| Known fake secrets tested | Outputs scanned | Status |
| --- | --- | --- |
| OPENAI_API_KEY, ANTHROPIC_API_KEY, DATABASE_URL, JWT_SECRET, PRIVATE_KEY | .ctxcarry/events.jsonl, .ctxcarry/state.json, .ctxcarry/state.md, AGENTS.md, CLAUDE.md, .ctxcarry/ctxcarrys/codex.md, .ctxcarry/ctxcarrys/claude.md | PASS |
## Reproducing Results
```bash
pnpm install
pnpm run bench -- --format markdown
pnpm run bench -- --format json
pnpm run bench -- --out BENCHMARKS.md
```
Use `pnpm run bench:compression`, `pnpm run bench:recall`, and `pnpm run bench:e2e` for narrower checks. Real-agent continuation benchmarks comparing no handoff, raw transcript, naive truncation, and ctxcarry handoff are planned next.