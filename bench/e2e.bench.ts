import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { assert, estimateTokens, readFile, runCli } from "./lib.js";

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-e2e-"));
execFileSync("git", ["init"], { cwd: workDir, stdio: "ignore" });
fs.mkdirSync(path.join(workDir, "lib", "auth"), { recursive: true });
fs.writeFileSync(path.join(workDir, "lib", "auth", "google.ts"), "export const redirect = '';\n");

runCli(workDir, "init");
runCli(workDir, "note", "--type", "task", "--text", "Fix Google OAuth redirect bug");
runCli(workDir, "note", "--type", "decision", "--text", "Do not rewrite the auth provider");
runCli(workDir, "note", "--type", "failure", "--text", "Production callback returns 400");
runCli(workDir, "note", "--type", "next", "--text", "Check redirect URI construction");
fs.appendFileSync(path.join(workDir, "lib", "auth", "google.ts"), "export const changed = true;\n");
runCli(workDir, "capture");
runCli(workDir, "switch", "codex", "--budget", "4000");

const agents = readFile(workDir, "AGENTS.md");
assert(agents.includes("Fix Google OAuth redirect bug"), "AGENTS.md is missing task");
assert(agents.includes("lib/auth/google.ts"), "AGENTS.md is missing touched file");
assert(agents.includes("Do not rewrite the auth provider"), "AGENTS.md is missing decision");
assert(agents.includes("Production callback returns 400"), "AGENTS.md is missing failure");
assert(agents.includes("Check redirect URI construction"), "AGENTS.md is missing next step");
assert(estimateTokens(agents) <= 4000, "AGENTS.md exceeds token budget");

console.log("End-to-end Claude to Codex benchmark: PASS");
console.log(`Handoff tokens: ${estimateTokens(agents)}`);
console.log(`Work dir: ${workDir}`);
