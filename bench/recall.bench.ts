import { fixtureNames, itemRecall, percent, prepareFixture, readState, runCli, scalarRecall } from "./lib.js";

let total = 0;
let count = 0;

for (const name of fixtureNames()) {
  const fixture = prepareFixture(name);
  runCli(fixture.workDir, "compact");
  const state = readState(fixture.workDir);

  const scores = {
    task: scalarRecall(state.working.currentTask, fixture.expected.currentTask),
    files: itemRecall(state.working.touchedFiles, fixture.expected.touchedFiles),
    decisions: itemRecall(state.episodic.decisions.map((item: any) => item.content), fixture.expected.decisions),
    constraints: itemRecall(state.working.constraints.map((item: any) => item.content), fixture.expected.constraints),
    failures: itemRecall(state.working.failures.map((item: any) => item.content), fixture.expected.failures),
    commands: itemRecall(state.working.lastCommands, fixture.expected.lastCommands),
    nextSteps: itemRecall(state.working.nextSteps.map((item: any) => item.content), fixture.expected.nextSteps)
  };

  const overall = Object.values(scores).reduce((sum, score) => sum + score, 0) / Object.values(scores).length;
  total += overall;
  count += 1;

  console.log(`Fixture: ${name}`);
  console.log(`Task recall: ${percent(scores.task)}`);
  console.log(`File recall: ${percent(scores.files)}`);
  console.log(`Decision recall: ${percent(scores.decisions)}`);
  console.log(`Constraint recall: ${percent(scores.constraints)}`);
  console.log(`Failure recall: ${percent(scores.failures)}`);
  console.log(`Command recall: ${percent(scores.commands)}`);
  console.log(`Next-step recall: ${percent(scores.nextSteps)}`);
  console.log(`Overall recall: ${percent(overall)}`);
  console.log("");
}

console.log(`Mean overall recall: ${percent(total / count)}`);
