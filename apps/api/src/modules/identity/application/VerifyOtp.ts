import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Enums } from "@auto-tm/contracts";
import type { User } from "../domain/User";
import { UserSuspendedError } from "../domain/UserSuspendedError";
import { findReviewerAccount, matchesReviewerCredential } from "../domain/ReviewerSignIn";
import { SIGN_IN_CODE_CHANNELS, type SignInCodeChannel } from "../domain/types";
import { signInCodeDestination } from "../domain/SignInCodeDestination";
import type { OtpRequestRepository } from "../domain/ports/OtpRequestRepository";
import type { UserRepository } from "../domain/ports/UserRepository";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import type { RefreshTokenHasherPort } from "../domain/ports/RefreshTokenHasherPort";
import type { ClockPort } from "../domain/ports/ClockPort";
import type { ConstantTimeComparatorPort } from "../domain/ports/ConstantTimeComparatorPort";
import { CONSTANT_TIME_COMPARATOR_PORT } from "../domain/ports/ConstantTimeComparatorPort";
import type { ReviewerOtpBypassConfig } from "../domain/ports/ReviewerOtpBypassConfig";
import { REVIEWER_OTP_BYPASS_CONFIG } from "../domain/ports/ReviewerOtpBypassConfig";
import type { RandomSourcePort } from "../domain/ports/RandomSourcePort";
import { RANDOM_SOURCE_PORT } from "../domain/ports/RandomSourcePort";
import { drawGeneratedIdentity } from "../domain/GeneratedIdentity";
import { PrismaOtpRequestRepository } from "../infrastructure/PrismaOtpRequestRepository";
import { PrismaUserRepository } from "../infrastructure/PrismaUserRepository";
import { PrismaSessionRepository } from "../infrastructure/PrismaSessionRepository";
import { RefreshTokenDigestAdapter } from "../infrastructure/RefreshTokenDigestAdapter";
import { SystemClockAdapter } from "../infrastructure/SystemClockAdapter";
import type { IdentityCheckPort } from "../domain/ports/IdentityCheckPort";
import { IDENTITY_TOKENS } from "../identity.tokens";
import { VerifySignInCode } from "./VerifySignInCode";
import { RESERVED_PHONE_ATTEMPT_LEDGER, type ReservedPhoneAttemptLedger } from "../domain/ports/ReservedPhoneAttemptLedger";

const MAX_SESSIONS = 10;
const REFRESH_TTL_DAYS = 30;

export type VerifyOtpInput = ({ phone: string } | { email: string }) & {
  code: string;
  deviceLabel?: string;
  userAgent?: string;
};

export interface VerifyOtpResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    phone: string | null;
    email: string | null;
    displayName: string | null;
    role: string;
    deletionScheduledAt: string | null;
  };
}

@Injectable()
export class VerifyOtp {
  constructor(
    @Inject(PrismaOtpRequestRepository)
    private readonly otpRequestRepo: OtpRequestRepository,
    @Inject(PrismaUserRepository)
    private readonly userRepo: UserRepository,
    @Inject(PrismaSessionRepository)
    private readonly sessionRepo: SessionRepository,
    @Inject(RefreshTokenDigestAdapter)
    private readonly hasher: RefreshTokenHasherPort,
    @Inject(SystemClockAdapter)
    private readonly clock: ClockPort,
    @Inject(JwtService)
    private readonly jwtService: JwtService,
    @Inject("EventBus")
    private readonly eventBus: { emit: (event: string, payload: unknown) => void },
    @Inject(REVIEWER_OTP_BYPASS_CONFIG)
    private readonly reviewerBypassConfig: ReviewerOtpBypassConfig,
    @Inject(CONSTANT_TIME_COMPARATOR_PORT)
    private readonly constantTimeComparator: ConstantTimeComparatorPort,
    @Inject(VerifySignInCode)
    private readonly verifySignInCode: VerifySignInCode,
    @Inject(RANDOM_SOURCE_PORT)
    private readonly random: RandomSourcePort,
    @Inject(IDENTITY_TOKENS.IdentityCheckPort)
    private readonly identityCheck: IdentityCheckPort,
    @Inject(RESERVED_PHONE_ATTEMPT_LEDGER)
    private readonly reservedPhoneAttempts: ReservedPhoneAttemptLedger,
  ) {}

