import fs from "node:fs";
import { handoffPath } from "./paths.js";
import { readState, writeManagedFile } from "./store.js";

export function learnFromSessions(apply: boolean): string {
  const state = readState();
  const lines = [
    "# Handoff Learned Guidance",
    "",
    "These rules were mined from local Handoff memory. Review before relying on them.",
    "",
    "## Decisions To Preserve",
    ...list(state.episodic.decisions.map((item) => item.content)),
    "",
    "## Resolved Failure Lessons",
    ...list(state.episodic.resolved.map((item) => item.content)),
    "",
    "## Active Failure Warnings",
    ...list(state.working.failures.map((item) => item.content))
  ];
  const markdown = lines.join("\n");
  if (apply) {
    fs.writeFileSync(handoffPath("learned.md"), `${markdown}\n`);
    writeManagedFile("AGENTS.md", markdown);
    writeManagedFile("CLAUDE.md", markdown);
  }
  return markdown;
}

function list(items: string[]): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ["- None recorded"];
}
