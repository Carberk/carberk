import { type Prisma, type PreparedDiagnosticSource } from "@auto-tm/db";

/** Runs after the account User lock, before identity completion, in the same
 * transaction. History's private linkage is removed, without importing the
 * Support 90-day schedule into provider/anonymous retained knowledge. */
export function serviceAccountErasureWrites(db: Prisma.TransactionClient, userId: string, now: Date, receipt: PreparedDiagnosticSource): Prisma.PrismaPromise<unknown>[] {
 return [
  db.$queryRaw`SELECT public.diagnostic_assert_source(${receipt.receiptId}::uuid, 'account_purge')`,
  db.$queryRaw`SELECT id FROM support_cases WHERE "customerId"=${userId} ORDER BY id FOR UPDATE`,
  db.$queryRaw`SELECT id FROM vehicle_history_requests WHERE "customerId"=${userId} ORDER BY id FOR UPDATE`,
  db.$executeRaw`
   WITH owned AS MATERIALIZED (
    SELECT c.id FROM service_conversations c
    LEFT JOIN support_cases s ON s.id = c."supportCaseId"
    LEFT JOIN vehicle_history_requests h ON h.id = c."historyRequestId"
    WHERE (s."customerId" = ${userId} OR h."customerId" = ${userId}) AND c."erasedAt" IS NULL
    ORDER BY c.id FOR UPDATE OF c
   ), fenced AS (
    UPDATE service_conversations c SET "erasedAt" = ${now}::timestamp, "lifecycleEpoch" = c."lifecycleEpoch" + 1
    FROM owned WHERE c.id = owned.id RETURNING c.id, c."lifecycleEpoch", c.purpose
   )
   INSERT INTO service_erasure_fences ("conversationId", "epoch", "objectKeys", "erasedAt")
   SELECT f.id, f."lifecycleEpoch", COALESCE(jsonb_agg(a."objectKey") FILTER (WHERE a."objectKey" IS NOT NULL), '[]'::jsonb), ${now}::timestamp
   FROM fenced f LEFT JOIN service_attachments a ON a."conversationId" = f.id
    AND NOT (COALESCE((a.rights->'hold'->>'until')::timestamptz, '-infinity'::timestamptz) > ${now}::timestamptz)
    AND NOT (f.purpose = 'history' AND a.category = 'vehicle_observation' AND a.rights->>'identifiability' = 'anonymous' AND a.rights->'schedule'->>'kind' = 'permitted_knowledge')
   GROUP BY f.id, f."lifecycleEpoch"
   ON CONFLICT ("conversationId") DO UPDATE SET "epoch" = EXCLUDED."epoch", "objectKeys" = service_erasure_fences."objectKeys" || EXCLUDED."objectKeys", "cleanupCompletedAt" = NULL`,
  db.$executeRaw`DELETE FROM service_messages WHERE "conversationId" IN (
   SELECT c.id FROM service_conversations c LEFT JOIN support_cases s ON s.id=c."supportCaseId" LEFT JOIN vehicle_history_requests h ON h.id=c."historyRequestId" WHERE s."customerId"=${userId} OR h."customerId"=${userId})`,
  db.$executeRaw`UPDATE service_attachments a SET "state"='removed', "removedAt"=${now}::timestamp, "uploaderId"=NULL
   FROM service_erasure_fences f WHERE a."conversationId"=f."conversationId" AND (a."objectKey" IS NULL OR f."objectKeys" ? a."objectKey")
   AND a."conversationId" IN (SELECT c.id FROM service_conversations c LEFT JOIN support_cases s ON s.id=c."supportCaseId" LEFT JOIN vehicle_history_requests h ON h.id=c."historyRequestId" WHERE s."customerId"=${userId} OR h."customerId"=${userId})`,
  db.$executeRaw`DELETE FROM service_push_subscriptions WHERE "sessionId" IN (SELECT id FROM sessions WHERE "userId"=${userId}) OR "conversationId" IN (SELECT c.id FROM service_conversations c LEFT JOIN support_cases s ON s.id=c."supportCaseId" LEFT JOIN vehicle_history_requests h ON h.id=c."historyRequestId" WHERE s."customerId"=${userId} OR h."customerId"=${userId})`,
  db.$executeRaw`DELETE FROM service_outbox WHERE "conversationId" IN (SELECT c.id FROM service_conversations c LEFT JOIN support_cases s ON s.id=c."supportCaseId" LEFT JOIN vehicle_history_requests h ON h.id=c."historyRequestId" WHERE s."customerId"=${userId} OR h."customerId"=${userId})`,
  db.$executeRaw`DELETE FROM service_read_states WHERE "userId"=${userId} OR "conversationId" IN (SELECT c.id FROM service_conversations c LEFT JOIN support_cases s ON s.id=c."supportCaseId" LEFT JOIN vehicle_history_requests h ON h.id=c."historyRequestId" WHERE s."customerId"=${userId} OR h."customerId"=${userId})`,
  db.$executeRaw`UPDATE service_attachments SET "uploaderId"=NULL WHERE "uploaderId"=${userId}`,
  db.$executeRaw`UPDATE service_messages SET "senderId"=NULL WHERE "senderId"=${userId}`,
  db.$executeRaw`UPDATE service_audits SET reason=NULL WHERE "resourceId" IN (SELECT id FROM support_cases WHERE "customerId"=${userId} UNION SELECT id FROM vehicle_history_requests WHERE "customerId"=${userId})`,
  db.$executeRaw`UPDATE service_audits SET "actorId"=NULL, reason=NULL WHERE "actorId"=${userId}`,
  db.$executeRaw`UPDATE support_cases SET "customerId"=NULL, "assigneeId"=NULL, "sourceListingId"=NULL WHERE "customerId"=${userId}`,
  db.$executeRaw`UPDATE history_deliveries d SET "erasedAt"=${now}::timestamp, "sharedLink"=NULL, "deliveredById"=NULL FROM history_orders o JOIN vehicle_history_requests h ON h.id=o."requestId" WHERE d."orderId"=o.id AND h."customerId"=${userId}`,
  db.$executeRaw`UPDATE history_artifacts a SET "restrictedAt"=CASE WHEN a.rights->>'identifiability'='anonymous' AND a.rights->'use' ? 'archive' AND a.rights->'use' ? 'redistribute' THEN a."restrictedAt" ELSE ${now}::timestamp END, "vehicleIdentity"=CASE WHEN a.rights->>'identifiability'='anonymous' AND a.rights->'use' ? 'archive' AND a.rights->'use' ? 'redistribute' THEN a."vehicleIdentity" ELSE NULL END,
 "mileageValue"=CASE WHEN a.rights->>'identifiability'='anonymous' AND a.rights->'use' ? 'archive' AND a.rights->'use' ? 'redistribute' THEN a."mileageValue" ELSE NULL END,
 "mileageUnit"=CASE WHEN a.rights->>'identifiability'='anonymous' AND a.rights->'use' ? 'archive' AND a.rights->'use' ? 'redistribute' THEN a."mileageUnit" ELSE NULL END,
 "mileageObservedAt"=CASE WHEN a.rights->>'identifiability'='anonymous' AND a.rights->'use' ? 'archive' AND a.rights->'use' ? 'redistribute' THEN a."mileageObservedAt" ELSE NULL END,
 "sourceObservations"=CASE WHEN a.rights->>'identifiability'='anonymous' AND a.rights->'use' ? 'archive' AND a.rights->'use' ? 'redistribute' THEN a."sourceObservations" ELSE '[]'::jsonb END,
 state=CASE WHEN a.rights->>'identifiability'='anonymous' AND a.rights->'use' ? 'archive' AND a.rights->'use' ? 'redistribute' THEN a.state ELSE 'restricted' END, "acquiredForOrderId"=NULL, "sourceListingId"=NULL, "verifiedById"=NULL, provenance=NULL FROM history_orders o JOIN vehicle_history_requests h ON h.id=o."requestId" WHERE a."acquiredForOrderId"=o.id AND h."customerId"=${userId}`,
  db.$executeRaw`UPDATE history_deliveries SET "deliveredById"=NULL WHERE "deliveredById"=${userId}`,
  db.$executeRaw`UPDATE history_artifacts SET "verifiedById"=NULL WHERE "verifiedById"=${userId}`,
  db.$executeRaw`UPDATE history_bookings b SET vin=NULL,"erasedAt"=${now}::timestamp FROM history_orders o JOIN vehicle_history_requests h ON h.id=o."requestId" WHERE b."orderId"=o.id AND h."customerId"=${userId}`,
  db.$executeRaw`UPDATE history_payments p SET claim=NULL, "attachmentId"=NULL, evidence=NULL, "confirmedById"=NULL FROM history_orders o JOIN vehicle_history_requests h ON h.id=o."requestId" WHERE p."orderId"=o.id AND h."customerId"=${userId} AND NOT (COALESCE((o.rights->'hold'->>'until')::timestamptz, '-infinity'::timestamptz) > ${now}::timestamptz)`,
  db.$executeRaw`UPDATE history_purchase_intents p SET vin=NULL, "externalReference"=NULL, "createdById"=NULL FROM history_orders o JOIN vehicle_history_requests h ON h.id=o."requestId" WHERE p."orderId"=o.id AND h."customerId"=${userId}`,
  db.$executeRaw`UPDATE history_refunds r SET reason='[erased]', "approvedById"=NULL, "executedById"=NULL, "executionReference"=CASE WHEN r.state='executed' THEN '[erased]' ELSE NULL END FROM history_orders o JOIN vehicle_history_requests h ON h.id=o."requestId" WHERE r."orderId"=o.id AND h."customerId"=${userId} AND NOT (COALESCE((o.rights->'hold'->>'until')::timestamptz, '-infinity'::timestamptz) > ${now}::timestamptz)`,
  db.$executeRaw`UPDATE history_orders o SET "erasedAt"=${now}::timestamp, rights=jsonb_build_object('category','payment_evidence','schedule',o.rights->'schedule','hold',o.rights->'hold') FROM vehicle_history_requests h WHERE o."requestId"=h.id AND h."customerId"=${userId}`,
  db.$executeRaw`UPDATE history_payments SET "confirmedById"=NULL WHERE "confirmedById"=${userId}`,
  db.$executeRaw`UPDATE history_purchase_intents SET "createdById"=NULL WHERE "createdById"=${userId}`,
  db.$executeRaw`UPDATE history_refunds SET "approvedById"=CASE WHEN "approvedById"=${userId} THEN NULL ELSE "approvedById" END, "executedById"=CASE WHEN "executedById"=${userId} THEN NULL ELSE "executedById" END WHERE "approvedById"=${userId} OR "executedById"=${userId}`,
  db.$executeRaw`UPDATE history_quotes SET "offeredById"=NULL WHERE "offeredById"=${userId}`,
  db.$executeRaw`UPDATE vehicle_history_requests SET "customerId"=NULL, "assigneeId"=NULL, "sourceListingId"=NULL, "proposedVin"=NULL WHERE "customerId"=${userId}`,
  db.$executeRaw`UPDATE history_quotes q SET vin=NULL, "preflightEvidence"=NULL, "offeredById"=NULL, "erasedAt"=${now}::timestamp FROM vehicle_history_requests h JOIN service_conversations c ON c."historyRequestId"=h.id WHERE q."requestId"=h.id AND h."customerId" IS NULL AND c."erasedAt" IS NOT NULL AND q."erasedAt" IS NULL`,
 ];
}
