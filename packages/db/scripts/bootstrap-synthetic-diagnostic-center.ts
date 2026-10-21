#!/usr/bin/env tsx
import { parseArgs } from "node:util";

// Explicit operator authority only, for staging/test clean acceptance (#901 Q3). Never invoked by an
// API, seed or migration. Inert scaffold: it validates the argument shape, opens no database
// connection and writes nothing. The contract lives in bootstrap-synthetic-diagnostic-center.e2e.spec.ts.
function main() {
  let values: { "center-code"?: string; "user-id"?: string; capability?: string; "dry-run"?: boolean };
  try {
    ({ values } = parseArgs({ options: { "center-code": { type: "string" }, "user-id": { type: "string" }, capability: { type: "string" }, "dry-run": { type: "boolean", default: false } }, strict: true, allowPositionals: false }));
  } catch {
    throw new Error("Refused: arguments");
  }
  if (!values["center-code"] || !values["user-id"] || !values.capability) throw new Error("Refused: arguments");
  throw new Error("Synthetic diagnostic center bootstrap not implemented");
}

try { main(); } catch (error: unknown) { console.error(error instanceof Error ? error.message : "Synthetic diagnostic center bootstrap failed"); process.exitCode = 1; }
