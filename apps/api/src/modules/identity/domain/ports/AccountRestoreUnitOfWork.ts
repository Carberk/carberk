/** The writes that restoring a User makes. They exist only inside one unit of work. */
export interface AccountRestoreWrites {
  /** Republishes the seller's Listings that the account deletion archived. */
  republishListingsArchivedByDeletion(sellerId: string): Promise<void>;
  clearDeletionSchedule(userId: string): Promise<void>;
}

/**
 * Runs the restore writes in one transaction: they all commit, or, when the
 * work throws, none of them does. Both helpers must complete, in order,
 * for the declared User. An already-clear User skips work under the prepared
 * fence and returns undefined; a stale discovered graph refuses without retry.
 */
export interface AccountRestoreUnitOfWork {
  run<T>(command: { readonly userId: string }, work: (writes: AccountRestoreWrites) => Promise<T>): Promise<T | undefined>;
}

export const ACCOUNT_RESTORE_UNIT_OF_WORK = Symbol("AccountRestoreUnitOfWork");
