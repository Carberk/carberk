import { readFileSync } from "node:fs";
const path = process.env.STAGE_STDOUT_PATH;
if (!path) throw new Error("STAGE_STDOUT_PATH is required");
const text = readFileSync(path, "utf8");
const segments = text.split("938_cleanup_receipt").slice(1);
if (segments.length !== 7) throw new Error(`expected exactly seven cleanup receipts, found ${segments.length}`);
const required = ["callers: 0", "sourceReceipts: 0", "campaignReceipts: 0", "objectsEmpty: true", "roleAbsent: true", "guardModesRestored: true", "failures: []"];
for (const [index, segment] of segments.entries()) {
  for (const marker of required) if (!segment.includes(marker)) throw new Error(`receipt ${index + 1} missing ${marker}`);
}
process.stdout.write(JSON.stringify({ receipts: segments.length, failures: 0, sourceReceipts: 0, campaignReceipts: 0, objectsEmpty: true, rolesAbsent: true, guardsRestored: true }) + "\n");
