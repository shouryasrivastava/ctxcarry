import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { archiveSessionArtifact } from "./archive.js";
import { ctxcarryPath } from "./paths.js";
import { redactText } from "./redact.js";
import { appendEvent, readConfig } from "./store.js";
import { getGitSnapshot, summarizeSnapshot } from "./git.js";
import type { GitSnapshot } from "./types.js";

export interface RunSessionResult {
  sessionId: string;
  sessionDir: string;
  exitCode: number;
  changedFiles: string[];
}

export function captureSnapshot(agent?: string): GitSnapshot {
  const snapshot = getGitSnapshot();
  appendEvent({
    type: "repo_snapshot",
    agent,
    branch: snapshot.branch,
    isRepo: snapshot.isRepo,
    status: snapshot.status,
    changedFiles: snapshot.changedFiles,
    diffStat: snapshot.diffStat,
    summary: summarizeSnapshot(snapshot)
  });
  return snapshot;
}

export async function runAgent(agent: string): Promise<RunSessionResult> {
  const config = readConfig();
  const agentConfig = config.agents[agent];
  if (!agentConfig?.enabled) {
    throw new Error(`Agent "${agent}" is not enabled in ctxcarry.config.json.`);
  }

  const sessionId = createSessionId(agent);
  const sessionDir = ctxcarryPath("sessions", sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const instructionsPath = path.join(sessionDir, "instructions.md");
  const summaryPath = path.join(sessionDir, "summary.md");
  writeSessionInstructions(agent, sessionId, instructionsPath, summaryPath);
  const instructionArtifact = archiveSessionArtifact(sessionDir, "instructions.md", fs.readFileSync(instructionsPath, "utf8"));

  const command = agentConfig.command ?? agent;
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const before = getGitSnapshot();
  writeSnapshot(sessionDir, "before", before);

  appendEvent({
    type: "session_started",
    agent,
    sessionId,
    sessionDir,
    instructionsPath,
    summaryPath,
    command,
    startedAt,
    instructionArtifact,
    branch: before.branch,
    changedFiles: before.changedFiles,
    diffStat: before.diffStat
  });

  const exitCode = await spawnInteractive(command, sessionDir, instructionsPath, summaryPath);
  const endedAtMs = Date.now();
  const endedAt = new Date(endedAtMs).toISOString();
  const after = getGitSnapshot();
  writeSnapshot(sessionDir, "after", after);
  const beforeArtifact = archiveSessionArtifact(sessionDir, "before.json", JSON.stringify(before, null, 2));
  const afterArtifact = archiveSessionArtifact(sessionDir, "after.json", JSON.stringify(after, null, 2));

  const changedFiles = unique([...before.changedFiles, ...after.changedFiles]);
  const newFiles = statusFiles(after.status, ["??", "A", "AM"]);
  const deletedFiles = statusFiles(after.status, ["D", "AD"]);
  const durationMs = endedAtMs - startedAtMs;

  appendEvent({
    type: "repo_snapshot",
    agent,
    sessionId,
    branch: after.branch,
    isRepo: after.isRepo,
    status: after.status,
    changedFiles,
    newFiles,
    deletedFiles,
    diffStat: after.diffStat,
    summary: summarizeSnapshot(after)
  });

  appendEvent({
    type: "agent_session",
    agent,
    sessionId,
    sessionDir,
    instructionsPath,
    summaryPath,
    command,
    startedAt,
    endedAt,
    durationMs,
    exitCode,
    branch: after.branch,
    before,
    after,
    changedFiles,
    newFiles,
    deletedFiles,
    diffSummary: after.diffStat
  });
  appendEvent({
    type: "session_artifacts",
    agent,
    sessionId,
    artifacts: [instructionArtifact, beforeArtifact, afterArtifact]
  });

  if (fs.existsSync(summaryPath)) {
    const summaryArtifact = archiveSessionArtifact(sessionDir, "summary.md", fs.readFileSync(summaryPath, "utf8"));
    appendEvent({
      type: "session_artifact",
      agent,
      sessionId,
      artifact: summaryArtifact
    });
    parseSessionSummary(agent, sessionId, summaryPath);
  } else {
    appendEvent({
      type: "session_fallback",
      agent,
      sessionId,
      content: "No session summary was written. Falling back to git snapshots and changed files.",
      branch: after.branch,
      changedFiles,
      newFiles,
      deletedFiles,
      diffSummary: after.diffStat
    });
  }

  return { sessionId, sessionDir, exitCode, changedFiles };
}

function writeSessionInstructions(agent: string, sessionId: string, instructionsPath: string, summaryPath: string): void {
  const relativeSummaryPath = path.relative(process.cwd(), summaryPath);
  const instructions = `# ctxcarry Session Instructions

At the end of this session, write a concise ctxcarry summary to:

${relativeSummaryPath}

Use exactly these Markdown headings:

## Current Task
## Files Changed
## Decisions
## Constraints
## Failures
## Commands Run
## Next Step

Include only durable state the next coding agent needs to continue.
`;
  fs.writeFileSync(instructionsPath, instructions);
}

function parseSessionSummary(agent: string, sessionId: string, summaryPath: string): void {
  const summary = redactText(fs.readFileSync(summaryPath, "utf8"));
  const sections = parseMarkdownSections(summary);

  const task = firstContent(sections["Current Task"]);
  if (task) {
    appendEvent({ type: "note", agent, sessionId, noteType: "task", content: task });
  }

  for (const file of listContent(sections["Files Changed"])) {
    appendEvent({ type: "file_changed", agent, sessionId, path: file, change_summary: `Changed during ${sessionId}` });
  }
  for (const decision of listContent(sections.Decisions)) {
    appendEvent({ type: "note", agent, sessionId, noteType: "decision", content: decision });
  }
  for (const constraint of listContent(sections.Constraints)) {
    appendEvent({ type: "note", agent, sessionId, noteType: "constraint", content: constraint });
  }
  for (const failure of listContent(sections.Failures)) {
    appendEvent({ type: "note", agent, sessionId, noteType: "failure", content: failure });
  }
  for (const command of listContent(sections["Commands Run"])) {
    appendEvent({ type: "command_run", agent, sessionId, command, status: "recorded", summary: `Recorded from ${sessionId}` });
  }

  const next = firstContent(sections["Next Step"]);
  if (next) {
    appendEvent({ type: "note", agent, sessionId, noteType: "next", content: next });
  }

  appendEvent({
    type: "session_summary",
    agent,
    sessionId,
    summaryPath,
    content: summary
  });
}

function parseMarkdownSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let current: string | null = null;
  for (const line of markdown.split("\n")) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1].trim();
      sections[current] = "";
      continue;
    }
    if (current) {
      sections[current] += `${line}\n`;
    }
  }
  return sections;
}

