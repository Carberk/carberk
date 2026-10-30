import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, withDiagnosticSourceCommand } from "@auto-tm/db";
import type { DiagnosticSourceCommand } from "@auto-tm/db";

import { diagnosticAccountErasureWrites } from "./diagnosticAccountErasure";
import { videoAccountErasureWrites } from "./video/videoAccountErasure";
import { serviceAccountErasureWrites } from "./serviceAccountErasure";

export interface PurgeExpiredAccountsInput {
  now: Date;
}

export interface PurgeExpiredAccountsResult {
  purgedCount: number;
}

/** Sign-in code records are kept this long, then deleted (privacy policy). */
const CODE_REQUEST_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class PurgeExpiredAccounts {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(input: PurgeExpiredAccountsInput): Promise<PurgeExpiredAccountsResult> {
    const expiredUsers = await this.prisma.user.findMany({
      where: { deletionScheduledAt: { lte: input.now } },
      select: { id: true, phone: true, email: true },
    });

    // Every run first drops sign-in code records past their retention, so the
    // phone, email and IP they hold are gone after 30 days for everyone. It
    // runs before the purges so that a purge that fails cannot hold it back.
    await this.prisma.otpRequest.deleteMany({
      where: { createdAt: { lt: new Date(input.now.getTime() - CODE_REQUEST_RETENTION_MS) } },
    });

    let purgedCount = 0;
    for (const user of expiredUsers) {
      if (await this.purgeUser(user, input.now)) purgedCount += 1;
    }

    return { purgedCount };
  }

  private async purgeUser(
    selected: { id: string; phone: string | null; email: string | null },
    now: Date,
  ): Promise<boolean> {
    const userId = selected.id;
    return this.prisma.$transaction(async (tx) => {
      // Rediscover the due user and PII immediately before preparation. A stale
      // scheduler snapshot becomes a truthful no-op instead of erasing a new account.
      // Compare in SQL. to_jsonb's timestamp has no zone and JavaScript would
      // otherwise interpret an exact UTC cutoff in the worker's local timezone.
      const [fresh] = await tx.$queryRaw<{ row: Record<string, unknown> | null }[]>`SELECT public.diagnostic_source_project(
        to_jsonb(u), public.diagnostic_source_meta('users')->'fields') AS row FROM users u
        WHERE u.id = ${userId} AND u."deletionScheduledAt" <= ${now}::timestamp`;
      const row = fresh?.row;
      if (!row || row["phone"] !== selected.phone || row["email"] !== selected.email) return false;
      const source = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
      const next = { ...source, phone: null, phoneVerifiedAt: null, email: null, emailVerifiedAt: null,
        displayName: null, avatarKey: null, avatarUploadId: null, avatarUrl: null, deletionScheduledAt: null };
      const command = {
        operation: "account_purge", roots: [{ table: "users", key: { id: userId } }],
        rows: [{ table: "users", key: { id: userId }, verb: "update", expected: { source }, next }],
        actorUserId: null, sessionId: null, cutoff: now, campaign: null,
      } as DiagnosticSourceCommand;
      return withDiagnosticSourceCommand(tx, command, async (receipt) => {
        const codeRequestMatches = [
          { userId },
          ...([selected.phone, selected.email].filter((value): value is string => value !== null).length > 0
            ? [{ userId: null, destination: { in: [selected.phone, selected.email].filter((value): value is string => value !== null) } }] : []),
        ];
        const operations = [
          tx.$queryRaw`WITH prefix AS MATERIALIZED (SELECT diagnostic_dispose_ownership(${userId}::text,${now}::timestamp))
            SELECT id FROM users CROSS JOIN prefix WHERE id = ${userId} FOR UPDATE OF users`,
          ...serviceAccountErasureWrites(tx, userId, now, receipt),
          ...videoAccountErasureWrites(tx, userId, now, receipt),
          ...diagnosticAccountErasureWrites(tx, userId, now, receipt),

      // Match account scheduling's erasure policy. Restricted exports have no
      // reverse subject map, so invalidate all. Principal FKs erase its facts
      // and linked guest visits, preserving independent guest/foreign data.
      tx.measurementInvestigationExport.deleteMany(),
      tx.measurementPrincipal.deleteMany({ where: { userId } }),

      // Retire the Profile Photo's upload and record its storage deletion, in
      // the transaction that clears the photo below. The API's claim does the
      // same on removal; the purge runs here, so the rule is repeated. The
      // sweep deletes the bytes of fenced uploads and retries on failure; a
      // legacy upload is recorded and its bytes stay.
      tx.$executeRaw`
        WITH retired AS (
          UPDATE media_uploads SET "state" = 'RETIRED', "retiredAt" = ${now}::timestamp,
            "claimToken" = NULL, "claimDeadline" = NULL
          WHERE id = (SELECT "avatarUploadId" FROM users WHERE id = ${userId})
            AND "state" NOT IN ('RETIRED', 'DELETED')
          RETURNING id, "key", "objectKeys", "writeProtocol"
        )
        INSERT INTO media_upload_cleanups ("uploadId", "key", "objectKeys", "writeProtocol", "status", "nextAttemptAt")
        SELECT id, "key", "objectKeys", "writeProtocol",
          CASE WHEN "writeProtocol" = 'conditional-v1' THEN 'PENDING' ELSE 'LEGACY_PENDING' END,
          ${now}::timestamp
        FROM retired
        ON CONFLICT ("uploadId") DO NOTHING`,

      // Free both Sign-in Methods and clear profile PII (ADR-0054). The name
      // number and avatar index stay; they identify nobody (#638).
      tx.user.update({
        where: { id: userId },
        data: {
          phone: null,
          phoneVerifiedAt: null,
          email: null,
          emailVerifiedAt: null,
          displayName: null,
          avatarKey: null,
          avatarUploadId: null,
          avatarUrl: null,
          deletionScheduledAt: null,
        },
      }),

      // Prune sessions
      tx.session.deleteMany({ where: { userId } }),

      // Prune TOTP enrollment (cascades to backup codes)
      tx.totpEnrollment.deleteMany({ where: { userId } }),

      // Prune FCM devices
      tx.fcmDevice.deleteMany({ where: { userId } }),

      // Prune notification history
      tx.notificationHistory.deleteMany({ where: { userId } }),

      // Prune notification preferences
      tx.notificationPreference.deleteMany({ where: { userId } }),

      // Prune saved searches
      tx.savedSearch.deleteMany({ where: { userId } }),

      // Prune favorites
      tx.favorite.deleteMany({ where: { userId } }),

      // Prune owned vehicles (garage)
      tx.ownedVehicle.deleteMany({ where: { userId } }),

      // Prune blocked users (both directions)
      tx.blockedUser.deleteMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      }),

      // Prune dealership memberships
      tx.dealershipMember.deleteMany({ where: { userId } }),

      // Prune listing drafts
      tx.listingDraft.deleteMany({ where: { userId, businessId: null } }),

      // Prune confirmed Listing contact phones (ADR-0081)
      tx.verifiedContactPhone.deleteMany({ where: { sellerId: userId } }),

      // Prune sign-in and contact phone code requests for this User
      tx.otpRequest.deleteMany({ where: { OR: codeRequestMatches } }),

      // Kept Listings stay archived; nobody can reach a purged User, so their
      // contact phone goes too
      tx.listing.updateMany({ where: { sellerId: userId, businessId: null }, data: { contactPhone: null } }),
        ];
        for (const operation of operations) await operation;
        return true;
      });
    });
  }
}
