import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import type { CleanupWork, RetiredUploadLedger } from "./retiredUploadCleanup";

/** The first retry waits this long; each further failure doubles it, up to the cap. */
const BACKOFF_BASE_SECONDS = 60;
const BACKOFF_CAP_SECONDS = 6 * 60 * 60;

/**
 * Cleanup state in Postgres (ADR-0088). Work lives in `media_upload_cleanups`,
 * which has no foreign key, so it outlives the upload record and its User.
 * Only `PENDING` work is ever taken; `LEGACY_PENDING` stays untouched.
 */
@Injectable()
export class PrismaRetiredUploadLedger implements RetiredUploadLedger {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async retireExpiredPreparations(now: Date, limit: number): Promise<number> {
    // One statement: the preparation is retired and its work recorded together.
    // The row lock is the same one an API finalization takes, so a preparation
    // is either adopted first and skipped here, or retired here and refused there.
    // The work is due from the missed deadline.
    return this.prisma.$executeRaw`
      WITH expired AS (
        UPDATE media_uploads SET "state" = 'RETIRED', "retiredAt" = ${now},
          "claimToken" = NULL, "claimDeadline" = NULL
        FROM (
          SELECT id, "claimDeadline" AS deadline FROM media_uploads
          WHERE "state" = 'PREPARING' AND "claimDeadline" < ${now}
          ORDER BY "claimDeadline" LIMIT ${limit}::int FOR UPDATE SKIP LOCKED
        ) AS stranded
        WHERE media_uploads.id = stranded.id
        RETURNING media_uploads.id, media_uploads."key", media_uploads."objectKeys",
          media_uploads."writeProtocol", stranded.deadline
      )
      INSERT INTO media_upload_cleanups ("uploadId", "key", "objectKeys", "writeProtocol", "status", "nextAttemptAt")
      SELECT id, "key", "objectKeys", "writeProtocol",
        CASE WHEN "writeProtocol" = 'conditional-v1' THEN 'PENDING' ELSE 'LEGACY_PENDING' END, deadline
      FROM expired
      ON CONFLICT ("uploadId") DO NOTHING`;
  }

  async lease(now: Date, limit: number): Promise<CleanupWork[]> {
    // Taking work and scheduling its next attempt are one statement, so the
    // backoff is saved before any deletion starts. SKIP LOCKED keeps two
    // overlapping sweeps from taking the same work.
    return this.prisma.$queryRaw<CleanupWork[]>`
      UPDATE media_upload_cleanups AS work
      SET "attempts" = work."attempts" + 1,
        "nextAttemptAt" = ${now}::timestamp + LEAST(
          ${BACKOFF_BASE_SECONDS}::float8 * power(2::float8, LEAST(work."attempts", 30)),
          ${BACKOFF_CAP_SECONDS}::float8) * interval '1 second'
      FROM (
        SELECT "uploadId" FROM media_upload_cleanups
        WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${now}
        ORDER BY "nextAttemptAt", "uploadId" LIMIT ${limit}::int FOR UPDATE SKIP LOCKED
      ) AS due
      WHERE work."uploadId" = due."uploadId"
      RETURNING work."uploadId", work."key", work."objectKeys", work."writeProtocol", work."attempts"`;
  }

  async blockingReference(work: CleanupWork, directory: string): Promise<string | null> {
    // New references are written only through the claim, which refuses a
    // retired upload, so none can appear after this read. Rows from before the
    // claim, with no upload link, are found by their key.
    const [found] = await this.prisma.$queryRaw<{ live: bigint; listing: bigint; profile: bigint }[]>`
      SELECT
        (SELECT count(*) FROM media_uploads WHERE id = ${work.uploadId} AND "state" <> 'RETIRED') AS live,
        (SELECT count(*) FROM listing_media WHERE "uploadId" = ${work.uploadId}
          OR starts_with("key", ${directory}) OR starts_with("posterKey", ${directory})) AS listing,
        (SELECT count(*) FROM users WHERE "avatarUploadId" = ${work.uploadId}
          OR starts_with("avatarKey", ${directory})) AS profile`;
    if (Number(found?.live ?? 0) > 0) return "Live claim: the upload is not retired";
    if (Number(found?.listing ?? 0) > 0) return "Live reference: Listing media still uses this directory";
    if (Number(found?.profile ?? 0) > 0) return "Live reference: a Profile Photo still uses this directory";
    return null;
  }

  async complete(uploadId: string, now: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.mediaUploadCleanup.update({
        where: { uploadId },
        data: { status: "DONE", completedAt: now, lastError: null },
      }),
      this.prisma.mediaUpload.updateMany({
        where: { id: uploadId, state: "RETIRED" },
        data: { state: "DELETED" },
      }),
    ]);
  }

  async recordFailure(uploadId: string, reason: string): Promise<void> {
    await this.prisma.mediaUploadCleanup.update({ where: { uploadId }, data: { lastError: reason } });
  }
}
