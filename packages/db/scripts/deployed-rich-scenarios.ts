/** Separate operator: never load ambient dotenv, never widen local helpers. */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { parse } from "dotenv";

import { deployedRichTarget, runDeployedRich, type BackupEvidence, type DeployedPlan, type StagingEvidence } from "./ui-fixtures/deployed-rich";

async function main() {
  const { values } = parseArgs({ options: { binding: { type: "string" }, "api-env": { type: "string" }, "worker-env": { type: "string" },
    "database-env": { type: "string" }, "storage-env": { type: "string" }, "redis-env": { type: "string" },
    mode: { type: "string" }, plan: { type: "string" }, staging: { type: "string" }, backup: { type: "string" } } });
  if (!values.binding || !values["api-env"] || !values["worker-env"] || !values["database-env"] || !values["storage-env"] || !values["redis-env"] || !["check", "plan", "apply"].includes(values.mode ?? "")) throw new Error();
  const json = async (path: string) => JSON.parse(await readFile(path, "utf8")) as unknown;
  const context = deployedRichTarget(await json(values.binding), parse(await readFile(values["api-env"])), parse(await readFile(values["worker-env"])), { database: parse(await readFile(values["database-env"])), storage: parse(await readFile(values["storage-env"])), redis: parse(await readFile(values["redis-env"])) });
  console.log(JSON.stringify(await runDeployedRich(context, { mode: values.mode as "check" | "plan" | "apply",
    plan: values.plan ? await json(values.plan) as DeployedPlan : undefined,
    staging: values.staging ? await json(values.staging) as StagingEvidence : undefined,
    backup: values.backup ? await json(values.backup) as BackupEvidence : undefined }), null, 2));
}
void main().catch(() => {
  // Driver/parse/executor errors can contain private URLs or user-controlled data.
  console.error("Deployed rich target refused; inspect private operator inputs. No automatic repair or cleanup.");
  process.exitCode = 1;
});
