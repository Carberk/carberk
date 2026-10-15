import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

import { createGatewayProof } from "./video-protocol-gateway-proof.mjs";

const [directory, binary, receiptPath] = process.argv.slice(2);
if (!directory || !binary || !receiptPath) throw new Error("Usage: native-proof FIXTURE_DIRECTORY COMPILED_BINARY RECEIPT_PATH");
const gateway = await createGatewayProof(directory);
try {
  let output = "";
  const child = spawn(binary, [gateway.url], { stdio: ["ignore", "pipe", "pipe"] });
  child.stderr.resume();
  child.stdout.on("data", (bytes) => { output += bytes; });
  // Native errors can contain the bearer path. Keep stderr private to the process.
  const code = await new Promise((resolve) => child.on("exit", resolve));
  const decoded = JSON.parse(output.trim());
  gateway.current.listingVisible = false;
  const denied = await fetch(gateway.url);
  const receipt = { ...decoded, processExit: code, requests: gateway.receipt, newManifestAfterRemoval: denied.status };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  if (code !== 0 || denied.status !== 404) process.exitCode = 1;
} finally { await gateway.close(); }
