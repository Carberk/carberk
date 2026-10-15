import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

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

    for (const user of expiredUsers) {
      await this.purgeUser(user, input.now);
    }

    return { purgedCount: expiredUsers.length };
  }

  private async purgeUser(
    user: { id: string; phone: string | null; email: string | null },
    now: Date,
  ): Promise<void> {
    const userId = user.id;
    // Code requests are matched by User, and by the purged phone and email
    // for a request made before sign-in, which carries no User id. A request
    // another User made to the same number (two sellers may confirm one
    // contact phone) is theirs and stays until it is 30 days old.
    const signedOutRequestsTo = [user.phone, user.email].filter(
      (value): value is string => value !== null,
    );
    const codeRequestMatches = [
      { userId },
      ...(signedOutRequestsTo.length > 0
        ? [{ userId: null, destination: { in: signedOutRequestsTo } }]
        : []),
    ];
    await this.prisma.$transaction([
      // The User row lock comes before any upload lock, the order every writer
      // of a Profile Photo uses (ADR-0088).
      this.prisma.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`,

      // Retire the Profile Photo's upload and record its storage deletion, in
      // the transaction that clears the photo below. The API's claim does the
      // same on removal; the purge runs here, so the rule is repeated. The
      // sweep deletes the bytes of fenced uploads and retries on failure; a
      // legacy upload is recorded and its bytes stay.
      this.prisma.$executeRaw`
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
      this.prisma.user.update({
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
      this.prisma.session.deleteMany({ where: { userId } }),

      // Prune TOTP enrollment (cascades to backup codes)
      this.prisma.totpEnrollment.deleteMany({ where: { userId } }),

      // Prune FCM devices
      this.prisma.fcmDevice.deleteMany({ where: { userId } }),

      // Prune notification history
      this.prisma.notificationHistory.deleteMany({ where: { userId } }),

      // Prune notification preferences
      this.prisma.notificationPreference.deleteMany({ where: { userId } }),

      // Prune saved searches
      this.prisma.savedSearch.deleteMany({ where: { userId } }),

      // Prune favorites
      this.prisma.favorite.deleteMany({ where: { userId } }),

      // Prune owned vehicles (garage)
      this.prisma.ownedVehicle.deleteMany({ where: { userId } }),

      // Prune blocked users (both directions)
      this.prisma.blockedUser.deleteMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      }),

      // Prune dealership memberships
      this.prisma.dealershipMember.deleteMany({ where: { userId } }),

      // Prune listing drafts
      this.prisma.listingDraft.deleteMany({ where: { userId, businessId: null } }),

      // Prune confirmed Listing contact phones (ADR-0081)
      this.prisma.verifiedContactPhone.deleteMany({ where: { sellerId: userId } }),

      // Prune sign-in and contact phone code requests for this User
      this.prisma.otpRequest.deleteMany({ where: { OR: codeRequestMatches } }),

      // Kept Listings stay archived; nobody can reach a purged User, so their
      // contact phone goes too
      this.prisma.listing.updateMany({ where: { sellerId: userId, businessId: null }, data: { contactPhone: null } }),
    ]);
  }
}
