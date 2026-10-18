import type { Prisma, PrismaService } from "@auto-tm/db";

/** After the User lock, retain exact cleanup before personal targets disappear.
 * Business stock belongs to the business and survives its creator's purge. */
export function videoAccountErasureWrites(db: PrismaService, userId: string, now: Date): Prisma.PrismaPromise<unknown>[] {
 return [
  db.$queryRaw`SELECT id FROM listings WHERE "sellerId"=${userId} AND "businessId" IS NULL ORDER BY id FOR UPDATE`,
  db.$queryRaw`SELECT id FROM listing_drafts WHERE "userId"=${userId} AND "businessId" IS NULL ORDER BY id FOR UPDATE`,
  db.$queryRaw`SELECT id FROM media_uploads WHERE "userId"=${userId} AND "businessId" IS NULL AND "writeProtocol"='video-v1' ORDER BY id FOR UPDATE`,
  db.$queryRaw`SELECT s.id FROM video_upload_sessions s JOIN media_uploads u ON u.id=s."uploadId" WHERE u."userId"=${userId} AND u."businessId" IS NULL AND u."writeProtocol"='video-v1' ORDER BY s.id FOR UPDATE OF s`,
  db.$queryRaw`SELECT g.id FROM video_generations g JOIN media_uploads u ON u.id=g."uploadId" WHERE u."userId"=${userId} AND u."businessId" IS NULL AND u."writeProtocol"='video-v1' ORDER BY g.id FOR UPDATE OF g`,
  db.$queryRaw`SELECT w."generationId" FROM video_process_work w JOIN media_uploads u ON u.id=w."uploadId" WHERE u."userId"=${userId} AND u."businessId" IS NULL AND u."writeProtocol"='video-v1' ORDER BY w."generationId" FOR UPDATE OF w`,
  db.$executeRaw`
   INSERT INTO video_cleanup_work (id,"uploadId","sessionId","generationId","writeProtocol","sourceKey","storageUploadId","objectKeys",state,"nextAttemptAt","createdAt","updatedAt")
   SELECT 'session:' || s.id,u.id,s.id,g.id,'video-v1',s."sourceKey",s."storageUploadId",
    ARRAY(SELECT DISTINCT key FROM (
     SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(g.manifest->'assets')='array' THEN g.manifest->'assets' ELSE '[]'::jsonb END)->>'key' AS key
     UNION SELECT unnest(COALESCE(c."objectKeys",ARRAY[]::text[]))
    ) inventory WHERE key IS NOT NULL),
    'PENDING',GREATEST(${now}::timestamp + interval '15 minutes',COALESCE(w."leaseExpiresAt",${now}::timestamp)) + interval '2 minutes',${now}::timestamp,${now}::timestamp
   FROM media_uploads u JOIN video_upload_sessions s ON s."uploadId"=u.id JOIN video_generations g ON g.id=s.id AND g."uploadId"=u.id
   LEFT JOIN video_process_work w ON w."generationId"=g.id LEFT JOIN video_cleanup_work c ON c.id='session:' || s.id
   WHERE u."userId"=${userId} AND u."businessId" IS NULL AND u."writeProtocol"='video-v1' AND u.kind='video' AND u.state NOT IN ('RETIRED','DELETED') AND s."protocolVersion"=1
    AND s."sourceKey"='video/v1/' || u.id || '/' || s.id || '/source.mp4' AND u.key=s."sourceKey"
   ON CONFLICT (id) DO UPDATE SET state='PENDING',"objectKeys"=EXCLUDED."objectKeys","nextAttemptAt"=EXCLUDED."nextAttemptAt","completedAt"=NULL,"leaseToken"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=EXCLUDED."updatedAt"`,
  // A malformed V1 record cannot let account purge erase its last cleanup
  // evidence. Abort the enclosing transaction instead of dropping inventory.
  db.$queryRaw`SELECT 1 / CASE WHEN COUNT(*) > 0 THEN 0 ELSE 1 END AS valid
   FROM media_uploads u LEFT JOIN video_upload_sessions s ON s."uploadId"=u.id
   LEFT JOIN video_generations g ON g.id=s.id LEFT JOIN video_cleanup_work c ON c.id='session:' || s.id
   WHERE u."userId"=${userId} AND u."businessId" IS NULL AND u."writeProtocol"='video-v1' AND u.state NOT IN ('RETIRED','DELETED')
    AND (c.id IS NULL OR c."uploadId" IS DISTINCT FROM u.id OR c."sessionId" IS DISTINCT FROM s.id OR c."generationId" IS DISTINCT FROM g.id OR c."sourceKey" IS DISTINCT FROM u.key OR c."writeProtocol" IS DISTINCT FROM 'video-v1' OR s."protocolVersion" IS DISTINCT FROM 1 OR s."sourceKey" IS DISTINCT FROM 'video/v1/' || u.id || '/' || s.id || '/source.mp4' OR cardinality(c."objectKeys")>1024
     OR (g.manifest IS NOT NULL AND (jsonb_typeof(g.manifest->'assets') IS DISTINCT FROM 'array' OR jsonb_array_length(CASE WHEN jsonb_typeof(g.manifest->'assets')='array' THEN g.manifest->'assets' ELSE '[]'::jsonb END)>1024))
     OR EXISTS(SELECT 1 FROM unnest(c."objectKeys") object_key WHERE object_key IS NULL OR object_key NOT LIKE 'video/v1/' || u.id || '/' || g.id || '/%' OR substring(object_key FROM length('video/v1/' || u.id || '/' || g.id || '/')+1) !~ '^(master\\.m3u8|poster\\.jpg|(240|360|720)/(index\\.m3u8|seg-[0-9]+\\.ts))$'))`,
  db.$executeRaw`UPDATE listings SET "activeVideoGenerationId"=NULL,"pendingVideoGenerationId"=NULL,"activeVideoRevision"="activeVideoRevision"+1 WHERE "sellerId"=${userId} AND "businessId" IS NULL AND ("activeVideoGenerationId" IS NOT NULL OR "pendingVideoGenerationId" IS NOT NULL)`,
  db.$executeRaw`UPDATE video_grants v SET "revokedAt"=${now}::timestamp WHERE v."revokedAt" IS NULL AND (v."ownerUserId"=${userId} OR v."generationId" IN (SELECT g.id FROM video_generations g JOIN media_uploads u ON u.id=g."uploadId" WHERE u."userId"=${userId} AND u."businessId" IS NULL AND u."writeProtocol"='video-v1'))`,
  db.$executeRaw`UPDATE video_process_work w SET state='CANCELLED',"lastError"='VIDEO_ACCOUNT_PURGED',"updatedAt"=${now}::timestamp WHERE w."uploadId" IN (SELECT id FROM media_uploads WHERE "userId"=${userId} AND "businessId" IS NULL AND "writeProtocol"='video-v1') AND w.state IN ('PENDING','PROCESSING')`,
  db.$executeRaw`UPDATE video_generations g SET state='RETIRED',"retiredAt"=${now}::timestamp WHERE g."uploadId" IN (SELECT id FROM media_uploads WHERE "userId"=${userId} AND "businessId" IS NULL AND "writeProtocol"='video-v1') AND g.state<>'RETIRED'`,
  db.$executeRaw`UPDATE video_upload_sessions s SET state='CLEANUP_PENDING',"cancelledAt"=${now}::timestamp,"updatedAt"=${now}::timestamp WHERE s."uploadId" IN (SELECT id FROM media_uploads WHERE "userId"=${userId} AND "businessId" IS NULL AND "writeProtocol"='video-v1') AND s.state NOT IN ('CLEANUP_PENDING','DELETED')`,
  db.$executeRaw`UPDATE media_uploads SET state='RETIRED',"retiredAt"=${now}::timestamp,"claimToken"=NULL,"claimDeadline"=NULL WHERE "userId"=${userId} AND "businessId" IS NULL AND "writeProtocol"='video-v1' AND state NOT IN ('RETIRED','DELETED')`,
 ];
}
