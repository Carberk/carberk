import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@auto-tm/db";

/** Called after current User/business authority, before any upload lock. */
export async function lockEditableBusinessStock(tx: Prisma.TransactionClient, id: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ status: string; deletedAt: Date | null }>>`SELECT "status", "deletedAt" FROM "listings" WHERE "id" = ${id} FOR UPDATE`;
  if (!rows[0] || rows[0].deletedAt) throw new NotFoundException("Listing not found");
  if (rows[0].status === "banned") throw new ForbiddenException({ code: "FORBIDDEN", details: { reason: "MODERATION_BLOCKED" } });
}
