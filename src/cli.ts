#!/usr/bin/env node
import { captureSnapshot, runAgent } from "./capture.js";
import { compileAgent, handoffTokenEstimate, rawEventText, renderCurrentHandoff } from "./compile.js";
import { compactState } from "./distill.js";
import { learnFromSessions } from "./learn.js";
import { serveMcp } from "./mcp-server.js";
import { estimateSavings, estimateTokens } from "./tokens.js";
import { appendEvent, ctxcarryDirName, ensureInitialized, initStore, readState } from "./store.js";

interface ParsedArgs {
  command?: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  try {
    switch (args.command) {
      case undefined:
      case "--help":
      case "-h":
      case "help":
        printHelp();
        return;
      case "init":
        initStore();
        console.log(`Initialized ${ctxcarryDirName()}/ and ctxcarry.config.json`);
        return;
      case "capture":
        ensureInitialized();
        printSnapshot(captureSnapshot(stringFlag(args, "agent")));
        return;
      case "note":
        ensureInitialized();
        addNote(args);
        return;
      case "run":
        ensureInitialized();
        {
          const result = await runAgent(requiredPositional(args, 0, "agent"));
          console.log(`Recorded session ${result.sessionId}.`);
          console.log(`Session files: ${result.sessionDir}`);
          process.exitCode = result.exitCode;
        }
        return;
      case "compact":
        ensureInitialized();
        compactState();
        console.log("Compacted .ctxcarry/state.json and .ctxcarry/state.md");
        return;
      case "compile":
        ensureInitialized();
        compileCommand(args);
        return;
      case "switch":
        ensureInitialized();
        switchCommand(args);
        return;
      case "status":
        ensureInitialized();
        statusCommand();
        return;
      case "tokens":
        ensureInitialized();
        tokensCommand(args);
        return;
      case "learn":
        ensureInitialized();
        learnCommand(args);
        return;
      case "mcp":
        ensureInitialized();
        await mcpCommand(args);
        return;
      default:
        throw new Error(`Unknown command "${args.command}". Run \`ctxcarry --help\`.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ctxcarry: ${message}`);
    process.exitCode = 1;
  }
}

function addNote(args: ParsedArgs): void {
  const type = stringFlag(args, "type");
  const text = stringFlag(args, "text");
  const agent = stringFlag(args, "agent");
  if (!type || !["decision", "failure", "todo", "constraint", "task", "next", "resolved"].includes(type)) {
    throw new Error("`ctxcarry note` requires --type decision|failure|todo|constraint|task|next|resolved.");
  }
  if (!text) {
    throw new Error("`ctxcarry note` requires --text.");
  }
  appendEvent({
    type: "note",
    noteType: type,
    content: text,
    agent
  });
  console.log(`Recorded ${type} note.`);
}

function compileCommand(args: ParsedArgs): void {
  const agent = stringFlag(args, "agent") ?? requiredPositional(args, 0, "agent");
  const output = compileAgent(agent, numberFlag(args, "budget"));
  console.log(`Compiled ${agent} ctxcarry to ${output}`);
}

function switchCommand(args: ParsedArgs): void {
  const agent = requiredPositional(args, 0, "agent");
  compactState();
  const output = compileAgent(agent, numberFlag(args, "budget"));
  console.log(`Prepared ${agent} ctxcarry in ${output}.`);
  if (agent === "codex") {
    console.log("Next: run `codex` in this repo.");
  }
}

function statusCommand(): void {
  const state = readState();
  const failures = state.working.failures.length;
  const estimate = handoffTokenEstimate("codex");
  console.log(`Current task: ${state.working.currentTask}`);
  console.log(`Status: ${state.working.status}`);
  console.log(`Current branch: ${state.working.currentBranch ?? "Unknown"}`);
  console.log(`Files touched: ${state.working.touchedFiles.length}`);
  console.log(`Open failures: ${failures}`);
  console.log(`Decisions: ${state.episodic.decisions.length}`);
  console.log(`Token estimate for Codex Handoff: ${estimate}`);
}

function tokensCommand(args: ParsedArgs): void {
  const agent = stringFlag(args, "agent") ?? "codex";
  const packed = renderCurrentHandoff(agent, numberFlag(args, "budget"));
  const raw = rawEventText();
  console.log(`Agent: ${agent}`);
  console.log(`Packed estimate: ${estimateTokens(packed)} tokens`);
  console.log(`Raw event estimate: ${estimateTokens(raw)} tokens`);
  console.log(`Estimated savings: ${estimateSavings(raw, packed)}%`);
}

function printSnapshot(snapshot: ReturnType<typeof captureSnapshot>): void {
  console.log(snapshot.isRepo ? "Captured git snapshot." : "Captured snapshot outside a git repository.");
  console.log(`Branch: ${snapshot.branch ?? "Unknown"}`);
  console.log(`Changed files: ${snapshot.changedFiles.length}`);
}

function printHelp(): void {
  console.log(`ctxcarry local agent ctxcarry CLI

Usage:
  ctxcarry init
  ctxcarry capture [--agent claude]
  ctxcarry note --type decision|failure|todo|constraint|task|next|resolved --text "..."
  ctxcarry run <agent>
  ctxcarry compact
  ctxcarry compile --agent codex|claude [--budget 4000]
  ctxcarry switch <agent> [--budget 4000]
  ctxcarry status
  ctxcarry tokens [--agent codex] [--budget 4000]
  ctxcarry learn [--apply]
  ctxcarry mcp serve
`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const next = rest[index + 1];
      if (next && !next.startsWith("--")) {
        flags[name] = next;
        index += 1;
      } else {
        flags[name] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

function stringFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}

function requiredPositional(args: ParsedArgs, index: number, name: string): string {
  const value = args.positional[index];
  if (!value) {
    throw new Error(`Missing required ${name}.`);
  }
  return value;
}

function numberFlag(args: ParsedArgs, name: string): number | undefined {
  const value = stringFlag(args, name);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive number.`);
  }
  return parsed;
}

function learnCommand(args: ParsedArgs): void {
  const markdown = learnFromSessions(Boolean(args.flags.apply));
  console.log(markdown);
  if (args.flags.apply) {
    console.log("\nApplied learned guidance to .ctxcarry/learned.md, AGENTS.md, and CLAUDE.md");
  }
}

async function mcpCommand(args: ParsedArgs): Promise<void> {
  const subcommand = requiredPositional(args, 0, "mcp subcommand");
  if (subcommand !== "serve") {
    throw new Error("Only `ctxcarry mcp serve` is supported.");
  }
  await serveMcp();
}

await main();
