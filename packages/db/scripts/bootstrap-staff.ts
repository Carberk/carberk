#!/usr/bin/env tsx
import "dotenv/config";
import { parseArgs } from "node:util";

import { StaffSchemas } from "@auto-tm/contracts";

import { PrismaService } from "../src/prisma.service";

import { bootstrapStaff } from "./bootstrap-command";


// Explicit operator authority only. Never invoked by an API, seed or migration.
async function main() {
  const { values } = parseArgs({ options: { "user-id": { type: "string" }, capability: { type: "string" }, reason: { type: "string" }, "dry-run": { type: "boolean", default: false } }, strict: true });
  const input = StaffSchemas.StaffGrantChangeSchema.parse({ targetUserId: values["user-id"], capability: values.capability, reason: values.reason, grant: true });
  const prisma = new PrismaService();
  try {
    const result = await prisma.$transaction(async (tx) => {
      return bootstrapStaff(tx, input, values["dry-run"]);
    });
    console.log(result);
  } finally { await prisma.onModuleDestroy(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Staff bootstrap failed"); process.exitCode = 1; });
