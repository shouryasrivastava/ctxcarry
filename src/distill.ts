import type { HandoffEvent, HandoffState, MemoryItem } from "./types.js";
import { freshState, readEvents, writeMarkdownState, writeState } from "./store.js";

export function compactState(): HandoffState {
  const events = readEvents();
  const state = freshState();

  for (const event of events) {
    applyEvent(state, event);
  }

  state.updatedAt = new Date().toISOString();
  postProcessState(state);

  writeState(state);
  writeMarkdownState(renderStateMarkdown(state));
  return state;
}

export function renderStateMarkdown(state: HandoffState): string {
  return [
    "# Handoff State",
    "",
    "## Current Task",
    state.working.currentTask,
    "",
    "## Current Status",
    state.working.status,
    "",
    "## Files Touched",
    renderList(state.working.touchedFiles),
    "",
    "## Decisions Made",
    renderMemoryList(state.episodic.decisions),
    "",
    "## Constraints",
    renderMemoryList(state.working.constraints),
    "",
    "## Known Failures",
    renderMemoryList(state.working.failures),
    "",
    "## Last Commands",
    renderList(state.working.lastCommands),
    "",
    "## Next Steps",
    renderMemoryList(state.working.nextSteps)
  ].join("\n");
}

function applyEvent(state: HandoffState, event: HandoffEvent): void {
  switch (event.type) {
    case "note":
      applyNote(state, event);
      break;
    case "repo_snapshot":
      applySnapshot(state, event);
      break;
    case "agent_session":
      applySession(state, event);
      break;
    case "command_run":
      applyCommand(state, event);
      break;
    case "file_changed":
      applyFileChanged(state, event);
      break;
    case "session_fallback":
      applyFallback(state, event);
      break;
  }
}

function applyNote(state: HandoffState, event: HandoffEvent): void {
  const noteType = String(event.noteType ?? "");
  const content = String(event.content ?? "").trim();
  if (!content) {
    return;
  }

  const item = toMemoryItem(event, content);
  if (noteType === "decision") {
    state.episodic.decisions.push(item);
  } else if (noteType === "failure") {
    state.working.failures.push(item);
    state.working.status = "in_progress";
  } else if (noteType === "todo") {
    state.working.todos.push(item);
  } else if (noteType === "constraint") {
    state.working.constraints.push(item);
  } else if (noteType === "task") {
    state.working.currentTask = content;
    state.working.status = "in_progress";
  } else if (noteType === "next") {
    state.working.nextSteps.push(item);
  } else if (noteType === "resolved") {
    state.episodic.resolved.push(item);
  }
}

function applySnapshot(state: HandoffState, event: HandoffEvent): void {
  const branch = typeof event.branch === "string" ? event.branch : null;
  const files = Array.isArray(event.changedFiles) ? event.changedFiles.filter((file): file is string => typeof file === "string") : [];
  state.working.currentBranch = branch;
  state.working.touchedFiles.push(...files);

  if (files.length > 0 && state.working.status === "not_started") {
    state.working.status = "in_progress";
  }
}

function applySession(state: HandoffState, event: HandoffEvent): void {
  const agent = typeof event.agent === "string" ? event.agent : "unknown";
  const exitCode = typeof event.exitCode === "number" ? event.exitCode : null;
  const summary = exitCode === 0 ? `${agent} session completed.` : `${agent} session exited with code ${exitCode ?? "unknown"}.`;
  state.episodic.sessions.push(toMemoryItem(event, summary));
  if (typeof event.branch === "string") {
    state.working.currentBranch = event.branch;
  }

  const files = Array.isArray(event.changedFiles) ? event.changedFiles.filter((file): file is string => typeof file === "string") : [];
  state.working.touchedFiles.push(...files);
  if (exitCode !== 0) {
    state.working.failures.push(toMemoryItem(event, summary));
  }
}

function applyFileChanged(state: HandoffState, event: HandoffEvent): void {
  const file = typeof event.path === "string" ? event.path : "";
  if (file) {
    state.working.touchedFiles.push(file);
    state.working.status = "in_progress";
  }
}

