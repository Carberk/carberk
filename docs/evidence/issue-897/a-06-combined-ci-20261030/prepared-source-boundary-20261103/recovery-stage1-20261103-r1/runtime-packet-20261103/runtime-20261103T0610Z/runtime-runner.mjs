import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

const exec = promisify(execFile);
const packet = "/Users/bagtyyar/.t3/worktrees/carberk/agent-release897-candidate-a-20261029/docs/evidence/issue-897/a-06-combined-ci-20261030/prepared-source-boundary-20261103/recovery-stage1-20261103-r1/runtime-packet-20261103";
const stage = JSON.parse(readFileSync(`${packet}/stage-command.json`, "utf8"));
const cleanup = JSON.parse(readFileSync(`${packet}/cleanup-command-packet.json`, "utf8"));
const root = "/tmp/issue938-runtime-packet-20261103";
const runRoot = `${root}/run-20261103T0610Z`;
const rawRoot = `${runRoot}/raw`;
const outputRoot = `${root}/owned-output`;
mkdirSync(rawRoot, { recursive: true });
mkdirSync(outputRoot, { recursive: true });
const baseEnv = { ...process.env };
const records = [];
const safeName = name => name.replace(/[^a-zA-Z0-9._-]+/g, "_");
async function runStep(phase, name, argv, cwd, environment = {}, output = null) {
  const started = new Date();
  const env = { ...baseEnv, ...environment };
  let exit = 0, stdout = "", stderr = "";
  try {
    const result = await exec(argv[0], argv.slice(1), { cwd, env, maxBuffer: 64 * 1024 * 1024 });
    stdout = result.stdout ?? ""; stderr = result.stderr ?? "";
  } catch (error) {
    exit = typeof error.code === "number" ? error.code : 1;
    stdout = error.stdout ?? ""; stderr = error.stderr ?? String(error);
  }
  if (output) {
    writeFileSync(output.stdout, stdout);
    writeFileSync(output.stderr, stderr);
  }
  const stdoutPath = `${rawRoot}/${safeName(phase)}-${safeName(name)}.stdout`;
  const stderrPath = `${rawRoot}/${safeName(phase)}-${safeName(name)}.stderr`;
  writeFileSync(stdoutPath, stdout); writeFileSync(stderrPath, stderr);
  const ended = new Date();
  const record = { phase, name, argv, cwd, environment: Object.fromEntries(Object.keys(environment).map(key => [key, environment[key]])), startedAt: started.toISOString(), endedAt: ended.toISOString(), durationMs: ended - started, exit, stdoutPath, stderrPath };
  records.push(record);
  writeFileSync(`${rawRoot}/${safeName(phase)}-${safeName(name)}.json`, JSON.stringify(record, null, 2) + "\n");
  process.stdout.write(`${phase}/${name}: exit ${exit}\n`);
  return exit;
}
const commandEnvironment = { ...stage.environment, ...stage.setupEnvironment, RUNTIME_PACKET_WORKDIR: stage.workingDirectory, COMPOSE_PROJECT: stage.setupEnvironment.COMPOSE_PROJECT, COMPOSE_BASE_FILE: stage.setupEnvironment.COMPOSE_BASE_FILE, COMPOSE_OVERLAY: stage.setupEnvironment.COMPOSE_OVERLAY };
let setupFailed = false;
for (const step of stage.setup) {
  const exit = await runStep("setup", step.name, step.argv, step.cwd, step.environment ?? commandEnvironment);
  if (exit !== 0) { setupFailed = true; break; }
}
let stageExit = null;
if (!setupFailed) {
  stageExit = await runStep("stage", "seven-case-vitest", stage.argv, stage.workingDirectory, stage.environment, { stdout: stage.capture.stdout, stderr: stage.capture.stderr });
}
const cleanupList = setupFailed ? cleanup.failedSetupFallback : cleanup.normalCleanup;
for (const step of cleanupList) await runStep(setupFailed ? "fallback" : "cleanup", step.name, step.argv, step.cwd, step.environment ?? {});
const summary = { recordedAt: new Date().toISOString(), packet, setupFailed, stageExit, cleanupPath: setupFailed ? "failedSetupFallback" : "normalCleanup", records, runtimePass: !setupFailed && stageExit === 0 && records.filter(r => r.phase === "cleanup" && r.exit !== 0).length === 0 };
writeFileSync(`${runRoot}/run-summary.json`, JSON.stringify(summary, null, 2) + "\n");
process.stdout.write(JSON.stringify({ setupFailed, stageExit, cleanupFailures: records.filter(r => (r.phase === "cleanup" || r.phase === "fallback") && r.exit !== 0).map(r => r.name), runSummary: `${runRoot}/run-summary.json` }) + "\n");
process.exitCode = summary.runtimePass ? 0 : 1;
