export type AgentName = "codex" | "claude" | "cursor" | "windsurf" | string;

export type NoteType = "decision" | "failure" | "todo" | "constraint" | "task" | "next" | "resolved";

export interface AgentConfig {
  enabled: boolean;
  output: string;
  command?: string;
}

export interface ctxcarryConfig {
  project: string;
  default_budget_tokens: number;
  agents: Record<string, AgentConfig>;
  ignore: string[];
  capture: {
    git_diff: boolean;
    commands: boolean;
    test_outputs: boolean;
    file_changes: boolean;
  };
  summarizer: {
    provider: "deterministic" | "openai";
    model?: string;
  };
}

export interface GitSnapshot {
  isRepo: boolean;
  branch: string | null;
  status: string[];
  changedFiles: string[];
  diffStat: string;
}

export interface ctxcarryEvent {
  type: string;
  timestamp: string;
  agent?: string;
  [key: string]: unknown;
}

export interface MemoryItem {
  content: string;
  timestamp: string;
  agent?: string;
}

export interface ctxcarryState {
  version: 1;
  updatedAt: string;
  persistent: {
    architecture: string[];
    installCommands: string[];
    testCommands: string[];
    conventions: string[];
    deploymentNotes: string[];
  };
  working: {
    currentTask: string;
    status: string;
    currentBranch: string | null;
    touchedFiles: string[];
    constraints: MemoryItem[];
    failures: MemoryItem[];
    todos: MemoryItem[];
    nextSteps: MemoryItem[];
    lastCommands: string[];
  };
  episodic: {
    sessions: MemoryItem[];
    decisions: MemoryItem[];
    attempts: MemoryItem[];
    resolved: MemoryItem[];
  };
}
