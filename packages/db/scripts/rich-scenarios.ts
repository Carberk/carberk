/** Explicit additive operator. Existing readiness/reset commands remain separate. */
import { config } from "dotenv";

import { richTarget } from "./ui-fixtures/rich-target";

async function main() {
  config({ quiet: true });
  const target = richTarget(process.argv.slice(2), process.env);
  // Guard precedes even loading the DB/storage/renderer implementation.
  const { runRichScenarios } = await import("./ui-fixtures/rich-scenarios");
  console.log(JSON.stringify(await runRichScenarios(target), null, 2));
}
void main().catch((error: unknown) => {
  // Executor errors contain bounded resource receipts, never driver messages.
  console.error(error instanceof Error ? error.message : "Rich scenarios refused");
  process.exitCode = 1;
});
