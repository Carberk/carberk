#!/usr/bin/env tsx
import { parseArgs } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { bootstrapSyntheticCenter } from "./bootstrap-command";

import { PrismaClient } from "../generated/prisma/client/client";

// Explicit operator authority only. Never invoked by an API, seed or migration; no dotenv fallback.
const CAPABILITIES = new Set(["diagnostics.reception", "diagnostics.technician", "diagnostics.reviewer", "diagnostics.templates"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CODE = /^synthetic-[a-z0-9][a-z0-9_-]{0,62}$/;
type Values = { "center-code"?: string; "user-id"?: string; capability?: string; "dry-run"?: boolean };

function refuse(reason: string): never { throw new Error(`Refused: ${reason}`); }
function allowlist(value: string | undefined): string[] {
  if (!value) refuse("allowlist");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { refuse("allowlist"); }
  if (!Array.isArray(parsed) || parsed.length > 100 || parsed.some(item => typeof item !== "string" || !UUID.test(item))) refuse("allowlist");
  return parsed as string[];
}
function args(): Values {
  try {
    const { values } = parseArgs({ options: { "center-code": { type: "string" }, "user-id": { type: "string" }, capability: { type: "string" }, "dry-run": { type: "boolean", default: false } }, strict: true, allowPositionals: false });
    if (!values["center-code"] || !values["user-id"] || !values.capability) refuse("arguments");
    return values;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Refused:")) throw error;
    refuse("arguments");
  }
}

async function main() {
  const values = args();
  if (!["staging", "test"].includes(process.env["APP_ENV"] ?? "")) refuse("environment");
  if (process.env["DIAGNOSTIC_SYNTHETIC_ENABLED"] !== "true") refuse("disabled");
  const userId = values["user-id"] as string;
  const centerCode = values["center-code"] as string;
  const capability = values.capability as string;
  if (!UUID.test(userId) || !allowlist(process.env["DIAGNOSTIC_SYNTHETIC_USER_IDS"]).includes(userId)) refuse("allowlist");
  if (!CAPABILITIES.has(capability)) refuse("capability");
  if (!CODE.test(centerCode)) refuse("center-code");
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await db.$transaction(async tx => {
      return bootstrapSyntheticCenter(tx, values);
    });
    console.log(result);
  } finally { await db.$disconnect(); await pool.end(); }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Synthetic diagnostic center bootstrap failed"); process.exitCode = 1; });
