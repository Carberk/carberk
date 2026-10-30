import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AdminSchemas } from "@auto-tm/contracts";
import { PrismaService, type Prisma } from "@auto-tm/db";

import { withAvatarPreparation, assertAvatarReleasePreparation } from "../../../common/avatar-contact-preparation";

import { accountDeletionPendingException } from "../../identity/identity.public";
import type { ProfilePhotoLinkPort } from "../domain/ports/ProfilePhotoLinkPort";
import { UPLOAD_CLAIM_PORT, type UploadClaimPort } from "../domain/ports/UploadClaimPort";

type Tx = Prisma.TransactionClient;

interface LockedUser {
  id: string;
  avatarUploadId: string | null;
  avatarKey: string | null;
  suspendedAt: Date | null;
  deletionScheduledAt: Date | null;
}

/**
 * Writes `users.avatarUploadId` and `users.avatarKey` in the transaction that
 * finalizes or retires the upload's claim (ADR-0088). Like identity's account
 * deletion writing Listing rows, this is one context's infrastructure writing
 * another's table so both changes commit together; no other User column is
 * touched here.
 *
 * The outer ordinary preparation covers old/new uploads and adopter/cleanup
 * slots before User and claim locks. Supplied transactions reuse that union.
 */
@Injectable()
export class PrismaProfilePhotoLink implements ProfilePhotoLinkPort {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UPLOAD_CLAIM_PORT) private readonly claims: UploadClaimPort,
  ) {}

  async bind(input: { userId: string; uploadId: string; key: string; token: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => withAvatarPreparation(tx, input.userId, input, undefined, async (present) => {
      if (!present) throw new NotFoundException({ code: "USER_NOT_FOUND", message: "User not found." });
      const user = await this.lockUser(tx, input.userId);
      // The request checked these before the bytes were prepared. They are
      // checked again under the lock, because preparation takes time.
      if (!user) {
        throw new NotFoundException({ code: "USER_NOT_FOUND", message: "User not found." });
      }
      if (user.deletionScheduledAt) throw accountDeletionPendingException();
      if (user.suspendedAt) {
        throw new ForbiddenException({
          code: "FORBIDDEN",
          message: "User is suspended",
          details: { reason: AdminSchemas.AdminErrorReason.UserSuspended },
        });
      }

      const outcome = await this.claims.finalize(tx, {
        token: input.token,
        uploadIds: [input.uploadId],
        target: { type: "profile", id: input.userId },
      });
      if (outcome === "already") return;

      // The replaced photo stops being adoptable and its deletion is recorded
      // in the same commit that stops publishing its key.
      if (user.avatarUploadId && user.avatarUploadId !== input.uploadId) {
        await this.claims.retire(tx, user.avatarUploadId);
      }
      await tx.user.update({
        where: { id: input.userId },
        data: { avatarUploadId: input.uploadId, avatarKey: input.key },
      });
    }));
  }

  async unbind(userId: string, tx?: unknown): Promise<string | null> {
    const release = async (db: Tx): Promise<string | null> => {
      const user = await this.lockUser(db, userId);
      if (!user || (!user.avatarUploadId && !user.avatarKey)) return null;
      if (user.avatarUploadId) await this.claims.retire(db, user.avatarUploadId);
      await db.user.update({
        where: { id: userId },
        data: { avatarUploadId: null, avatarKey: null },
      });
      return user.avatarKey;
    };
    if (tx) {
      await assertAvatarReleasePreparation(tx as Tx, userId);
      return release(tx as Tx);
    }
    return this.prisma.$transaction(own => withAvatarPreparation(own, userId, undefined, undefined, present => present ? release(own) : Promise.resolve(null)));
  }

  private async lockUser(db: Tx, userId: string): Promise<LockedUser | undefined> {
    const [user] = await db.$queryRaw<LockedUser[]>`
      SELECT id, "avatarUploadId", "avatarKey", "suspendedAt", "deletionScheduledAt"
      FROM users WHERE id = ${userId} FOR UPDATE`;
    return user;
  }
}
