import { execFileSync } from "node:child_process";
import type { GitSnapshot } from "./types.js";

export function getGitSnapshot(): GitSnapshot {
  if (!isGitRepo()) {
    return {
      isRepo: false,
      branch: null,
      status: [],
      changedFiles: [],
      diffStat: ""
    };
  }

  const branch = runGit(["branch", "--show-current"]).trim() || null;
  const status = lines(runGit(["status", "--short", "--untracked-files=all"]));
  const changedFiles = unique([
    ...lines(runGit(["diff", "--name-only"])),
    ...lines(runGit(["diff", "--cached", "--name-only"])),
    ...status.map((line) => line.slice(3).trim()).filter(Boolean)
  ].filter((file) => !file.startsWith(".ctxcarry/")));
  const diffStat = runGit(["diff", "--stat"]);

  return {
    isRepo: true,
    branch,
    status,
    changedFiles,
    diffStat
  };
}

export function summarizeSnapshot(snapshot: GitSnapshot): string {
  if (!snapshot.isRepo) {
    return "Not a git repository.";
  }

  const changed = snapshot.changedFiles.length === 0 ? "No changed files." : `${snapshot.changedFiles.length} changed file(s).`;
  const branch = snapshot.branch ? `Branch ${snapshot.branch}.` : "Detached or unknown branch.";
  return `${branch} ${changed}`;
}

function isGitRepo(): boolean {
  try {
    runGit(["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

function runGit(args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return "";
  }
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}
