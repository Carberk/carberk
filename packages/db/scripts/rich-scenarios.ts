/** Explicit additive operator. Existing readiness/reset commands remain separate. */
import { readFileSync } from "node:fs";

import { config, parse } from "dotenv";

import { richTarget } from "./ui-fixtures/rich-target";

async function main() {
  config({ quiet: true });
  const args = process.argv.slice(2);
  const workerIndex = args.lastIndexOf("--worker-env");
  const workerFile = workerIndex >= 0 ? args[workerIndex + 1] : undefined;
  const target = richTarget(args, process.env, workerFile ? parse(readFileSync(workerFile)) : undefined);
  if (target.video && !workerFile) throw new Error("Video scenarios require --worker-env pointing to the existing selected local worker config");
  // Guard precedes even loading the DB/storage/renderer implementation.
  const { runRichScenarios } = await import("./ui-fixtures/rich-scenarios");
  console.log(JSON.stringify(await runRichScenarios(target), null, 2));
}
void main().catch((error: unknown) => {
  // Executor errors contain bounded resource receipts, never driver messages.
  console.error(error instanceof Error ? error.message : "Rich scenarios refused");
  process.exitCode = 1;
});
