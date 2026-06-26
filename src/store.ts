import fs from "node:fs";
import path from "node:path";
import { HANDOFF_DIR, handoffPath, rootPath } from "./paths.js";
import { redactText, redactValue } from "./redact.js";
import type { HandoffConfig, HandoffEvent, HandoffState } from "./types.js";

const DEFAULT_STATE: HandoffState = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  persistent: {
    architecture: [],
    installCommands: [],
    testCommands: [],
    conventions: [],
    deploymentNotes: []
  },
  working: {
    currentTask: "Unspecified",
    status: "not_started",
    currentBranch: null,
    touchedFiles: [],
    constraints: [],
    failures: [],
    todos: [],
    nextSteps: [],
    lastCommands: []
  },
  episodic: {
    sessions: [],
    decisions: [],
    attempts: [],
    resolved: []
  }
};

export function defaultConfig(project = path.basename(process.cwd())): HandoffConfig {
  return {
    project,
    default_budget_tokens: 12000,
    agents: {
      codex: {
        enabled: true,
        output: "AGENTS.md"
      },
      claude: {
        enabled: true,
        output: "CLAUDE.md",
        command: "claude"
      }
    },
    ignore: ["node_modules/**", ".next/**", "dist/**", "build/**", "pnpm-lock.yaml"],
    capture: {
      git_diff: true,
      commands: true,
      test_outputs: true,
      file_changes: true
    },
    summarizer: {
      provider: "deterministic"
    }
  };
}

export function ensureInitialized(): void {
  if (!fs.existsSync(handoffPath())) {
    throw new Error("Handoff is not initialized. Run `handoff init` first.");
  }
}

export function initStore(): void {
  fs.mkdirSync(handoffPath("summaries"), { recursive: true });
  fs.mkdirSync(handoffPath("handoffs"), { recursive: true });
  fs.mkdirSync(handoffPath("index"), { recursive: true });
  fs.mkdirSync(handoffPath("sessions"), { recursive: true });

  writeFileIfMissing(rootPath("handoff.config.json"), JSON.stringify(defaultConfig(), null, 2) + "\n");
  writeFileIfMissing(handoffPath("events.jsonl"), "");
  writeFileIfMissing(handoffPath("commands.jsonl"), "");
  writeFileIfMissing(handoffPath("state.json"), JSON.stringify(freshState(), null, 2) + "\n");
  writeFileIfMissing(handoffPath("state.md"), "# Handoff State\n\nNo compacted state yet.\n");
}

export function readConfig(): HandoffConfig {
  const configPath = rootPath("handoff.config.json");
  if (!fs.existsSync(configPath)) {
    return defaultConfig();
  }
  return JSON.parse(fs.readFileSync(configPath, "utf8")) as HandoffConfig;
}

export function readState(): HandoffState {
  const statePath = handoffPath("state.json");
  if (!fs.existsSync(statePath)) {
    return freshState();
  }
  return JSON.parse(fs.readFileSync(statePath, "utf8")) as HandoffState;
}

export function writeState(state: HandoffState): void {
  fs.writeFileSync(handoffPath("state.json"), JSON.stringify(redactValue(state), null, 2) + "\n");
}

export function appendEvent(event: { type: string; timestamp?: string; [key: string]: unknown }): HandoffEvent {
  ensureInitialized();
  const fullEvent = redactValue({
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  }) as HandoffEvent;
  fs.appendFileSync(handoffPath("events.jsonl"), JSON.stringify(fullEvent) + "\n");
  if (fullEvent.type === "command_run") {
    fs.appendFileSync(handoffPath("commands.jsonl"), JSON.stringify(fullEvent) + "\n");
  }
  return fullEvent;
}

export function readEvents(): HandoffEvent[] {
  ensureInitialized();
  const file = handoffPath("events.jsonl");
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HandoffEvent);
}

export function writeMarkdownState(markdown: string): void {
  const redacted = redactText(markdown);
  fs.writeFileSync(handoffPath("state.md"), redacted.endsWith("\n") ? redacted : redacted + "\n");
}

export function writeHandoff(agent: string, markdown: string): string {
  const output = handoffPath("handoffs", `${agent}.md`);
  const redacted = redactText(markdown);
  fs.writeFileSync(output, redacted.endsWith("\n") ? redacted : redacted + "\n");
  return output;
}

export function writeManagedFile(filePath: string, markdown: string): void {
  const absolutePath = rootPath(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const start = "<!-- handoff:start -->";
  const end = "<!-- handoff:end -->";
  const block = `${start}\n${redactText(markdown).trim()}\n${end}`;

  if (!fs.existsSync(absolutePath)) {
    fs.writeFileSync(absolutePath, `${block}\n`);
    return;
  }

  const existing = fs.readFileSync(absolutePath, "utf8");
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  const next = pattern.test(existing) ? existing.replace(pattern, block) : `${existing.trimEnd()}\n\n${block}\n`;
  fs.writeFileSync(absolutePath, next.endsWith("\n") ? next : next + "\n");
}

export function freshState(): HandoffState {
  return {
    ...DEFAULT_STATE,
    updatedAt: new Date().toISOString(),
    persistent: { ...DEFAULT_STATE.persistent },
    working: {
      ...DEFAULT_STATE.working,
      touchedFiles: [],
      constraints: [],
      failures: [],
      todos: [],
      nextSteps: [],
      lastCommands: []
    },
    episodic: {
      sessions: [],
      decisions: [],
      attempts: [],
      resolved: []
    }
  };
}

function writeFileIfMissing(filePath: string, content: string): void {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function handoffDirName(): string {
  return HANDOFF_DIR;
}
