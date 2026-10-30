import { Prisma, type PreparedDiagnosticSource } from "@auto-tm/db";

/** Runs after the User lock in the account purge transaction. Report writes
 * must precede intake erasure: their identity trigger requires a live order.
 * Historical snapshots stay immutable; current access and exact private object
 * intents are fenced without imposing a new retention timer on observations. */
export function diagnosticAccountErasureWrites(db: Prisma.TransactionClient, userId: string, now: Date, receipt: PreparedDiagnosticSource): Prisma.PrismaPromise<unknown>[] {
 // The User lock serializes public first consumption involving this commissioner.
 // Predecessor/order bindings are immutable. Discover the entire direct-reader
 // union before taking any order/report lock; never add B locks after locking A.
 // B corrections reference B, not A, and carry no A report pointer in their own
 // snapshot. Their order is included so concurrent authoring remains ordered.
 const affected = Prisma.sql`o."erasedAt" IS NULL AND
   (o."commissionerId"=${userId} OR EXISTS (SELECT 1 FROM diagnostic_reports r WHERE r."orderId"=o.id AND
    (r.state->>'authorId'=${userId} OR r.state->>'reviewerId'=${userId})) OR EXISTS (
    SELECT 1 FROM diagnostic_reports b JOIN diagnostic_reports a ON a.id=b."predecessorId"
    JOIN inspection_orders ao ON ao.id=a."orderId"
    WHERE b."orderId"=o.id AND ao."commissionerId"=${userId} AND ao."erasedAt" IS NULL))`;
 return [
  db.$queryRaw`SELECT public.diagnostic_assert_source(${receipt.receiptId}::uuid, 'account_purge')::text`,
  // These personal Listings are updated later by account purge. Take their locks
  // before orders, as publisher writers do. No surviving B Listing is mutated.
  db.$queryRaw`SELECT id FROM listings WHERE "sellerId"=${userId} AND "businessId" IS NULL ORDER BY id FOR UPDATE`,
  db.$queryRaw`WITH locked AS MATERIALIZED (
   SELECT o.id FROM inspection_orders o WHERE ${affected} ORDER BY o.id FOR UPDATE OF o
  ) SELECT set_config('carberk.diagnostic_erasure_orders', COALESCE(jsonb_agg(id ORDER BY id),'[]'::jsonb)::text, true) FROM locked`,
  // Private first consumption can finish while purge waits for A's order lock.
  // A new edge must roll back this purge, never extend its lock set behind A.
  // This transaction-local list is only a lock receipt, not data authority.
  db.$queryRaw`SELECT (CASE WHEN COALESCE((SELECT jsonb_agg(o.id ORDER BY o.id)
   FROM inspection_orders o WHERE ${affected}),'[]'::jsonb) =
   current_setting('carberk.diagnostic_erasure_orders')::jsonb THEN '1' ELSE 'diagnostic_erasure_lock_set_changed' END)::integer AS stable`,
  // Re-evaluate the immutable binding predicate after the full sorted order set
  // is locked, then lock every report in that set before any erasure write.
  db.$queryRaw`SELECT r.id FROM diagnostic_reports r JOIN inspection_orders o ON o.id=r."orderId"
   WHERE ${affected} ORDER BY r.id FOR UPDATE OF r`,
  db.$executeRaw`UPDATE diagnostic_reports r SET "erasedAt"=COALESCE(r."erasedAt",${now}::timestamp), version=r.version+1, "updatedAt"=${now}::timestamp,
   "identityRecordId"=NULL, "identityRecordHash"=NULL, "identityEvidenceId"=NULL, "identityEvidenceHash"=NULL,
   "withdrawalReason"=CASE WHEN r.status='withdrawn' THEN '[erased]' ELSE NULL END,
   state=r.state || jsonb_build_object('authorId',NULL,'reviewerId',NULL,'returnReason',NULL,'correctionReason',NULL,
    'withdrawalReason',CASE WHEN r.status='withdrawn' THEN '[erased]' ELSE NULL END)
   FROM inspection_orders o WHERE o.id=r."orderId" AND o."commissionerId"=${userId} AND o."erasedAt" IS NULL`,
  // Unconsumed private proofs have no independent hold or anonymous-hash exception.
  // Remove the complete restricted record and both-visit linkage before intake erasure.
  db.$executeRaw`DELETE FROM diagnostic_continuity_proofs p WHERE p."issuerId"=${userId} OR p."linkingTechnicianId"=${userId}
   OR EXISTS (SELECT 1 FROM inspection_orders o WHERE o."commissionerId"=${userId}
    AND (o.id=p."predecessorOrderId" OR o.id=p."candidateOrderId"))`,
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
  // Structured identity evidence and its classified provenance: fence the private
  // objects for exact cleanup after write leases settle, then clear restricted
  // content, hashes and personal linkage in place before intake erasure.
  db.$executeRaw`UPDATE diagnostic_identity_provenance p SET state='cleanup_pending', epoch=gen_random_uuid()::text, rights=NULL, "createdById"=NULL,
   "cleanupRequestedAt"=COALESCE(p."cleanupRequestedAt",${now}::timestamp), "cleanupCompletedAt"=NULL, "erasedAt"=COALESCE(p."erasedAt",${now}::timestamp)
   FROM inspection_orders o WHERE o.id=p."orderId" AND o."commissionerId"=${userId} AND o."erasedAt" IS NULL`,
  db.$executeRaw`UPDATE diagnostic_identity_evidence e SET "observationHash"=NULL, identifiers=NULL, provenance=NULL, rights=NULL, explanation=NULL,
   "recordHash"=NULL, "recordedById"=NULL, "erasedAt"=COALESCE(e."erasedAt",${now}::timestamp)
   FROM inspection_orders o WHERE o.id=e."orderId" AND o."commissionerId"=${userId} AND o."erasedAt" IS NULL`,
  // Staff deletion detaches attribution only; another commissioner's material stays retained.
  db.$executeRaw`UPDATE diagnostic_identity_evidence SET "recordedById"=NULL WHERE "recordedById"=${userId}`,
  db.$executeRaw`UPDATE diagnostic_identity_provenance SET "createdById"=NULL WHERE "createdById"=${userId}`,
  // Identity records are append-only: erasure clears restricted content and
  // recorder linkage in place, before the order itself is erased below.
  db.$executeRaw`UPDATE diagnostic_identity_records SET observation=NULL, "observationHash"=NULL, "recordedById"=NULL,
   "erasedAt"=COALESCE("erasedAt",${now}::timestamp) WHERE "orderId" IN
   (SELECT id FROM inspection_orders WHERE "commissionerId"=${userId} AND "erasedAt" IS NULL)`,
  db.$executeRaw`UPDATE diagnostic_identity_records SET "recordedById"=NULL WHERE "recordedById"=${userId}`,
  // Last: clearing intake first would make the report trigger reject fencing.
  db.$executeRaw`UPDATE inspection_orders SET "commissionerId"=NULL, "physicalAuthorization"=NULL,
   "publicationAuthorization"=NULL, "observedVehicle"=NULL, "listingId"=NULL, "listingIdentityDigest"=NULL,
   "associationValidatedAt"=NULL, "erasedAt"=COALESCE("erasedAt",${now}::timestamp), epoch=gen_random_uuid()::text,
   "identityEvidenceGeneration"="identityEvidenceGeneration"+1,
   version=version+1, "updatedAt"=${now}::timestamp WHERE "commissionerId"=${userId}`,
 ];
}