function applyFallback(state: HandoffState, event: HandoffEvent): void {
  if (typeof event.branch === "string") {
    state.working.currentBranch = event.branch;
  }
  const files = Array.isArray(event.changedFiles) ? event.changedFiles.filter((file): file is string => typeof file === "string") : [];
  state.working.touchedFiles.push(...files);
  if (files.length > 0 && state.working.currentTask === "Unspecified") {
    state.working.currentTask = "Continue work from latest agent session";
  }
  if (files.length > 0) {
    state.working.status = "in_progress";
  }
}

function applyCommand(state: HandoffState, event: HandoffEvent): void {
  const command = String(event.command ?? "").trim();
  if (!command) {
    return;
  }
  state.working.lastCommands.push(command);
  if (event.status === "failed") {
    const summary = summarizeFailure(String(event.summary ?? `${command} failed.`), command);
    state.working.failures.push(toMemoryItem(event, summary));
  }
}

function toMemoryItem(event: HandoffEvent, content: string): MemoryItem {
  return {
    content,
    timestamp: event.timestamp,
    agent: typeof event.agent === "string" ? event.agent : undefined
  };
}

function renderMemoryList(items: MemoryItem[]): string {
  return renderList(items.map((item) => item.content));
}

function renderList(items: string[]): string {
  if (items.length === 0) {
    return "- None recorded";
  }
  return items.map((item) => `- ${item}`).join("\n");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function postProcessState(state: HandoffState): void {
  state.working.touchedFiles = unique(state.working.touchedFiles.map(summarizeDiffPath));
  state.working.lastCommands = dedupeStrings(state.working.lastCommands).slice(-10);
  state.working.constraints = dedupeMemoryItems(state.working.constraints);
  state.working.failures = removeResolvedFailures(dedupeMemoryItems(state.working.failures), state.episodic.resolved);
  state.working.todos = dedupeMemoryItems(state.working.todos);
  state.working.nextSteps = dedupeMemoryItems(state.working.nextSteps);
  state.episodic.sessions = dedupeMemoryItems(state.episodic.sessions);
  state.episodic.decisions = dedupeMemoryItems(state.episodic.decisions);
  state.episodic.attempts = dedupeMemoryItems(state.episodic.attempts);
  state.episodic.resolved = dedupeMemoryItems(state.episodic.resolved);
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = normalize(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(item);
  }
  return result;
}

function dedupeMemoryItems(items: MemoryItem[]): MemoryItem[] {
  const seen = new Set<string>();
  const result: MemoryItem[] = [];
  for (const item of items) {
    const content = summarizeFailure(item.content);
    const normalized = normalize(content);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push({ ...item, content });
  }
  return result;
}

function removeResolvedFailures(failures: MemoryItem[], resolved: MemoryItem[]): MemoryItem[] {
  if (resolved.length === 0) {
    return failures;
  }
  const resolvedText = resolved.map((item) => normalize(item.content));
  return failures.filter((failure) => {
    const text = normalize(failure.content);
    return !resolvedText.some((resolvedItem) => text.includes(resolvedItem) || resolvedItem.includes(text));
  });
}

function summarizeFailure(content: string, command?: string): string {
  const lines = dedupeStrings(
    content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  );
  if (lines.length <= 3 && !content.includes(" at ")) {
    return content.trim();
  }

  const error =
    lines.find((line) => /(?:error:|expected|received|exception|timeout)/i.test(line)) ??
    lines.find((line) => /(?:fail|failed)/i.test(line)) ??
    lines[0] ??
    "Command failed";
  const failingTest = lines.find((line) => /\.(?:test|spec)\.[tj]sx?/i.test(line));
  const appFrame = lines.find((line) => /\bat .*?(?:src|app|lib|components|tests)\//.test(line));
  const parts = [`Error summary: ${error}`];
  if (appFrame) {
    parts.push(`Top app frame: ${appFrame}`);
  }
  if (failingTest && failingTest !== error) {
    parts.push(`Failing test: ${failingTest}`);
  }
  if (command) {
    parts.push(`Command: ${command}`);
  }
  return parts.join("; ");
}

function summarizeDiffPath(value: string): string {
  return value.replace(/\s+\|.*$/, "").trim();
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
