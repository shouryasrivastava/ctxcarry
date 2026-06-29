import fs from "node:fs";
import { spawnSync } from "node:child_process";

import { compileAgent } from "./compile.js";
import { compactState } from "./distill.js";
import { rootPath } from "./paths.js";
import { readConfig, writeManagedFile } from "./store.js";
import type { ParsedArgsLike } from "./setup.js";

export function enterCommand(args: ParsedArgsLike): void {
  const agent = args.positional[0];
  if (!agent) throw new Error("Usage: ctxcarry enter <agent>");

  const dryRun = Boolean(args.flags["dry-run"]);
  const noLaunch = Boolean(args.flags["no-launch"]);
  const instructionPath = agent === "codex" ? rootPath("AGENTS.md") : agent === "claude" ? rootPath("CLAUDE.md") : undefined;

  if (dryRun) {
    console.log(`Would prepare ${agent} handoff.`);
    if (instructionPath) console.log(`Would update ${instructionPath}.`);
    if (!noLaunch) console.log(`Would launch ${agent}.`);
    return;
  }

  const config = readConfig();
  compactState();
  const handoff = compileAgent(agent, config.default_budget_tokens);
  if (instructionPath) {
    writeManagedFile(instructionPath, handoff);
    console.log(`Updated ${instructionPath}`);
  }
  console.log(`Prepared ${agent} handoff.`);

  if (noLaunch) return;

  const result = spawnSync(agent, args.positional.slice(1), { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 0;
}
