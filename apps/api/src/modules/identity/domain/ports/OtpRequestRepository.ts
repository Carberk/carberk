import type { ClockPort } from "./ClockPort";
import type { SignInCodeDestination } from "../SignInCodeDestination";
import type {
  OtpRequest,
  SignInCodeChannel,
  SignInCodePurpose,
} from "../OtpRequest";

export interface CreateOtpRequest {
  purpose: SignInCodePurpose;
  channel: SignInCodeChannel;
  destination: string;
  codeHash: string;
  expiresAt: Date;
  userId: string | null;
  businessId?: string | undefined;
  ip: string;
}

export interface OtpRequestRepository {
  /**
   * Atomically checks all-purpose rolling budgets/cooldown and persists a code.
   * destination must be normalized. Sample clock only after admission locks are
   * held; use that time for windows, createdAt and destination.expiresAt.
   * Throws SignInCodeRateLimitedError on policy refusal. Storage/timeout errors
   * propagate unchanged. A resolved promise means committed: deliver afterward.
   */
  reserve(
    input: Omit<CreateOtpRequest, "channel" | "destination" | "expiresAt"> & {
      destination: SignInCodeDestination;
    },
    clock: ClockPort,
  ): Promise<{ record: OtpRequest; resendInSeconds: number }>;

  create(input: CreateOtpRequest): Promise<OtpRequest>;

  findById(id: string): Promise<OtpRequest | null>;

  /** The newest code of any purpose: the shared backoff reads this (ADR-0081). */
  findLatestByDestination(
    channel: SignInCodeChannel,
    destination: string,
  ): Promise<OtpRequest | null>;

  /**
   * The newest code issued for `purpose`, which is the only code a verify
   * checks. With `userId`, only codes bound to that User count.
   */
  findLatestForPurpose(input: {
    purpose: SignInCodePurpose;
    channel: SignInCodeChannel;
    destination: string;
    userId?: string;
    businessId?: string | undefined;
  }): Promise<OtpRequest | null>;

  /** Counts codes of every purpose: the per-destination limit is shared. */
  countByDestinationSince(
    channel: SignInCodeChannel,
    destination: string,
    since: Date,
  ): Promise<number>;

  /** Counts codes of every purpose: the per-IP limit is shared. */
  countByIpSince(ip: string, since: Date): Promise<number>;

  markVerified(id: string, userId: string): Promise<OtpRequest>;

  /** Atomically marks an unused request as used; false when another caller already used it. */
  consumeIfUnused(id: string): Promise<boolean>;

  incrementAttempts(id: string): Promise<OtpRequest>;
}
