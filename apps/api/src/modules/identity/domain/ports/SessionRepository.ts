import type { Session } from "../Session";

export interface SessionLookupResult {
  session: Session;
  userId: string;
  phone: string | null;
  email: string | null;
  role: string;
}

export interface SessionRepository {
  create(input: {
    userId: string;
    refreshTokenHash: string;
    deviceLabel: string | null;
    userAgent: string | null;
    expiresAt: Date;
  }): Promise<Session>;

  countByUserId(userId: string): Promise<number>;

  deleteExpiredByUserId(userId: string): Promise<number>;

  /** Deletes the session with the earliest createdAt for the given user. */
  deleteOldestByUserId(userId: string): Promise<void>;

  /**
   * Finds one session by its indexed refresh-token digest. Includes user
   * identity for JWT issuance. Expiry is checked by the caller: logout may
   * delete an expired session, while refresh must refuse it.
   */
  findByRefreshToken(plaintext: string): Promise<SessionLookupResult | null>;

  /**
   * Atomically updates the refresh token hash on a session row.
   * The oldHash acts as an optimistic lock — if the row's current hash
   * doesn't match, the rotation is rejected (returns false).
   */
  rotateRefreshToken(
    id: string,
    oldHash: string,
    newHash: string,
    lastSeenAt: Date,
    expiresAt: Date,
  ): Promise<boolean>;

  /** Finds a session by its primary key. */
  findById(id: string): Promise<Session | null>;

  /**
   * Updates the admin TOTP elevation expiry on a session row.
   */
  updateAdminTotpExpiresAt(
    id: string,
    adminTotpExpiresAt: Date | null,
  ): Promise<void>;

  /** Deletes a single session by ID. */
  delete(id: string): Promise<void>;

  /** Deletes all sessions for the given user. Returns the count of deleted rows. */
  deleteAllByUserId(userId: string): Promise<number>;
}
