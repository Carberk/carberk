export interface IdentityAdminPort {
  /** Suspends the User and revokes their Sessions on the supplied transaction. */
  suspendUser(
    userId: string,
    adminUserId: string,
    reason: string,
    tx?: unknown,
    receipt?: unknown,
    suspendedAt?: Date,
  ): Promise<{
    suspendedAt: Date;
    suspendedById: string;
    suspensionReason: string;
  }>;

  unsuspendUser(
    userId: string,
    tx?: unknown,
    receipt?: unknown,
  ): Promise<{
    suspendedAt: null;
    suspendedById: null;
    suspensionReason: null;
  }>;

  isSuspended(userId: string): Promise<boolean>;
}

export const IDENTITY_ADMIN_PORT = Symbol("IdentityAdminPort");
