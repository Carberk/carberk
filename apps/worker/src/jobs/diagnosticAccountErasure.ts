import type { Prisma, PrismaService } from "@auto-tm/db";

/** Runs after the User lock in the account purge transaction. Report writes
 * must precede intake erasure: their identity trigger requires a live order.
 * Historical snapshots stay immutable; current access and exact private object
 * intents are fenced without imposing a new retention timer on observations. */
export function diagnosticAccountErasureWrites(db: PrismaService, userId: string, now: Date): Prisma.PrismaPromise<unknown>[] {
 return [
  db.$queryRaw`SELECT o.id FROM inspection_orders o WHERE o."erasedAt" IS NULL AND
   (o."commissionerId"=${userId} OR EXISTS (SELECT 1 FROM diagnostic_reports r WHERE r."orderId"=o.id AND
    (r.state->>'authorId'=${userId} OR r.state->>'reviewerId'=${userId}))) ORDER BY o.id FOR UPDATE OF o`,
  db.$queryRaw`SELECT r.id FROM diagnostic_reports r JOIN inspection_orders o ON o.id=r."orderId"
   WHERE o."erasedAt" IS NULL AND (o."commissionerId"=${userId} OR r.state->>'authorId'=${userId} OR r.state->>'reviewerId'=${userId})
   ORDER BY r.id FOR UPDATE OF r`,
  db.$executeRaw`UPDATE diagnostic_reports r SET "erasedAt"=COALESCE(r."erasedAt",${now}::timestamp), version=r.version+1, "updatedAt"=${now}::timestamp,
   "withdrawalReason"=CASE WHEN r.status='withdrawn' THEN '[erased]' ELSE NULL END,
   state=r.state || jsonb_build_object('authorId',NULL,'reviewerId',NULL,'returnReason',NULL,'correctionReason',NULL,
    'withdrawalReason',CASE WHEN r.status='withdrawn' THEN '[erased]' ELSE NULL END)
   FROM inspection_orders o WHERE o.id=r."orderId" AND o."commissionerId"=${userId} AND o."erasedAt" IS NULL`,
  // Keep write/generation leases. A writer already doing network I/O must finish
  // within its bounded lease before cleanup can delete and verify its exact key.
  db.$executeRaw`UPDATE diagnostic_pdf_artifacts a SET state='cleanup_pending', epoch=gen_random_uuid()::text,
   "cleanupRequestedAt"=COALESCE(a."cleanupRequestedAt",${now}::timestamp), "cleanupCompletedAt"=NULL
   FROM diagnostic_reports r JOIN inspection_orders o ON o.id=r."orderId"
   WHERE a."reportId"=r.id AND o."commissionerId"=${userId} AND o."erasedAt" IS NULL`,
  db.$executeRaw`UPDATE diagnostic_evidence e SET state='cleanup_pending', epoch=gen_random_uuid()::text, "createdById"=NULL,
   "cleanupRequestedAt"=COALESCE(e."cleanupRequestedAt",${now}::timestamp), "cleanupCompletedAt"=NULL
   FROM diagnostic_reports r JOIN inspection_orders o ON o.id=r."orderId"
   WHERE e."reportId"=r.id AND o."commissionerId"=${userId} AND o."erasedAt" IS NULL`,
  // Staff deletion removes current attribution and authority without erasing
  // another commissioner's report or rewriting its protected release snapshot.
  db.$executeRaw`UPDATE diagnostic_reports r SET state=r.state || jsonb_build_object(
   'authorId',CASE WHEN r.state->>'authorId'=${userId} THEN NULL ELSE r.state->>'authorId' END,
   'reviewerId',CASE WHEN r.state->>'reviewerId'=${userId} THEN NULL ELSE r.state->>'reviewerId' END),
   version=r.version+1, "updatedAt"=${now}::timestamp
   FROM inspection_orders o WHERE o.id=r."orderId" AND o."erasedAt" IS NULL
   AND (r.state->>'authorId'=${userId} OR r.state->>'reviewerId'=${userId})`,
  db.$executeRaw`UPDATE diagnostic_evidence SET "createdById"=NULL WHERE "createdById"=${userId}`,
  db.$executeRaw`UPDATE diagnostic_template_versions SET "publishedById"=NULL WHERE "publishedById"=${userId}`,
  db.$executeRaw`UPDATE diagnostic_audits SET "actorId"=NULL, details=details-'reason' WHERE "actorId"=${userId}`,
  db.$executeRaw`UPDATE diagnostic_audits SET details=details-'reason' WHERE "orderId" IN
   (SELECT id FROM inspection_orders WHERE "commissionerId"=${userId})`,
  db.$executeRaw`DELETE FROM diagnostic_order_assignments WHERE "userId"=${userId} OR "orderId" IN
   (SELECT id FROM inspection_orders WHERE "commissionerId"=${userId})`,
  db.$executeRaw`DELETE FROM diagnostic_center_assignments WHERE "userId"=${userId}`,
  // Last: clearing intake first would make the report trigger reject fencing.
  db.$executeRaw`UPDATE inspection_orders SET "commissionerId"=NULL, "physicalAuthorization"=NULL,
   "publicationAuthorization"=NULL, "observedVehicle"=NULL, "listingId"=NULL, "listingIdentityDigest"=NULL,
   "associationValidatedAt"=NULL, "erasedAt"=COALESCE("erasedAt",${now}::timestamp), epoch=gen_random_uuid()::text,
   version=version+1, "updatedAt"=${now}::timestamp WHERE "commissionerId"=${userId}`,
 ];
}
