import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ctxcarryPath, rootPath } from "./paths.js";

export function scheduleCommand(args: { positional: string[]; flags: Record<string, string | boolean> }): void {
  const subcommand = args.positional[0];
  switch (subcommand) {
    case "install":
      installSchedule(args.flags);
      return;
    case "uninstall":
      uninstallSchedule();
      return;
    case "status":
      printScheduleStatus();
      return;
    case "run":
      runScheduledLoop(args.flags);
      return;
    default:
      throw new Error("Usage: ctxcarry schedule <install|uninstall|status|run>");
  }
}

function installSchedule(flags: Record<string, string | boolean>): void {
  const every = typeof flags.every === "string" ? flags.every : "1h";
  const limit = typeof flags.limit === "string" ? flags.limit : "1";
  const timeoutSeconds = typeof flags["timeout-seconds"] === "string" ? flags["timeout-seconds"] : "1800";
  const allowDirty = Boolean(flags["allow-dirty"]);
  const generator = typeof flags.generator === "string" ? flags.generator : undefined;
  const evaluator = typeof flags.evaluator === "string" ? flags.evaluator : undefined;
  const seconds = intervalToSeconds(every);
  const plistPath = launchdPlistPath();
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.mkdirSync(ctxcarryPath("schedule"), { recursive: true });
  fs.writeFileSync(plistPath, renderLaunchdPlist(seconds, limit, allowDirty, generator, evaluator, timeoutSeconds));
  console.log(`Installed ctxcarry launchd schedule at ${plistPath}`);
}

function uninstallSchedule(): void {
  const plistPath = launchdPlistPath();
  if (fs.existsSync(plistPath)) {
    fs.rmSync(plistPath);
    console.log(`Removed ${plistPath}`);
  } else {
    console.log("No ctxcarry launchd schedule installed.");
  }
}

function printScheduleStatus(): void {
  const plistPath = launchdPlistPath();
  console.log(`Schedule plist: ${plistPath}`);
  console.log(`Installed: ${fs.existsSync(plistPath) ? "yes" : "no"}`);
  const logDir = ctxcarryPath("schedule");
  if (fs.existsSync(logDir)) {
    const logs = fs.readdirSync(logDir).filter((file) => file.endsWith(".log")).sort();
    console.log(`Logs: ${logs.length}`);
    if (logs.length) console.log(`Latest: ${path.join(logDir, logs[logs.length - 1])}`);
  }
}

function runScheduledLoop(flags: Record<string, string | boolean>): void {
  const limit = typeof flags.limit === "string" ? flags.limit : "1";
  const timeoutMs = timeoutToSeconds(typeof flags["timeout-seconds"] === "string" ? flags["timeout-seconds"] : "1800") * 1000;
  const loopCommand = ["ctxcarry", "loop", "--from-discovery", "--limit", limit];
  if (flags["allow-dirty"]) loopCommand.push("--allow-dirty");
  if (typeof flags.generator === "string") loopCommand.push("--generator", flags.generator);
  if (typeof flags.evaluator === "string") loopCommand.push("--evaluator", flags.evaluator);
  const logDir = ctxcarryPath("schedule");
  fs.mkdirSync(logDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(logDir, `${timestamp}.log`);
  const output: string[] = [];

  for (const command of [
    ["ctxcarry", "discover"],
    loopCommand,
  ]) {
    output.push(`$ ${command.join(" ")}`);
    try {
      output.push(execFileSync(command[0], command.slice(1), { cwd: rootPath(), encoding: "utf8", timeout: timeoutMs }));
    } catch (error) {
      const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
      if (err.stdout) output.push(String(err.stdout));
      if (err.stderr) output.push(String(err.stderr));
      output.push(err.message ?? String(error));
      fs.writeFileSync(logPath, output.join("\n"));
      throw error;
    }
  }

  fs.writeFileSync(logPath, output.join("\n"));
  console.log(`Scheduled ctxcarry run complete. Log: ${logPath}`);
}

function launchdPlistPath(): string {
  return path.join(os.homedir(), "Library", "LaunchAgents", "com.ctxcarry.local-loop.plist");
}

function renderLaunchdPlist(seconds: number, limit: string, allowDirty: boolean, generator?: string, evaluator?: string, timeoutSeconds?: string): string {
  const cwd = rootPath();
  const logDir = ctxcarryPath("schedule");
  const nodePath = process.execPath;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ctxcarry.local-loop</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(nodePath)}</string>
    <string>${escapeXml(process.argv[1] ?? "ctxcarry")}</string>
    <string>schedule</string>
    <string>run</string>
    <string>--limit</string>
    <string>${escapeXml(limit)}</string>
    ${allowDirty ? "<string>--allow-dirty</string>" : ""}
    ${generator ? `<string>--generator</string>\n    <string>${escapeXml(generator)}</string>` : ""}
    ${evaluator ? `<string>--evaluator</string>\n    <string>${escapeXml(evaluator)}</string>` : ""}
    ${timeoutSeconds ? `<string>--timeout-seconds</string>\n    <string>${escapeXml(timeoutSeconds)}</string>` : ""}
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(cwd)}</string>
  <key>StartInterval</key>
  <integer>${seconds}</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(logDir, "launchd.out.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(logDir, "launchd.err.log"))}</string>
</dict>
</plist>
`;
}

function intervalToSeconds(value: string): number {
  const match = value.match(/^(\d+)(m|h|d)?$/);
  if (!match) throw new Error("--every must be like 30m, 1h, or 1d");
  const amount = Number(match[1]);
  const unit = match[2] ?? "m";
  if (unit === "m") return amount * 60;
  if (unit === "h") return amount * 60 * 60;
  return amount * 24 * 60 * 60;
}

function timeoutToSeconds(value: string): number {
  const match = value.match(/^(\d+)(s|m|h)?$/);
  if (!match) throw new Error("--timeout-seconds must be a number of seconds, or use 5m/1h");
  const amount = Number(match[1]);
  const unit = match[2] ?? "s";
  if (unit === "s") return amount;
  if (unit === "m") return amount * 60;
  return amount * 60 * 60;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
