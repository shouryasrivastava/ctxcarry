import fs from "node:fs";
import path from "node:path";
import { CTXCARRY_DIR, ctxcarryPath, rootPath } from "./paths.js";
import { redactText, redactValue } from "./redact.js";
import type { ctxcarryConfig, ctxcarryEvent, ctxcarryState } from "./types.js";

const DEFAULT_STATE: ctxcarryState = {
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

export function defaultConfig(project = path.basename(process.cwd())): ctxcarryConfig {
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
  if (!fs.existsSync(ctxcarryPath())) {
    throw new Error("ctxcarry is not initialized. Run `ctxcarry init` first.");
  }
}

export function initStore(): void {
  fs.mkdirSync(ctxcarryPath("summaries"), { recursive: true });
  fs.mkdirSync(ctxcarryPath("ctxcarrys"), { recursive: true });
  fs.mkdirSync(ctxcarryPath("index"), { recursive: true });
  fs.mkdirSync(ctxcarryPath("sessions"), { recursive: true });

  writeFileIfMissing(rootPath("ctxcarry.config.json"), JSON.stringify(defaultConfig(), null, 2) + "\n");
  writeFileIfMissing(ctxcarryPath("events.jsonl"), "");
  writeFileIfMissing(ctxcarryPath("commands.jsonl"), "");
  writeFileIfMissing(ctxcarryPath("state.json"), JSON.stringify(freshState(), null, 2) + "\n");
  writeFileIfMissing(ctxcarryPath("state.md"), "# ctxcarry State\n\nNo compacted state yet.\n");
}

export function readConfig(): ctxcarryConfig {
  const configPath = rootPath("ctxcarry.config.json");
  if (!fs.existsSync(configPath)) {
    return defaultConfig();
  }
  return JSON.parse(fs.readFileSync(configPath, "utf8")) as ctxcarryConfig;
}

export function readState(): ctxcarryState {
  const statePath = ctxcarryPath("state.json");
  if (!fs.existsSync(statePath)) {
    return freshState();
  }
  return JSON.parse(fs.readFileSync(statePath, "utf8")) as ctxcarryState;
}

export function writeState(state: ctxcarryState): void {
  fs.writeFileSync(ctxcarryPath("state.json"), JSON.stringify(redactValue(state), null, 2) + "\n");
}

export function appendEvent(event: { type: string; timestamp?: string; [key: string]: unknown }): ctxcarryEvent {
  ensureInitialized();
  const fullEvent = redactValue({
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  }) as ctxcarryEvent;
  fs.appendFileSync(ctxcarryPath("events.jsonl"), JSON.stringify(fullEvent) + "\n");
  if (fullEvent.type === "command_run") {
    fs.appendFileSync(ctxcarryPath("commands.jsonl"), JSON.stringify(fullEvent) + "\n");
  }
  return fullEvent;
}

export function readEvents(): ctxcarryEvent[] {
  ensureInitialized();
  const file = ctxcarryPath("events.jsonl");
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ctxcarryEvent);
}

export function writeMarkdownState(markdown: string): void {
  const redacted = redactText(markdown);
  fs.writeFileSync(ctxcarryPath("state.md"), redacted.endsWith("\n") ? redacted : redacted + "\n");
}

export function writeHandoff(agent: string, markdown: string): string {
  const output = ctxcarryPath("ctxcarrys", `${agent}.md`);
  const redacted = redactText(markdown);
  fs.writeFileSync(output, redacted.endsWith("\n") ? redacted : redacted + "\n");
  return output;
}

export function writeManagedFile(filePath: string, markdown: string): void {
  const absolutePath = rootPath(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const start = "<!-- ctxcarry:start -->";
  const end = "<!-- ctxcarry:end -->";
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

export function freshState(): ctxcarryState {
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

export function ctxcarryDirName(): string {
  return CTXCARRY_DIR;
}