  async execute(input: VerifyOtpInput): Promise<VerifyOtpResult> {
    const destination = signInCodeDestination(input);

    const now = this.clock.now();

    const reviewerBypassResult = await this.tryReviewerBypass({
      channel: destination.channel,
      destination: destination.value,
      code: input.code,
      deviceLabel: input.deviceLabel,
      userAgent: input.userAgent,
      now,
    });
    if (reviewerBypassResult !== null) {
      return reviewerBypassResult;
    }

    const otpRequest = await this.verifySignInCode.execute({
      purpose: Enums.SignInCodePurpose.SignIn,
      destination,
      code: input.code,
    });

    const existingUser = destination.channel === SIGN_IN_CODE_CHANNELS.PHONE
      ? await this.userRepo.findByPhone(destination.value)
      : await this.userRepo.findByEmail(destination.value);
    const isReviewerEmail = destination.channel === SIGN_IN_CODE_CHANNELS.EMAIL &&
      matchesReviewerCredential(
        this.reviewerBypassConfig,
        this.constantTimeComparator,
        SIGN_IN_CODE_CHANNELS.EMAIL,
        destination.value,
        input.code,
      );

    if (
      isReviewerEmail &&
      (!existingUser ||
        (existingUser.role !== "buyer" && existingUser.role !== "seller"))
    ) {
      throw new Error("Invalid OTP code");
    }
    const isNewUser = !existingUser;

    if (isNewUser && process.env["SIGNUPS_ENABLED"] === "false") {
      const err = new Error("Signups are currently disabled");
      (err as Error & { code: string }).code = "FEATURE_DISABLED";
      throw err;
    }

    if (existingUser && await this.identityCheck.isSuspended(existingUser.id)) {
      throw new UserSuspendedError();
    }

    // Claim the code before any side effect, so two concurrent sign-ins with
    // the same code create one session.
    if (!(await this.otpRequestRepo.consumeIfUnused(otpRequest.id))) {
      throw new Error("OTP code has already been used");
    }

    const user =
      existingUser ??
      (await this.userRepo.create(
        destination.verifiedMethods(now),
        drawGeneratedIdentity(() => this.random.next()),
      ));

    // A User in the deletion grace period signs in with the deletion still
    // scheduled; only the signed-in User confirming restores it (ADR-0032).
    const deletionScheduledAt = user.deletionScheduledAt;

    // Bind the consumed code to the signed-in User
    await this.otpRequestRepo.markVerified(otpRequest.id, user.id);

    const result = await this.createSessionResult({
      user,
      now,
      deviceLabel: input.deviceLabel,
      userAgent: input.userAgent,
      deletionScheduledAt,
    });

    if (isReviewerEmail) {
      this.emitReviewerBypassAuthenticated(user, now);
    }

    // Emit UserRegistered for new users
    if (isNewUser) {
      this.eventBus.emit("UserRegistered", {
        userId: user.id,
        phone: user.phone,
        email: user.email,
      });
    }

    return result;
  }

  private async tryReviewerBypass(input: {
    channel: SignInCodeChannel;
    destination: string;
    code: string;
    deviceLabel: string | undefined;
    userAgent: string | undefined;
    now: Date;
  }): Promise<VerifyOtpResult | null> {
    if (
      !this.reviewerBypassConfig.enabled ||
      input.channel !== SIGN_IN_CODE_CHANNELS.PHONE
    ) {
      return null;
    }

    const credentialMatches = matchesReviewerCredential(
      this.reviewerBypassConfig, this.constantTimeComparator,
      SIGN_IN_CODE_CHANNELS.PHONE, input.destination, input.code,
    );
    const reservedAccount = findReviewerAccount(
      this.reviewerBypassConfig, this.constantTimeComparator,
      SIGN_IN_CODE_CHANNELS.PHONE, input.destination,
    );
    // Look up a reserved User even for a wrong code: account lookup timing and
    // the threshold response must not confirm a correct code for a missing or
    // privileged User (PR #764).
    const user = reservedAccount === null ? null : await this.userRepo.findByPhone(input.destination);
    // Ordinary phones never probe the ledger, so their sign-in keeps no Redis
    // dependency and no new failure mode.
    if (reservedAccount === null) return null;
    const allowedCredential = credentialMatches && user !== null &&
      (user.role === "buyer" || user.role === "seller");
    // Every refused reserved credential uses the same budget. A success resets
    // the count. A ledger failure fails closed: refusing beats an unlimited
    // bypass, so it maps to the same lock refusal.
    let locked: boolean;
    try {
      ({ locked } = await this.reservedPhoneAttempts.recordAttempt({
        destination: input.destination,
        failed: !allowedCredential,
      }));
    } catch {
      locked = true;
    }
    if (locked) throw new Error("Too many attempts");
    if (!allowedCredential || user === null) throw new Error("Invalid OTP code");

    const deletionScheduledAt = user.deletionScheduledAt;

    const result = await this.createSessionResult({
      user,
      now: input.now,
      deviceLabel: input.deviceLabel,
      userAgent: input.userAgent,
      deletionScheduledAt,
    });

    this.emitReviewerBypassAuthenticated(user, input.now);

    return result;
  }

  private emitReviewerBypassAuthenticated(user: User, now: Date): void {
    this.eventBus.emit("ReviewerOtpBypassAuthenticated", {
      userId: user.id,
      role: user.role,
      occurredAt: now.toISOString(),
    });
  }

  private async createSessionResult(input: {
    user: User;
    now: Date;
    deviceLabel: string | undefined;
    userAgent: string | undefined;
    deletionScheduledAt: Date | null;
  }): Promise<VerifyOtpResult> {
    const { user, now } = input;
    if (await this.identityCheck.isSuspended(user.id)) {
      throw new UserSuspendedError();
    }

    const sessionCount = await this.sessionRepo.countByUserId(user.id);
    if (sessionCount > 0) {
      await this.sessionRepo.deleteExpiredByUserId(user.id);
    }

    const countAfterCleanup = await this.sessionRepo.countByUserId(user.id);
    if (countAfterCleanup >= MAX_SESSIONS) {
      await this.sessionRepo.deleteOldestByUserId(user.id);
    }

    // Generate refresh token
    const refreshToken = randomBytes(32).toString("hex");
    const refreshTokenHash = await this.hasher.hash(refreshToken);

    const expiresAt = new Date(
      now.getTime() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const session = await this.sessionRepo.create({
      userId: user.id,
      refreshTokenHash,
      deviceLabel: input.deviceLabel ?? null,
      userAgent: input.userAgent ?? null,
      expiresAt,
    });

    // Generate access token (JWT)
    const accessToken = this.jwtService.sign({
      sub: user.id,
      sid: session.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        deletionScheduledAt: input.deletionScheduledAt?.toISOString() ?? null,
      },
    };
  }
}
