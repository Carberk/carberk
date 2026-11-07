import type { Prisma } from "../generated/prisma/client/client";

/** Caller holds the slot lock. Retirement and deletion work commit together. */
export async function retireVideoGenerations(
  tx: Prisma.TransactionClient, slotId: string, generationIds: string[], now: Date,
): Promise<void> {
  for (const id of generationIds) {
    const generation = await tx.videoGeneration.update({ where: { id }, data: { status: "Retired", nextRetryAt: null }, include: { source: true } });
    const source = generation.source;
    await tx.videoSource.updateMany({ where: { id: source.id, state: { in: ["OPEN", "COMPLETING", "COMPLETED"] } }, data: { state: "CANCELLED" } });
    const work = { objectKey: source.objectKey, multipartUploadId: source.multipartUploadId, objectPrefix: source.objectKey.replace(/\/source\.mp4$/, "/"), bucket: source.bucket, sizeBytes: source.sizeBytes, completionPending: source.state === "COMPLETING", status: "PENDING", nextAttemptAt: now, completedAt: null };
    await tx.videoUploadCleanup.upsert({ where: { sourceId: source.id }, create: { sourceId: source.id, ...work }, update: work });
  }
  await tx.listingVideo.updateMany({ where: { id: slotId, activeGenerationId: { in: generationIds } }, data: { activeGenerationId: null } });
  await tx.listingVideo.updateMany({ where: { id: slotId, pendingGenerationId: { in: generationIds } }, data: { pendingGenerationId: null } });
}

/** Parent row is locked before this call, preventing a concurrent new slot. */
export async function retireTargetVideos(tx: Prisma.TransactionClient, target: { listingId?: string; draftId?: string; ownerId?: string }, now: Date): Promise<void> {
  const slots = await tx.listingVideo.findMany({ where: target, orderBy: { id: "asc" } });
  for (const slot of slots) {
    await tx.$queryRaw`SELECT id FROM listing_videos WHERE id = ${slot.id} FOR UPDATE`;
    const generations = await tx.videoGeneration.findMany({ where: { listingVideoId: slot.id, status: { not: "Retired" } } });
    await retireVideoGenerations(tx, slot.id, generations.map((generation) => generation.id), now);
  }
}