function firstContent(section = ""): string {
  return listContent(section)[0] ?? section.trim();
}

function listContent(section = ""): string[] {
  return section
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""))
    .filter(Boolean);
}

function spawnInteractive(command: string, sessionDir: string, instructionsPath: string, summaryPath: string): Promise<number> {
  const [bin, ...args] = splitCommand(command);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CTXCARRY_SESSION_DIR: sessionDir,
        CTXCARRY_SESSION_INSTRUCTIONS: instructionsPath,
        CTXCARRY_SESSION_SUMMARY: summaryPath
      },
      stdio: "inherit",
      shell: false
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 0));
  });
}

function writeSnapshot(sessionDir: string, name: "before" | "after", snapshot: GitSnapshot): void {
  fs.writeFileSync(path.join(sessionDir, `${name}.json`), JSON.stringify(snapshot, null, 2) + "\n");
}

function createSessionId(agent: string): string {
  const safeAgent = agent.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${safeAgent}-${process.pid}`;
}

function statusFiles(status: string[], codes: string[]): string[] {
  return unique(
    status
      .filter((line) => codes.some((code) => line.trimStart().startsWith(code)))
      .map((line) => line.slice(3).trim())
      .filter((file) => !file.startsWith(".ctxcarry/"))
      .filter(Boolean)
  );
}

function splitCommand(command: string): string[] {
  const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  return parts.map((part) => part.replace(/^["']|["']$/g, ""));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}
