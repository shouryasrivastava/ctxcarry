import fs from "node:fs";
import { handoffPath } from "./paths.js";
import { estimateTokens } from "./tokens.js";
import { redactText } from "./redact.js";
import { readConfig, readState, writeHandoff, writeManagedFile } from "./store.js";
import type { HandoffState } from "./types.js";

export function compileAgent(agent: string, budgetTokens?: number): string {
  const config = readConfig();
  const state = readState();
  const agentConfig = config.agents[agent];

  if (!agentConfig?.enabled) {
    throw new Error(`Agent "${agent}" is not enabled in handoff.config.json.`);
  }

  const markdown = agent === "claude" ? renderClaude(state, budgetTokens) : renderCodex(state, budgetTokens);
  writeHandoff(agent, markdown);
  writeManagedFile(agentConfig.output, markdown);
  return agentConfig.output;
}

export function renderCodex(state: HandoffState, budgetTokens?: number): string {
  return packToBudget(() => {
    const body = renderHandoff("Codex Handoff", state);
    return [
    "# Handoff Project Context",
    "",
    "Use this compact project state before continuing work. Treat `.handoff/` as the source of truth for generated context.",
    "",
    body
    ].join("\n");
  }, state, "codex", budgetTokens);
}

export function renderClaude(state: HandoffState, budgetTokens?: number): string {
  return packToBudget(() => {
    const body = renderHandoff("Claude Code Handoff", state);
    return [
    "# Handoff Memory",
    "",
    "This file is generated from local Handoff project memory.",
    "",
    body
    ].join("\n");
  }, state, "claude", budgetTokens);
}

export function renderCurrentHandoff(agent = "codex", budgetTokens?: number): string {
  const state = readState();
  return agent === "claude" ? renderClaude(state, budgetTokens) : renderCodex(state, budgetTokens);
}

export function handoffTokenEstimate(agent = "codex"): number {
  const handoff = renderCurrentHandoff(agent);
  return estimateTokens(handoff);
}

export function rawEventText(): string {
  const eventsPath = handoffPath("events.jsonl");
  return fs.existsSync(eventsPath) ? fs.readFileSync(eventsPath, "utf8") : "";
}

function renderHandoff(title: string, state: HandoffState): string {
  const sections: string[] = [
    `## ${title}`,
    "",
    "### Current Task",
    state.working.currentTask,
    "",
    "### Current Status",
    state.working.status,
    "",
    "### Current Branch",
    state.working.currentBranch ?? "Unknown",
    "",
    "### Recommended Next Step",
    renderNextStep(state)
  ];

  appendSection(sections, "Files Touched", state.working.touchedFiles);
  appendSection(sections, "Decisions Made", state.episodic.decisions.map((item) => item.content));
  appendSection(sections, "Constraints", state.working.constraints.map((item) => item.content));
  appendSection(sections, "Known Failures", state.working.failures.map((item) => item.content));
  appendSection(sections, "Last Commands", state.working.lastCommands);
  return redactText(sections.join("\n"));
}

function renderNextStep(state: HandoffState): string {
  const explicit = state.working.nextSteps.at(-1)?.content;
  if (explicit) {
    return explicit;
  }
  const failure = state.working.failures.at(-1)?.content;
  if (failure) {
    return `Investigate current failure: ${failure}`;
  }
  if (state.working.touchedFiles.length > 0) {
    return "Review the touched files and run the relevant tests.";
  }
  return "Record the current task with `handoff note --type task --text \"...\"`.";
}

function renderList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function appendSection(sections: string[], title: string, items: string[]): void {
  if (items.length === 0) {
    return;
  }
  sections.push("", `### ${title}`, renderList(items));
}

function packToBudget(render: () => string, state: HandoffState, agent: "codex" | "claude", budgetTokens?: number): string {
  const full = redactText(render());
  if (!budgetTokens || estimateTokens(full) <= budgetTokens) {
    return full;
  }

  const compactState: HandoffState = {
    ...state,
    working: {
      ...state.working,
      touchedFiles: state.working.touchedFiles.slice(0, 20),
      lastCommands: state.working.lastCommands.slice(-3),
      constraints: state.working.constraints.slice(-10),
      failures: state.working.failures.slice(-10),
      todos: [],
      nextSteps: state.working.nextSteps.slice(-3)
    },
    episodic: {
      ...state.episodic,
      sessions: state.episodic.sessions.slice(-2),
      decisions: state.episodic.decisions.slice(-10),
      attempts: [],
      resolved: []
    }
  };

  const compact = agent === "claude" ? renderClaude(compactState) : renderCodex(compactState);
  if (estimateTokens(compact) <= budgetTokens) {
    return compact;
  }

  const minimum = [
    agent === "claude" ? "# Handoff Memory" : "# Handoff Project Context",
    "",
    `## ${agent === "claude" ? "Claude Code" : "Codex"} Handoff`,
    "",
    "### Current Task",
    truncate(state.working.currentTask, 600),
    "",
    "### Current Status",
    state.working.status,
    "",
    "### Recommended Next Step",
    truncate(renderNextStep(state), 600)
  ];

  appendSection(minimum, "Constraints", state.working.constraints.slice(-5).map((item) => truncate(item.content, 240)));
  appendSection(minimum, "Known Failures", state.working.failures.slice(-5).map((item) => truncate(item.content, 240)));
  appendSection(minimum, "Files Touched", state.working.touchedFiles.slice(0, 10));
  return redactText(minimum.join("\n"));
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}
