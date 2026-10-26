import { randomUUID } from "node:crypto";

import type { PrismaService, Prisma } from "@auto-tm/db";

import type { RetiredObjectStore } from "./retiredUploadCleanup";
import { withExpiryPreparation } from "./ServiceExpiryPreparation";
import { CampaignSupportRetention } from "./CampaignSupportRetention";
import { serviceAttachmentDue, supportCaseDue } from "./serviceRetention";

/** Database fences commit before storage deletion. A failed object deletion
 * remains durable and is retried, while reads/adoption cannot revive it. */
export class ExpireServiceContent {
 constructor(private readonly db: PrismaService, private readonly objects: RetiredObjectStore, private readonly campaignCandidate: string | undefined = process.env["AUTOTM_COMMIT_SHA"]) {}
 private async cleanup(tx: Prisma.TransactionClient, id: string, epoch: number, keys: string[], now: Date) {
  const prior = await tx.serviceErasureFence.findUnique({ where: { conversationId: id } });
  const priorKeys = Array.isArray(prior?.objectKeys) ? prior.objectKeys.filter((key): key is string => typeof key === "string") : [];
  await tx.serviceErasureFence.upsert({ where: { conversationId: id }, create: { conversationId: id, epoch, objectKeys: keys, erasedAt: now }, update: { epoch, objectKeys: [...new Set([...priorKeys, ...keys])], cleanupCompletedAt: null } });
 }
 async execute(now: Date): Promise<{ supportPurged: number; attachmentsRetired: number; cleanupsCompleted: number }> {
  let supportPurged = 0, attachmentsRetired = 0, cleanupsCompleted = 0;
  const retention = new CampaignSupportRetention(this.db, this.campaignCandidate);
  const cases = await this.db.supportCase.findMany({ where: { status: "closed", closedAt: { lte: new Date(now.getTime() - 90 * 86400000) }, conversation: { erasedAt: null } }, orderBy: { closedAt: "asc" }, take: 100 });
  for (const candidate of cases) {
   const auditId = randomUUID();
   const purge = async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM support_cases WHERE id=${candidate.id} FOR UPDATE`;
    const current = await tx.supportCase.findUnique({ where: { id: candidate.id }, include: { conversation: true } });
    if (!current || !supportCaseDue(current, now) || !current.conversation || current.conversation.erasedAt) return;
    const id = current.conversation.id;
    await tx.$queryRaw`SELECT id FROM service_conversations WHERE id=${id} FOR UPDATE`;
    const files = await tx.serviceAttachment.findMany({ where: { conversationId: id, removedAt: null } });
    // An active specific hold prevents the case purge until its authorized review.
    if (files.some(file => { const hold = (file.rights as { hold?: { until?: string } | null }).hold; return hold?.until && new Date(hold.until) > now; })) return;
    const epoch = current.conversation.lifecycleEpoch + 1;
    await tx.serviceConversation.update({ where: { id }, data: { lifecycleEpoch: epoch, erasedAt: now } });
    await this.cleanup(tx, id, epoch, files.flatMap(file => file.objectKey ? [file.objectKey] : []), now);
    await tx.servicePushSubscription.deleteMany({ where: { conversationId: id } });
    await tx.serviceOutbox.deleteMany({ where: { conversationId: id } });
    await tx.serviceReadState.deleteMany({ where: { conversationId: id } });
    await tx.serviceMessage.deleteMany({ where: { conversationId: id } });
    await tx.serviceAttachment.updateMany({ where: { conversationId: id }, data: { state: "removed", removedAt: now, uploaderId: null } });
    await tx.serviceAudit.updateMany({ where: { purpose: "support", resourceId: current.id }, data: { reason: null } });
    await tx.supportCase.update({ where: { id: current.id }, data: { customerId: null, assigneeId: null, sourceListingId: null, assignmentVersion: { increment: 1 } } });
    await tx.serviceAudit.create({ data: { id: auditId, purpose: "support", resourceId: current.id, action: "SERVICE_CONTENT_PURGED", assignmentVersion: current.assignmentVersion } });
    supportPurged++;
   };
   await retention.run({ caseId: candidate.id }, now, "purge", purge, () => this.db.$transaction(tx => withExpiryPreparation(tx, { caseId: candidate.id, auditId }, () => purge(tx))));
  }
  // Stage expiry and explicit History category schedules are separate rules.
  const dueFiles = await this.db.$queryRaw<{ id: string }[]>`
   SELECT id FROM service_attachments WHERE "removedAt" IS NULL AND (
    (state='staged' AND "expiresAt" <= ${now}) OR
    (rights->'schedule'->>'kind'='until' AND (rights->'schedule'->>'until')::timestamptz <= ${now}
     AND COALESCE((rights->'hold'->>'until')::timestamptz, '-infinity'::timestamptz) <= ${now}))
   ORDER BY "createdAt", id LIMIT 200`;
  const files = await this.db.serviceAttachment.findMany({ where: { id: { in: dueFiles.map(file => file.id) } } });
  for (const candidate of files) {
   if (!(candidate.state === "staged" && candidate.expiresAt <= now) && !serviceAttachmentDue(candidate.rights, now)) continue;
   await this.db.$transaction(tx => withExpiryPreparation(tx, { attachmentId: candidate.id, conversationId: candidate.conversationId }, async () => {
    await tx.$queryRaw`SELECT id FROM service_conversations WHERE id=${candidate.conversationId} FOR UPDATE`;
    const file = await tx.serviceAttachment.findUnique({ where: { id: candidate.id }, include: { conversation: true } });
    if (!file || file.removedAt || (!(file.state === "staged" && file.expiresAt <= now) && !serviceAttachmentDue(file.rights, now))) return;
    const hold = (file.rights as { hold?: { until?: string } | null }).hold;
    if (hold?.until && new Date(hold.until) > now) return;
    await tx.serviceAttachment.update({ where: { id: file.id }, data: { state: "removed", removedAt: now, uploaderId: null } });
    await this.cleanup(tx, file.conversationId, file.conversation.lifecycleEpoch, file.objectKey ? [file.objectKey] : [], now);
    attachmentsRetired++;
   }));
  }
  const artifactWork = await this.db.historyArtifactCleanup.findMany({ where: { completedAt: null }, orderBy: { requestedAt: "asc" }, take: 100 });
  for (const work of artifactWork) {
   await this.db.$transaction(tx => withExpiryPreparation(tx, { artifactId: work.artifactId }, async () => {
    const current = await tx.historyArtifactCleanup.findUnique({ where: { artifactId: work.artifactId } });
    if (!current || current.completedAt || current.epoch !== work.epoch || current.objectKey !== work.objectKey || current.sha256 !== work.sha256) return;
    await tx.$queryRaw`SELECT id FROM history_artifacts WHERE id=${work.artifactId} FOR UPDATE`;
    const artifact = await tx.historyArtifact.findUnique({ where: { id: work.artifactId } });
    const hold = (artifact?.rights as { hold?: { until?: string } | null } | undefined)?.hold;
    if (!artifact || artifact.state !== "restricted" || !artifact.restrictedAt || artifact.objectKey !== work.objectKey || artifact.sha256 !== work.sha256 || work.objectKey !== `history-artifacts/${artifact.id}/${artifact.sha256}` || (hold?.until && new Date(hold.until) > now)) return;
    await this.objects.deleteAndVerify([work.objectKey]);
    await tx.historyArtifact.update({ where: { id: artifact.id }, data: { state: "removed", removedAt: now, vin: null, vehicleIdentity: null, mileageValue: null, mileageUnit: null, mileageObservedAt: null, sourceObservations: [], provenance: null, acquiredForOrderId: null, sourceListingId: null, verifiedById: null } });
    await tx.historyArtifactCleanup.updateMany({ where: { artifactId: work.artifactId, epoch: work.epoch, completedAt: null }, data: { completedAt: now } });
   }), { timeout: 20000 });
  }
  const pending = await this.db.serviceErasureFence.findMany({ where: { cleanupCompletedAt: null }, orderBy: { erasedAt: "asc" }, take: 100 });
  for (const work of pending) {
   const complete = async (tx: Prisma.TransactionClient) => {
    if (!Array.isArray(work.objectKeys)) throw new Error("Service cleanup authority invalid");
    const keys = work.objectKeys;
    if (!keys.every((key): key is string => typeof key === "string" && key.startsWith(`service-private/${work.conversationId}/`) && !key.includes(".."))) throw new Error("Service cleanup authority invalid");
    try { await this.objects.deleteAndVerify(keys); } catch { throw new Error("Service private cleanup unavailable"); }
    const result = await tx.serviceErasureFence.updateMany({ where: { conversationId: work.conversationId, epoch: work.epoch, objectKeys: { equals: work.objectKeys as Prisma.InputJsonValue }, cleanupCompletedAt: null }, data: { cleanupCompletedAt: now } });
    cleanupsCompleted += result.count;
   };
   const cleanup = async (tx: Prisma.TransactionClient) => {
    const current = await tx.serviceErasureFence.findUnique({ where: { conversationId: work.conversationId } });
    if (!current || current.cleanupCompletedAt || current.epoch !== work.epoch || JSON.stringify(current.objectKeys) !== JSON.stringify(work.objectKeys)) return;
    await complete(tx);
   };
   await retention.run({ conversationId: work.conversationId }, now, "cleanup", cleanup, () => this.db.$transaction(tx => withExpiryPreparation(tx, { conversationId: work.conversationId }, () => cleanup(tx))));
  }
  return { supportPurged, attachmentsRetired, cleanupsCompleted };
 }
}
