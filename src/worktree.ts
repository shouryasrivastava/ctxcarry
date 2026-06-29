import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { ctxcarryPath, rootPath } from "./paths.js";
import type { ParsedArgsLike } from "./setup.js";

interface WorktreeRecord {
  task: string;
  branch: string;
  path: string;
  createdAt: string;
}

export function worktreeCommand(args: ParsedArgsLike): void {
  const subcommand = args.positional[0];
  if (subcommand === "create") {
    const task = args.positional.slice(1).join(" ").trim();
    if (!task) throw new Error("Usage: ctxcarry worktree create <task>");
    const record = createWorktree(task);
    console.log(`Created ${record.path}`);
    console.log(`Branch: ${record.branch}`);
    return;
  }
  if (subcommand === "list") {
    const records = readWorktrees();
    if (!records.length) {
      console.log("No ctxcarry worktrees.");
      return;
    }
    for (const record of records) {
      console.log(`${record.branch}\t${record.path}\t${record.task}`);
    }
    return;
  }
  if (subcommand === "clean") {
    cleanWorktrees(Boolean(args.flags.force));
    return;
  }
  throw new Error("Usage: ctxcarry worktree <create|list|clean>");
}

export function createWorktree(task: string): WorktreeRecord {
  assertGitWorktreeSupport();
  const slug = sanitizeTaskName(task);
  const branch = uniqueBranch(`ctxcarry/${slug}`);
  const target = uniqueWorktreePath(path.resolve(rootPath(".."), `.ctxcarry-${slug}`));
  execFileSync("git", ["worktree", "add", "-b", branch, target], { stdio: "pipe" });
  const record = { task, branch, path: target, createdAt: new Date().toISOString() };
  const records = readWorktrees().filter((item) => item.path !== target);
  records.push(record);
  writeWorktrees(records);
  return record;
}

export function readWorktrees(): WorktreeRecord[] {
  const metadataPath = ctxcarryPath("worktrees.json");
  if (!fs.existsSync(metadataPath)) return [];
  return JSON.parse(fs.readFileSync(metadataPath, "utf8")) as WorktreeRecord[];
}

export function writeWorktrees(records: WorktreeRecord[]): void {
  fs.mkdirSync(ctxcarryPath(), { recursive: true });
  fs.writeFileSync(ctxcarryPath("worktrees.json"), `${JSON.stringify(records, null, 2)}\n`);
}

export function sanitizeTaskName(task: string): string {
  const slug = task.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug || "task";
}

function cleanWorktrees(force: boolean): void {
  const records = readWorktrees();
  if (!records.length) {
    console.log("No ctxcarry worktrees.");
    return;
  }
  if (!force) {
    console.log("Refusing to delete worktrees without --force.");
    process.exitCode = 1;
    return;
  }
  for (const record of records) {
    execFileSync("git", ["worktree", "remove", record.path, "--force"], { stdio: "pipe" });
    console.log(`Removed ${record.path}`);
  }
  writeWorktrees([]);
}

function assertGitWorktreeSupport(): void {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "pipe" });
  execFileSync("git", ["worktree", "list"], { stdio: "pipe" });
}

function uniqueBranch(base: string): string {
  let branch = base;
  let counter = 2;
  while (branchExists(branch)) {
    branch = `${base}-${counter}`;
    counter += 1;
  }
  return branch;
}

function uniqueWorktreePath(base: string): string {
  if (!fs.existsSync(base)) return base;
  let counter = 2;
  let target = `${base}-${counter}`;
  while (fs.existsSync(target)) {
    counter += 1;
    target = `${base}-${counter}`;
  }
  return target;
}

function branchExists(branch: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", branch], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
