import { estimateTokens, fixtureNames, percent, prepareFixture, readFile, runCli, timed } from "./lib.js";

for (const name of fixtureNames()) {
  const fixture = prepareFixture(name);
  runCli(fixture.workDir, "compact");
  const result = timed(() => runCli(fixture.workDir, "compile", "--agent", "codex"));
  const handoff = readFile(fixture.workDir, ".handoff/handoffs/codex.md");
  const rawTokens = estimateTokens(fixture.rawContext);
  const handoffTokens = estimateTokens(handoff);
  const compression = rawTokens === 0 ? 0 : 1 - handoffTokens / rawTokens;

  console.log(`Fixture: ${name}`);
  console.log(`Raw tokens: ${rawTokens}`);
  console.log(`Handoff tokens: ${handoffTokens}`);
  console.log(`Compression: ${percent(compression)}`);
  console.log(`Latency: ${result.ms.toFixed(1)}ms`);
  console.log("");
}
