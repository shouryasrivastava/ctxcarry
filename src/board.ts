import fs from "node:fs";

import { ctxcarryPath } from "./paths.js";
import { ensureBoard } from "./setup.js";

export type BoardStatus = "Todo" | "In Progress" | "Verifying" | "Done" | "Failed" | "Needs Review";

export function boardCommand(): void {
  ensureBoard();
  console.log(fs.readFileSync(ctxcarryPath("board.md"), "utf8").trimEnd());
}

export function updateBoard(task: string, status: BoardStatus): void {
  ensureBoard();
  const boardPath = ctxcarryPath("board.md");
  const lines = fs.readFileSync(boardPath, "utf8").split("\n");
  const escapedTask = task.replaceAll("|", "\\|");
  const updated = new Date().toISOString();
  const row = `| ${status} | ${escapedTask} | ${updated} |`;
  const index = lines.findIndex((line) => line.includes(`| ${escapedTask} |`));
  if (index >= 0) {
    lines[index] = row;
  } else {
    if (lines.length && lines[lines.length - 1] !== "") lines.push("");
    lines.push(row);
  }
  fs.writeFileSync(boardPath, `${lines.join("\n").replace(/\n+$/, "")}\n`);
}
