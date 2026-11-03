import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const packet = new URL(".", import.meta.url).pathname;
const stagePath = join(packet, "stage-command.json");
const cleanupPath = join(packet, "cleanup-command-packet.json");
const stage = JSON.parse(readFileSync(stagePath, "utf8"));
const cleanup = JSON.parse(readFileSync(cleanupPath, "utf8"));
const fail = message => { throw new Error(message); };
const expect = (condition, message) => condition || fail(message);
const selector = stage.argv.at(-1);
const caseNames = stage.exactCaseNames;
const selectorMatch = new RegExp(selector);
const setupNames = stage.setup.map(step => step.name);
const cleanupNames = cleanup.normalCleanup.map(step => step.name);
const fallbackNames = cleanup.failedSetupFallback.map(step => step.name);
expect(selector.includes("issue938 recovery stage1 > ("), "selector does not include the Vitest describe separator");
expect(caseNames.length === 7 && caseNames.every(name => selectorMatch.test(`issue938 recovery stage1 > ${name}`)), "selector does not match all seven exact case names");
expect(setupNames.includes("compose-up-owned-project") && setupNames.includes("postgres-port") && setupNames.includes("redis-port") && setupNames.includes("minio-port") && setupNames.includes("create-base-database"), "executable Compose/port/base setup is incomplete");
expect(cleanupNames.indexOf("postgres-source-campaign-residuals") < cleanupNames.indexOf("owned-postgres-cleanup"), "named database residuals are ordered after database cleanup");
expect(cleanupNames.indexOf("s3-registry-residuals") < cleanupNames.indexOf("compose-down-owned-project"), "S3 residual inventory is ordered after Compose teardown");
expect(cleanupNames.includes("postgres-database-role-absence"), "normal database/role absence check is missing");
expect(!JSON.stringify(cleanup).includes("stop-and-drain-callers"), "nonexistent drain script remains referenced");
expect(fallbackNames.includes("execute-anchored-postgres-cleanup"), "fallback does not execute owned cleanup");
const scripts = ["drain-owned-role-backends.mjs", "owned-postgres-cleanup.mjs", "owned-source-campaign-check.mjs", "owned-s3-inventory.mjs"];
for (const script of scripts) {
  const path = join(packet, script);
  expect(existsSync(path), `missing packet helper ${script}`);
  execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
}
const hashes = Object.fromEntries([...scripts, "stage-command.json", "cleanup-command-packet.json"].map(name => [name, createHash("sha256").update(readFileSync(join(packet, name))).digest("hex")]));
const receipt = { recordedAt: new Date().toISOString(), argv: [process.execPath, join(packet, "packet-validation.mjs")], exit: 0, checks: { selectorMatches: caseNames.length, setupNames, cleanupNames, fallbackNames, scriptsSyntaxChecked: scripts.length }, hashes };
writeFileSync(join(packet, "packet-validation-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
process.stdout.write(JSON.stringify(receipt) + "\n");
