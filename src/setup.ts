import fs from "node:fs";
import { execFileSync } from "node:child_process";

import { ctxcarryPath, rootPath } from "./paths.js";
import { defaultConfig, initStore, readConfig } from "./store.js";
import type { ctxcarryConfig } from "./types.js";

export interface ParsedArgsLike {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function setupCommand(args: ParsedArgsLike): void {
  initStore();
  ensureBoard();

  const config = {
    ...defaultConfig(),
    ...readConfig(),
  } as ctxcarryConfig;
  config.packageManager = detectPackageManager();
  config.verify = { commands: detectVerifyCommands(config.packageManager) };
  config.availableAgents = detectAgents(["claude", "codex"]);

  fs.writeFileSync(rootPath("ctxcarry.config.json"), `${JSON.stringify(config, null, 2)}\n`);

  console.log("ctxcarry setup complete.");
  console.log(`Package manager: ${config.packageManager ?? "none detected"}`);
  console.log(`Verify commands: ${config.verify.commands.length ? config.verify.commands.join(", ") : "none detected"}`);
  console.log(`Agents: ${config.availableAgents.length ? config.availableAgents.join(", ") : "none detected"}`);
  console.log("");
  console.log("Next:");
  console.log("  ctxcarry run claude");
  console.log("  ctxcarry enter codex");

  if (args.flags.aliases) {
    console.log("");
    console.log("Aliases:");
    console.log("  alias claude='ctxcarry run claude --'");
    console.log("  alias codex='ctxcarry enter codex --'");
  }
}

export function ensureBoard(): void {
  const boardPath = ctxcarryPath("board.md");
  if (!fs.existsSync(boardPath)) {
    fs.writeFileSync(boardPath, "# ctxcarry Board\n\n| Status | Task | Updated |\n| --- | --- | --- |\n");
  }
}

export function detectPackageManager(): string | undefined {
  if (fs.existsSync(rootPath("pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(rootPath("package-lock.json"))) return "npm";
  if (fs.existsSync(rootPath("yarn.lock"))) return "yarn";
  if (fs.existsSync(rootPath("package.json"))) return "npm";
  return undefined;
}

export function detectVerifyCommands(packageManager = detectPackageManager()): string[] {
  if (!packageManager || !["pnpm", "npm"].includes(packageManager)) return [];

  const packagePath = rootPath("package.json");
  if (!fs.existsSync(packagePath)) return [];

  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { scripts?: Record<string, string> };
  const scripts = pkg.scripts ?? {};
  const commands: string[] = [];

  for (const script of ["test", "lint", "typecheck", "build"]) {
    if (!scripts[script]) continue;
    if (packageManager === "pnpm") {
      commands.push(script === "test" ? "pnpm test" : `pnpm ${script}`);
    } else {
      commands.push(script === "test" ? "npm test" : `npm run ${script}`);
    }
  }

  return commands;
}

function detectAgents(candidates: string[]): string[] {
  return candidates.filter((agent) => commandExists(agent));
}

function commandExists(command: string): boolean {
  try {
    execFileSync("sh", ["-c", `command -v ${quoteShell(command)}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
