import { estimateTokens, fixtureNames, percent, prepareFixture, readFile, runCli, timed } from "./lib.js";

for (const name of fixtureNames()) {
  const fixture = prepareFixture(name);
  runCli(fixture.workDir, "compact");
  const result = timed(() => runCli(fixture.workDir, "compile", "--agent", "codex"));
  const ctxcarry = readFile(fixture.workDir, ".ctxcarry/ctxcarrys/codex.md");
  const rawTokens = estimateTokens(fixture.rawContext);
  const handoffTokens = estimateTokens(ctxcarry);
  const compression = rawTokens === 0 ? 0 : 1 - handoffTokens / rawTokens;

  console.log(`Fixture: ${name}`);
  console.log(`Raw tokens: ${rawTokens}`);
  console.log(`ctxcarry tokens: ${handoffTokens}`);
  console.log(`Compression: ${percent(compression)}`);
  console.log(`Latency: ${result.ms.toFixed(1)}ms`);
  console.log("");
}
