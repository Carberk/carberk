import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma, PrismaService, withCampaignPreparation, withDiagnosticSourceCommand } from "@auto-tm/db";
import {
  assertLiveUserSignInMethods,
  assertSignInMethodsVerified,
  type SignInMethods,
} from "../domain/SignInMethods";
import type { GeneratedIdentity } from "../domain/GeneratedIdentity";
import type { User } from "../domain/User";
import type { UserRepository } from "../domain/ports/UserRepository";
import type { SignInMethodRepository } from "../domain/ports/SignInMethodRepository";
import {
  IDENTITY_ERROR_CODES,
  IdentityDomainError,
  SIGN_IN_CODE_CHANNELS,
  type SignInCodeChannel,
} from "../domain/types";

@Injectable()
export class PrismaUserRepository implements UserRepository, SignInMethodRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByPhone(phone: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { phone } });
    return row ? this.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? this.toDomain(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async create(signInMethods: SignInMethods, identity: GeneratedIdentity): Promise<User> {
    assertLiveUserSignInMethods(signInMethods);
    const id = randomUUID();
    const row = await this.prisma.$transaction(tx => withCampaignPreparation(tx, [{
      table: "users", key: { id }, verb: "insert", next: { id, phone: signInMethods.phone, email: signInMethods.email },
    }], () => tx.user.create({
      data: {
        id,
        phone: signInMethods.phone,
        phoneVerifiedAt: signInMethods.phoneVerifiedAt,
        email: signInMethods.email,
        emailVerifiedAt: signInMethods.emailVerifiedAt,
        nameNumber: identity.nameNumber,
        avatarIndex: identity.avatarIndex,
      },
    })));
    return this.toDomain(row);
  }

  async replaceSignInMethod(input: {
    userId: string;
    channel: SignInCodeChannel;
    destination: string;
    verifiedAt: Date;
  }): Promise<User> {
    try {
      const row = await this.prisma.$transaction(async tx => {
        const current = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
        const source = { id: current.id, phone: current.phone, phoneVerifiedAt: current.phoneVerifiedAt?.toISOString() ?? null,
          email: current.email, emailVerifiedAt: current.emailVerifiedAt?.toISOString() ?? null, role: current.role,
          suspendedAt: current.suspendedAt?.toISOString() ?? null, suspendedById: current.suspendedById,
          suspensionReason: current.suspensionReason, deletionScheduledAt: current.deletionScheduledAt?.toISOString() ?? null,
          // The retained users source contract includes the complete persisted
          // profile projection, even though this mutation changes one sign-in method.
          avatarKey: current.avatarKey, avatarUploadId: current.avatarUploadId,
          avatarUrl: current.avatarUrl, displayName: current.displayName };
        const data = input.channel === SIGN_IN_CODE_CHANNELS.PHONE
          ? { phone: input.destination, phoneVerifiedAt: input.verifiedAt }
          : { email: input.destination, emailVerifiedAt: input.verifiedAt };
        const next = input.channel === SIGN_IN_CODE_CHANNELS.PHONE
          ? { ...source, phone: input.destination, phoneVerifiedAt: input.verifiedAt.toISOString() }
          : { ...source, email: input.destination, emailVerifiedAt: input.verifiedAt.toISOString() };
        return withDiagnosticSourceCommand(tx, { operation: "sign_in_method_change",
          roots: [{ table: "users", key: { id: input.userId } }],
          rows: [{ table: "users", key: { id: input.userId }, verb: "update", expected: { source }, next }],
          actorUserId: input.userId, sessionId: null, cutoff: null, campaign: null,
        }, () => tx.user.update({ where: { id: input.userId }, data }));
      });
      return this.toDomain(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new IdentityDomainError(
          IDENTITY_ERROR_CODES.SIGN_IN_METHOD_TAKEN,
          "Sign-in Method is already held by another User",
        );
      }
      throw error;
    }
  }

  async updateDisplayName(userId: string, displayName: string): Promise<void> {
    await this.prisma.$transaction(tx => withCampaignPreparation(tx, [{
      table: "users", key: { id: userId }, verb: "update", next: { displayName },
    }], () => tx.user.update({ where: { id: userId }, data: { displayName } })));
  }

  async delete(_id: string): Promise<void> {
    // No production caller. Erasure requires the existing complete account UoW;
    // a raw DELETE must never gain a generic source-guard exemption.
    throw new Error("ACCOUNT_ERASURE_UNIT_OF_WORK_REQUIRED");
  }

  async findUsersWithExpiredDeletionGrace(now: Date): Promise<User[]> {
    const rows = await this.prisma.user.findMany({
      where: { deletionScheduledAt: { lte: now } },
    });
    return rows.map((row) => this.toDomain(row));
  }

  async purgePersonalData(_userId: string): Promise<void> {
    // Retained-User scrubbing is not interchangeable with physical account purge.
    throw new Error("ACCOUNT_ERASURE_UNIT_OF_WORK_REQUIRED");
  }

  private toDomain(
    row: Awaited<ReturnType<PrismaService["user"]["create"]>>,
  ): User {
    const signInMethods: SignInMethods = {
      phone: row.phone,
      phoneVerifiedAt: row.phoneVerifiedAt,
      email: row.email,
      emailVerifiedAt: row.emailVerifiedAt,
    };
    assertSignInMethodsVerified(signInMethods);
    return {
      id: row.id,
      ...signInMethods,
      displayName: row.displayName,
      nameNumber: row.nameNumber,
      avatarIndex: row.avatarIndex,
      avatarKey: row.avatarKey,
      avatarUrl: row.avatarUrl,
      locale: row.locale,
      role: row.role as User["role"],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletionScheduledAt: row.deletionScheduledAt ?? null,
    };
  }
}
