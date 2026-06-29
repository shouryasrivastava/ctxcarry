import fs from "node:fs";
import { execFileSync, execSync } from "node:child_process";

import { compileAgent } from "./compile.js";
import { ctxcarryPath } from "./paths.js";
import { appendEvent, readConfig } from "./store.js";
import { redactText } from "./redact.js";
import { updateBoard } from "./board.js";
import { runVerifyCommands, writeVerification, latestVerificationMarkdown } from "./verify.js";
import { createWorktree } from "./worktree.js";
import type { ParsedArgsLike } from "./setup.js";

export function loopCommand(args: ParsedArgsLike): void {
  const task = stringFlag(args, "task");
  const generator = stringFlag(args, "generator") ?? "claude";
  const evaluator = stringFlag(args, "evaluator") ?? "codex";
  if (!task) throw new Error('Usage: ctxcarry loop --task "..." --generator claude --evaluator codex');

  const loopId = new Date().toISOString().replace(/[:.]/g, "-");
  const loopDir = ctxcarryPath("loops", loopId);
  fs.mkdirSync(loopDir, { recursive: true });

  updateBoard(task, "In Progress");
  const worktree = createWorktree(task);
  writeLoopFile(loopDir, "task.md", `# Task\n\n${task}\n`);

  execFileSync("ctxcarry", ["setup"], { cwd: worktree.path, stdio: "inherit" });
  execFileSync("ctxcarry", ["run", generator], { cwd: worktree.path, stdio: "inherit" });

  updateBoard(task, "Verifying");
  const config = readConfig();
  const verification = runVerifyCommands(config.verify?.commands ?? []);
  writeVerification(verification);

  const verdictPath = `${loopDir}/verdict.md`;
  const diffSummary = summarizeDiff(worktree.path);
  const evaluatorInstructions = renderEvaluatorInstructions(task, latestVerificationMarkdown(), diffSummary, verdictPath);
  writeLoopFile(loopDir, "evaluator.md", evaluatorInstructions);
  compileAgent(evaluator, config.default_budget_tokens);
  execFileSync(evaluator, [], {
    cwd: worktree.path,
    stdio: "inherit",
    env: { ...process.env, CTXCARRY_EVALUATOR_INSTRUCTIONS: evaluatorInstructions, CTXCARRY_VERDICT_PATH: verdictPath },
  });

  if (!fs.existsSync(verdictPath)) {
    writeLoopFile(loopDir, "verdict.md", "NEEDS_REVIEW\n\nEvaluator did not write a verdict.\n");
  } else {
    writeLoopFile(loopDir, "verdict.md", fs.readFileSync(verdictPath, "utf8"));
  }
  const verdict = fs.readFileSync(verdictPath, "utf8");
  updateBoard(task, verdict.startsWith("PASS") ? "Done" : verdict.startsWith("FAIL") ? "Failed" : "Needs Review");
  writeLoopFile(loopDir, "handoff.md", redactText(`# Final Handoff\n\n${verdict}\n\n## Diff\n\n${diffSummary}\n`));
  appendEvent({ type: "loop", timestamp: new Date().toISOString(), loopId, task, generator, evaluator, passed: verdict.startsWith("PASS") });
  console.log(`Loop ${loopId} complete.`);
}

export function renderEvaluatorInstructions(task: string, verificationSummary: string, diffSummary: string, verdictPath: string): string {
  return redactText(`# Evaluator Instructions

Task: ${task}
Verdict path: ${verdictPath}

Assume the generator made mistakes.
Inspect the diff.
Run or review verification.
Look for regressions.
Do not grade based on the generator's summary alone.
Return PASS, FAIL, or NEEDS_REVIEW with reasons.
Write the verdict to the verdict path.

## Verification

${verificationSummary}

## Diff

${diffSummary}
`);
}

function stringFlag(args: ParsedArgsLike, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}

function summarizeDiff(cwd: string): string {
  try {
    return redactText(execSync("git diff --stat && git diff -- .", { cwd, encoding: "utf8" }).slice(0, 12000));
  } catch (error) {
    return redactText(error instanceof Error ? error.message : String(error));
  }
}

function writeLoopFile(loopDir: string, filename: string, content: string): void {
  fs.writeFileSync(`${loopDir}/${filename}`, `${redactText(content).trimEnd()}\n`);
}
