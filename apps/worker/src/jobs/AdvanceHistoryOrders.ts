import type { PrismaService } from "@auto-tm/db";

/** No provider, money or customer transport exists here. This only advances
 * synthetic commitments and category-specific private-record schedules. */
export class AdvanceHistoryOrders {
 constructor(private readonly db: PrismaService) {}
 async execute(now: Date): Promise<void> {
  const candidates = await this.db.historyOrder.findMany({ where: { erasedAt: null, OR: [{ state: "held", holdExpiresAt: { lte: now } }, { paidAt: { not: null }, state: { notIn: ["delivered", "refunded", "refund_pending"] }, OR: [{ recoveryDeadline: { lte: now } }, { recoveryDeadline: null, promiseAt: { lte: now }, escalatedAt: null }] }] }, orderBy: { createdAt: "asc" }, take: 100 });
  for (const candidate of candidates) await this.db.$transaction(async tx => {
   await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id=${candidate.requestId} FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM service_conversations WHERE "historyRequestId"=${candidate.requestId} FOR UPDATE`;
   await tx.$queryRaw`SELECT day FROM history_capacity_days WHERE day=${candidate.day} FOR UPDATE`;
   const order = await tx.historyOrder.findUnique({ where: { id: candidate.id }, include: { request: { include: { conversation: true } } } });
   if (!order || order.erasedAt || order.request.mode !== "synthetic" || order.request.conversation?.erasedAt || !order.request.customerId) return;
   if (order.state === "held" && order.holdExpiresAt <= now) await tx.historyOrder.update({ where: { id: order.id }, data: { state: "expired", version: { increment: 1 } } });
   else if (order.paidAt && !["delivered","refunded","refund_pending"].includes(order.state) && (order.recoveryDeadline ?? order.promiseAt) <= now) {
    await tx.historyOrder.update({ where: { id: order.id }, data: { escalatedAt: order.escalatedAt ?? now, ...(order.recoveryUsed ? { state: "refund_pending" } : {}), version: { increment: 1 } } });
    if (order.recoveryUsed) await tx.historyRefund.upsert({ where: { orderId: order.id }, create: { orderId: order.id, reason: "Recovery deadline missed" }, update: {} });
    await tx.serviceAudit.create({ data: { purpose: "history", resourceId: order.requestId, action: order.recoveryUsed ? "HISTORY_RECOVERY_MISSED" : "HISTORY_PROMISE_MISSED", assignmentVersion: order.request.assignmentVersion } });
   }
  });
  // Restrict expired provider rights before queuing byte deletion. No restored
  // account or known artifact key can revive a removed/restricted original.
  await this.db.$executeRaw`WITH retired AS (
   UPDATE history_artifacts SET state='restricted', "restrictedAt"=COALESCE("restrictedAt",${now}::timestamp)
   WHERE "removedAt" IS NULL AND ("restrictedAt" IS NOT NULL OR (rights->'schedule'->>'kind'='until' AND (rights->'schedule'->>'until')::timestamptz <= ${now}))
    AND COALESCE((rights->'hold'->>'until')::timestamptz,'-infinity'::timestamptz) <= ${now}
   RETURNING id,"objectKey",sha256)
   INSERT INTO history_artifact_cleanup ("artifactId","objectKey",sha256,epoch,"requestedAt") SELECT id,"objectKey",sha256,1,${now}::timestamp FROM retired ON CONFLICT ("artifactId") DO NOTHING`;
  // Payment claims follow only their recorded category schedule and specific hold.
  // Account erasure may have already removed access, but retained held records
  // still become erasable when their specific hold ends.
  await this.db.$executeRaw`UPDATE history_payments p SET claim=NULL, "attachmentId"=NULL, evidence=NULL, "confirmedById"=NULL FROM history_orders o
   WHERE p."orderId"=o.id AND o.rights->'schedule'->>'kind'='until' AND (o.rights->'schedule'->>'until')::timestamptz <= ${now}
    AND COALESCE((o.rights->'hold'->>'until')::timestamptz,'-infinity'::timestamptz) <= ${now}`;
 }
}
