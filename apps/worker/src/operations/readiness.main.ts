import { open } from "node:fs/promises";

import { hostingReadiness, HostingReadinessPacketSchema } from "./HostingReadiness";

async function main() {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) throw new Error("Expected one readiness packet path");
  const handle = await open(file, "r");
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > 65_536) throw new Error("Invalid readiness packet size");
    const bytes = Buffer.alloc(65_537);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 65_536) throw new Error("Invalid readiness packet size");
    const raw = bytes.subarray(0, bytesRead).toString("utf8");
    const result = hostingReadiness(HostingReadinessPacketSchema.parse(JSON.parse(raw)));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!result.evidenceComplete) process.exitCode = 2;
  } finally { await handle.close(); }
}
void main().catch(() => { process.stderr.write("Readiness packet invalid; no activation authorized\n"); process.exitCode = 1; });
