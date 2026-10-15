import type { Prisma, PrismaService } from "@auto-tm/db";

/** Runs after the account User lock, before identity completion, in the same
 * transaction. History's private linkage is removed, without importing the
 * Support 90-day schedule into provider/anonymous retained knowledge. */
export function serviceAccountErasureWrites(db: PrismaService, userId: string, now: Date): Prisma.PrismaPromise<unknown>[] {
 return [
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
  db.$executeRaw`DELETE FROM service_outbox WHERE "conversationId" IN (SELECT c.id FROM service_conversations c LEFT JOIN support_cases s ON s.id=c."supportCaseId" LEFT JOIN vehicle_history_requests h ON h.id=c."historyRequestId" WHERE s."customerId"=${userId} OR h."customerId"=${userId})`,
  db.$executeRaw`DELETE FROM service_read_states WHERE "userId"=${userId} OR "conversationId" IN (SELECT c.id FROM service_conversations c LEFT JOIN support_cases s ON s.id=c."supportCaseId" LEFT JOIN vehicle_history_requests h ON h.id=c."historyRequestId" WHERE s."customerId"=${userId} OR h."customerId"=${userId})`,
  db.$executeRaw`UPDATE service_attachments SET "uploaderId"=NULL WHERE "uploaderId"=${userId}`,
  db.$executeRaw`UPDATE service_messages SET "senderId"=NULL WHERE "senderId"=${userId}`,
  db.$executeRaw`UPDATE service_audits SET "actorId"=NULL WHERE "actorId"=${userId}`,
  db.$executeRaw`UPDATE support_cases SET "customerId"=NULL, "assigneeId"=NULL, "sourceListingId"=NULL WHERE "customerId"=${userId}`,
  db.$executeRaw`UPDATE vehicle_history_requests SET "customerId"=NULL, "assigneeId"=NULL, "sourceListingId"=NULL, "proposedVin"=NULL WHERE "customerId"=${userId}`,
 ];
}
