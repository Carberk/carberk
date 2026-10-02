export interface IdentityCheckPort {
  isAdmin(userId: string): Promise<boolean>;
  isInDealership(userId: string, dealershipId: string): Promise<boolean>;
  isSuspended(userId: string): Promise<boolean>;
  /** True while the User's account deletion is scheduled and not restored. */
  isDeletionScheduled(userId: string): Promise<boolean>;
}
