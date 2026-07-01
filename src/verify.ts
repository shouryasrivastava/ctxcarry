import fs from "node:fs";
import { execSync } from "node:child_process";

import { ctxcarryPath } from "./paths.js";
import { appendEvent, ensureInitialized, readConfig } from "./store.js";
import { redactText, redactValue } from "./redact.js";

export interface VerificationResult {
  timestamp: string;
  passed: boolean;
  commands: VerificationCommandResult[];
}

export interface VerificationCommandResult {
  command: string;
  passed: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export function verifyCommand(): VerificationResult {
  ensureInitialized();
  const config = readConfig();
  const commands = config.verify?.commands ?? [];
  const result = runVerifyCommands(commands);
  writeVerification(result);
  console.log(renderVerificationSummary(result));
  if (!result.passed) {
    process.exitCode = 1;
  }
  return result;
}

export function runVerifyCommands(commands: string[], cwd = process.cwd()): VerificationResult {
  const results = commands.map((command) => runVerifyCommand(command, cwd));
  return {
    timestamp: new Date().toISOString(),
    passed: results.every((item) => item.passed),
    commands: results,
  };
}

export function writeVerification(result: VerificationResult): void {
  const dir = ctxcarryPath("verification");
  fs.mkdirSync(dir, { recursive: true });
  const safe = redactValue(result) as VerificationResult;
  const stamp = result.timestamp.replace(/[:.]/g, "-");
  fs.writeFileSync(`${dir}/${stamp}.json`, `${JSON.stringify(safe, null, 2)}\n`);
  fs.writeFileSync(`${dir}/latest.md`, renderVerificationMarkdown(safe));
  appendEvent({
    type: "verification",
    timestamp: result.timestamp,
    passed: result.passed,
    failingCommands: result.commands.filter((command) => !command.passed).map((command) => command.command),
  });
}

export function latestVerificationMarkdown(): string {
  const latestPath = ctxcarryPath("verification", "latest.md");
  if (!fs.existsSync(latestPath)) return "No verification has been recorded.";
  return fs.readFileSync(latestPath, "utf8");
}

export function renderVerificationSummary(result: VerificationResult): string {
  if (!result.commands.length) return "No verify commands configured.";
  const failed = result.commands.filter((command) => !command.passed);
  if (!failed.length) return `Verification passed (${result.commands.length} command${result.commands.length === 1 ? "" : "s"}).`;
  return `Verification failed: ${failed.map((command) => command.command).join(", ")}`;
}

function runVerifyCommand(command: string, cwd: string): VerificationCommandResult {
  const started = Date.now();
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return {
      command,
      passed: true,
      durationMs: Date.now() - started,
      stdout: summarize(stdout),
      stderr: "",
    };
  } catch (error) {
    const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
    return {
      command,
      passed: false,
      durationMs: Date.now() - started,
      stdout: summarize(bufferToString(err.stdout)),
      stderr: summarize(bufferToString(err.stderr)),
      error: redactText(err.message ?? "Command failed"),
    };
  }
}

function renderVerificationMarkdown(result: VerificationResult): string {
  const lines = [
    "# Verification",
    "",
    `Timestamp: ${result.timestamp}`,
    `Status: ${result.passed ? "PASS" : "FAIL"}`,
    "",
  ];

  for (const command of result.commands) {
    lines.push(`## ${command.passed ? "PASS" : "FAIL"} ${command.command}`);
    lines.push(`Duration: ${command.durationMs}ms`);
    if (command.stdout) lines.push("", "stdout:", "```", command.stdout, "```");
    if (command.stderr) lines.push("", "stderr:", "```", command.stderr, "```");
    if (command.error) lines.push("", `Error: ${command.error}`);
    lines.push("");
  }

  return `${redactText(lines.join("\n")).trimEnd()}\n`;
}

function summarize(output: string): string {
  const redacted = redactText(output).trim();
  if (redacted.length <= 4000) return redacted;
  return `${redacted.slice(0, 2000)}\n...\n${redacted.slice(-2000)}`;
}

function bufferToString(value: Buffer | string | undefined): string {
  if (!value) return "";
  return Buffer.isBuffer(value) ? value.toString("utf8") : value;
}
