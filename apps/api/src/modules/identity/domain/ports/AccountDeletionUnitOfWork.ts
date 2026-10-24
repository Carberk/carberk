/** The writes that scheduling a User's deletion makes. They exist only inside one unit of work. */
export interface AccountDeletionWrites {
  scheduleDeletion(userId: string, deletionScheduledAt: Date): Promise<void>;
  /** Archives the seller's active Listings and marks them archived by the deletion. */
  archiveActiveListings(sellerId: string): Promise<void>;
}

/**
 * Runs the deletion writes in one transaction: they all commit, or, when the
 * work throws, none of them does. Both helpers must complete, in order,
 * for the declared User and schedule. Mismatches and omissions roll back.
 */
export interface AccountDeletionUnitOfWork {
  run<T>(command: { readonly userId: string; readonly deletionScheduledAt: Date }, work: (writes: AccountDeletionWrites) => Promise<T>): Promise<T>;
}

export const ACCOUNT_DELETION_UNIT_OF_WORK = Symbol("AccountDeletionUnitOfWork");
