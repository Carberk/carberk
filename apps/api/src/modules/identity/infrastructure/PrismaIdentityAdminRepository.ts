import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma, type PreparedDiagnosticSource, withDiagnosticSourceCommand, assertDiagnosticSourceCommand, userEligibilitySourceCommand } from "@auto-tm/db";

import type { IdentityAdminPort } from "../domain/ports/IdentityAdminPort";

@Injectable()
export class PrismaIdentityAdminRepository implements IdentityAdminPort {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async suspendUser(
    userId: string,
    adminUserId: string,
    reason: string,
    tx?: unknown,
    receipt?: unknown,
    suspendedAt = new Date(),
  ): Promise<{
    suspendedAt: Date;
    suspendedById: string;
    suspensionReason: string;
  }> {
    const run = async (client: Prisma.TransactionClient, prepared: PreparedDiagnosticSource) => {
    if (!prepared || typeof prepared.receiptId !== "string") throw new Error("diagnostic_source_receipt_required");
    await assertDiagnosticSourceCommand(client, prepared, "user_eligibility");
    await client.$queryRaw`SELECT "id" FROM "users" WHERE "id"=${userId} FOR UPDATE`;
    const now = suspendedAt;
    const row = await client.user.update({
      where: { id: userId, suspendedAt: null },
      data: {
        suspendedAt: now,
        suspendedById: adminUserId,
        suspensionReason: reason,
      },
    });
    // Use the caller's suspend transaction for Session revocation too.
    await client.session.deleteMany({ where: { userId } });
    return {
      suspendedAt: row.suspendedAt as Date,
      suspendedById: row.suspendedById as string,
      suspensionReason: row.suspensionReason as string,
    };
    };
    if (tx) return run(tx as Prisma.TransactionClient, receipt as PreparedDiagnosticSource);
    return this.prisma.$transaction(async client => withDiagnosticSourceCommand(client,
      await userEligibilitySourceCommand(client, { userId, actorUserId: adminUserId, suspendedAt, reason }), prepared => run(client, prepared)));
  }

  async unsuspendUser(
    userId: string,
    tx?: unknown,
    receipt?: unknown,
  ): Promise<{
    suspendedAt: null;
    suspendedById: null;
    suspensionReason: null;
  }> {
    const run = async (client: Prisma.TransactionClient, prepared: PreparedDiagnosticSource) => {
    if (!prepared || typeof prepared.receiptId !== "string") throw new Error("diagnostic_source_receipt_required");
    await assertDiagnosticSourceCommand(client, prepared, "user_eligibility");
    await client.$queryRaw`SELECT "id" FROM "users" WHERE "id"=${userId} FOR UPDATE`;
    const row = await client.user.update({
      where: { id: userId, suspendedAt: { not: null } },
      data: {
        suspendedAt: null,
        suspendedById: null,
        suspensionReason: null,
      },
    });
    return {
      suspendedAt: row.suspendedAt as null,
      suspendedById: row.suspendedById as null,
      suspensionReason: row.suspensionReason as null,
    };
    };
    if (tx) return run(tx as Prisma.TransactionClient, receipt as PreparedDiagnosticSource);
    return this.prisma.$transaction(async client => withDiagnosticSourceCommand(client,
      await userEligibilitySourceCommand(client, { userId, actorUserId: userId, suspendedAt: null, reason: null }), prepared => run(client, prepared)));
  }

  async isSuspended(userId: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { suspendedAt: true },
    });
    return row?.suspendedAt != null;
  }

}
