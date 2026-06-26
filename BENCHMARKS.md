# Handoff Benchmark Report
In deterministic local fixture benchmarks, Handoff reduced 210,371 raw context tokens to 2,047 handoff tokens while preserving 100.0% of handoff-critical facts.
The stress fixtures are deterministic synthetic workloads designed to simulate large test logs, noisy transcripts, large diffs, and repeated agent-session context. They are useful for measuring compaction behavior under scale, but they are not production telemetry or real agent-execution results.
## Key Results
| Metric | Value |
| --- | --- |
| Total raw benchmark tokens | 210371 |
| Total handoff tokens | 2047 |
| Total saved tokens | 208324 |
| Overall compression | 99.0% |
| Mean critical-fact recall | 100.0% |
| Mean budget recall | 100.0% |
| Contradictions found | 0 |
| E2E status | PASS |
| Redaction | PASS |
## Environment Metadata
| Field | Value |
| --- | --- |
| Handoff package version | 0.3.0 |
| Node version | v20.17.0 |
| Platform / arch | darwin/arm64 |
| CPU model | Apple M1 |
| Date | 2026-06-26T11:15:40.968Z |
| Git commit | not available |
## Correctness Fixture Results
| Fixture | Original tokens | Handoff tokens | Compression | Critical recall | Budget recall | Contradictions |
| --- | --- | --- | --- | --- | --- | --- |
| oauth-bug | 580 | 184 | 68.3% | 100.0% | 100.0% | 0 |
| failing-tests | 378 | 208 | 45.0% | 100.0% | 100.0% | 0 |
| refactor-session | 323 | 183 | 43.3% | 100.0% | 100.0% | 0 |
| budget-pressure | 390 | 225 | 42.3% | 100.0% | 100.0% | 0 |
| secret-heavy-session | 249 | 197 | 20.9% | 100.0% | 100.0% | 0 |
## Stress Fixture Results
Stress fixtures contain large amounts of repeated logs, stale agent-session text, noisy diffs, and irrelevant output. Handoff's handoff remains small because it extracts the current task, relevant files, decisions, constraints, failures, commands, and next step instead of preserving raw transcript text.
| Fixture | Original tokens | Handoff tokens | Compression | Critical recall | Budget recall | Contradictions |
| --- | --- | --- | --- | --- | --- | --- |
| huge-test-log | 44350 | 297 | 99.3% | 100.0% | 100.0% | 0 |
| long-agent-session | 69084 | 207 | 99.7% | 100.0% | 100.0% | 0 |
| noisy-logs | 25299 | 170 | 99.3% | 100.0% | 100.0% | 0 |
| large-diff | 32399 | 201 | 99.4% | 100.0% | 100.0% | 0 |
| raw-transcript-baseline | 37319 | 175 | 99.5% | 100.0% | 100.0% | 0 |
## Compression Performance
| Fixture | Group | Original tokens | Handoff tokens | Saved tokens | Compression ratio | Latency ms |
| --- | --- | --- | --- | --- | --- | --- |
| oauth-bug | correctness | 580 | 184 | 396 | 68.3% | 45.0 |
| failing-tests | correctness | 378 | 208 | 170 | 45.0% | 56.9 |
| refactor-session | correctness | 323 | 183 | 140 | 43.3% | 51.8 |
| budget-pressure | correctness | 390 | 225 | 165 | 42.3% | 51.1 |
| secret-heavy-session | correctness | 249 | 197 | 52 | 20.9% | 51.9 |
| huge-test-log | stress | 44350 | 297 | 44053 | 99.3% | 41.4 |
| long-agent-session | stress | 69084 | 207 | 68877 | 99.7% | 41.3 |
| noisy-logs | stress | 25299 | 170 | 25129 | 99.3% | 41.0 |
| large-diff | stress | 32399 | 201 | 32198 | 99.4% | 41.0 |
| raw-transcript-baseline | stress | 37319 | 175 | 37144 | 99.5% | 41.0 |
| TOTAL | all | 210371 | 2047 | 208324 | 99.0% | 462.4 |
## Handoff Accuracy
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
| oauth-bug | correctness | Handoff handoff | 184 | 100.0% |
| failing-tests | correctness | no handoff | 0 | 0.0% |
| failing-tests | correctness | raw transcript | 378 | 100.0% |
| failing-tests | correctness | naive truncation | 378 | 100.0% |
| failing-tests | correctness | Handoff handoff | 208 | 100.0% |
| refactor-session | correctness | no handoff | 0 | 0.0% |
| refactor-session | correctness | raw transcript | 323 | 100.0% |
| refactor-session | correctness | naive truncation | 323 | 100.0% |
| refactor-session | correctness | Handoff handoff | 183 | 100.0% |
| budget-pressure | correctness | no handoff | 0 | 0.0% |
| budget-pressure | correctness | raw transcript | 390 | 100.0% |
| budget-pressure | correctness | naive truncation | 390 | 100.0% |
| budget-pressure | correctness | Handoff handoff | 225 | 100.0% |
| secret-heavy-session | correctness | no handoff | 0 | 0.0% |
| secret-heavy-session | correctness | raw transcript | 249 | 80.0% |
| secret-heavy-session | correctness | naive truncation | 249 | 80.0% |
| secret-heavy-session | correctness | Handoff handoff | 197 | 100.0% |
| huge-test-log | stress | no handoff | 0 | 0.0% |
| huge-test-log | stress | raw transcript | 44350 | 100.0% |
| huge-test-log | stress | naive truncation | 2000 | 40.0% |
| huge-test-log | stress | Handoff handoff | 297 | 100.0% |
| long-agent-session | stress | no handoff | 0 | 0.0% |
| long-agent-session | stress | raw transcript | 69084 | 100.0% |
| long-agent-session | stress | naive truncation | 2000 | 40.0% |
| long-agent-session | stress | Handoff handoff | 207 | 100.0% |
| noisy-logs | stress | no handoff | 0 | 0.0% |
| noisy-logs | stress | raw transcript | 25299 | 100.0% |
| noisy-logs | stress | naive truncation | 2000 | 40.0% |
| noisy-logs | stress | Handoff handoff | 170 | 100.0% |
| large-diff | stress | no handoff | 0 | 0.0% |
| large-diff | stress | raw transcript | 32399 | 100.0% |
| large-diff | stress | naive truncation | 2000 | 20.0% |
| large-diff | stress | Handoff handoff | 201 | 100.0% |
| raw-transcript-baseline | stress | no handoff | 0 | 0.0% |
| raw-transcript-baseline | stress | raw transcript | 37319 | 100.0% |
| raw-transcript-baseline | stress | naive truncation | 2000 | 20.0% |
| raw-transcript-baseline | stress | Handoff handoff | 175 | 100.0% |
## Truncation Resistance
| Fixture | Raw Transcript | First 2k Tokens | Last 2k Tokens | Handoff Handoff |
| --- | --- | --- | --- | --- |
| huge-test-log | 100.0% | 40.0% | 20.0% | 100.0% |
| long-agent-session | 100.0% | 40.0% | 20.0% | 100.0% |
| noisy-logs | 100.0% | 40.0% | 20.0% | 100.0% |
| large-diff | 100.0% | 20.0% | 0.0% | 100.0% |
| raw-transcript-baseline | 100.0% | 20.0% | 0.0% | 100.0% |
## Budget Stress
| Fixture | Group | Budget | Handoff tokens | Critical-fact recall |
| --- | --- | --- | --- | --- |
| oauth-bug | correctness | 250 | 184 | 100.0% |
| oauth-bug | correctness | 500 | 184 | 100.0% |
| oauth-bug | correctness | 1000 | 184 | 100.0% |
| oauth-bug | correctness | 2000 | 184 | 100.0% |
| failing-tests | correctness | 250 | 208 | 100.0% |
| failing-tests | correctness | 500 | 208 | 100.0% |
| failing-tests | correctness | 1000 | 208 | 100.0% |
| failing-tests | correctness | 2000 | 208 | 100.0% |
| refactor-session | correctness | 250 | 183 | 100.0% |
| refactor-session | correctness | 500 | 183 | 100.0% |
| refactor-session | correctness | 1000 | 183 | 100.0% |
| refactor-session | correctness | 2000 | 183 | 100.0% |
| budget-pressure | correctness | 250 | 225 | 100.0% |
| budget-pressure | correctness | 500 | 225 | 100.0% |
| budget-pressure | correctness | 1000 | 225 | 100.0% |
| budget-pressure | correctness | 2000 | 225 | 100.0% |
| secret-heavy-session | correctness | 250 | 197 | 100.0% |
| secret-heavy-session | correctness | 500 | 197 | 100.0% |
| secret-heavy-session | correctness | 1000 | 197 | 100.0% |
| secret-heavy-session | correctness | 2000 | 197 | 100.0% |
| huge-test-log | stress | 250 | 156 | 100.0% |
| huge-test-log | stress | 500 | 297 | 100.0% |
| huge-test-log | stress | 1000 | 297 | 100.0% |
| huge-test-log | stress | 2000 | 297 | 100.0% |
| long-agent-session | stress | 250 | 207 | 100.0% |
| long-agent-session | stress | 500 | 207 | 100.0% |
| long-agent-session | stress | 1000 | 207 | 100.0% |
| long-agent-session | stress | 2000 | 207 | 100.0% |
| noisy-logs | stress | 250 | 170 | 100.0% |
| noisy-logs | stress | 500 | 170 | 100.0% |
| noisy-logs | stress | 1000 | 170 | 100.0% |
| noisy-logs | stress | 2000 | 170 | 100.0% |
| large-diff | stress | 250 | 201 | 100.0% |
| large-diff | stress | 500 | 201 | 100.0% |
| large-diff | stress | 1000 | 201 | 100.0% |
| large-diff | stress | 2000 | 201 | 100.0% |
| raw-transcript-baseline | stress | 250 | 175 | 100.0% |
| raw-transcript-baseline | stress | 500 | 175 | 100.0% |
| raw-transcript-baseline | stress | 1000 | 175 | 100.0% |
| raw-transcript-baseline | stress | 2000 | 175 | 100.0% |
## E2E Claude-to-Codex
| Status | AGENTS.md exists | Managed block exists | Handoff tokens | Within budget | Redaction passed |
| --- | --- | --- | --- | --- | --- |
| PASS | yes | yes | 137 | yes | yes |
## Latency Overhead
| Operation | P50 ms | P95 ms | P99 ms | Mean ms |
| --- | --- | --- | --- | --- |
| capture | 76.9 | 79.7 | 79.7 | 77.0 |
| compact | 41.5 | 41.8 | 41.8 | 41.3 |
| compile codex | 82.8 | 84.5 | 84.5 | 83.0 |
| switch codex | 42.7 | 44.1 | 44.1 | 42.7 |
| tokens | 82.3 | 83.5 | 83.5 | 82.4 |
## Redaction Checks
| Known fake secrets tested | Outputs scanned | Status |
| --- | --- | --- |
| OPENAI_API_KEY, ANTHROPIC_API_KEY, DATABASE_URL, JWT_SECRET, PRIVATE_KEY | .handoff/events.jsonl, .handoff/state.json, .handoff/state.md, AGENTS.md, CLAUDE.md, .handoff/handoffs/codex.md, .handoff/handoffs/claude.md | PASS |
## Reproducing Results
```bash
pnpm install
pnpm run bench -- --format markdown
pnpm run bench -- --format json
pnpm run bench -- --out BENCHMARKS.md
```
Use `pnpm run bench:compression`, `pnpm run bench:recall`, and `pnpm run bench:e2e` for narrower checks. Real-agent continuation benchmarks comparing no handoff, raw transcript, naive truncation, and Handoff handoff are planned next.