#!/usr/bin/env tsx
import "dotenv/config";
import { parseArgs } from "node:util";

import { StaffSchemas } from "@auto-tm/contracts";

import { PrismaService } from "../src/prisma.service";

// Explicit operator authority only. Never invoked by an API, seed or migration.
async function main() {
  const { values } = parseArgs({ options: { "user-id": { type: "string" }, capability: { type: "string" }, reason: { type: "string" }, "dry-run": { type: "boolean", default: false } }, strict: true });
  const input = StaffSchemas.StaffGrantChangeSchema.parse({ targetUserId: values["user-id"], capability: values.capability, reason: values.reason, grant: true });
  const prisma = new PrismaService();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<{ id: string; phoneVerifiedAt: Date | null; emailVerifiedAt: Date | null; suspendedAt: Date | null; deletionScheduledAt: Date | null }[]>`
        SELECT "id", "phoneVerifiedAt", "emailVerifiedAt", "suspendedAt", "deletionScheduledAt" FROM "users" WHERE "id" = ${input.targetUserId} FOR UPDATE`;
      const user = users[0];
      if (!user || (!user.phoneVerifiedAt && !user.emailVerifiedAt) || user.suspendedAt || user.deletionScheduledAt) throw new Error("An active verified exact User is required");
      const existing = await tx.staffGrant.findUnique({ where: { userId_capability: { userId: user.id, capability: input.capability } } });
      if (existing && !existing.revokedAt) return "Already granted; no change";
      if (values["dry-run"]) return "Dry run; would grant the named capability and write bootstrap audit";
      await tx.staffGrant.upsert({ where: { userId_capability: { userId: user.id, capability: input.capability } }, create: { userId: user.id, capability: input.capability }, update: { revokedAt: null, grantedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: null, action: "STAFF_CAPABILITY_BOOTSTRAP", targetType: "User", targetId: user.id, details: { capability: input.capability, reason: input.reason } } });
      return "Named capability granted with bootstrap audit";
    });
    console.log(result);
  } finally { await prisma.onModuleDestroy(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Staff bootstrap failed"); process.exitCode = 1; });
