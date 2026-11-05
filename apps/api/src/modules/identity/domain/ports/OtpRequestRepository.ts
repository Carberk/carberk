import type {
  OtpRequest,
  SignInCodeChannel,
  SignInCodePurpose,
} from "../OtpRequest";

export interface OtpRequestRepository {
  create(input: {
    purpose: SignInCodePurpose;
    channel: SignInCodeChannel;
    destination: string;
    codeHash: string;
    expiresAt: Date;
    userId: string | null;
    ip: string;
  }): Promise<OtpRequest>;

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

  /** Atomically consumes an unused, unlocked request; false if consumed or locked. */
  consumeIfUnused(id: string): Promise<boolean>;

  /** Atomically spends a wrong attempt below the limit; null if locked or consumed. */
  incrementAttempts(id: string): Promise<OtpRequest | null>;
}
