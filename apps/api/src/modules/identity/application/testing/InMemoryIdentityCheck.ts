import type { IdentityCheckPort } from "../../domain/ports/IdentityCheckPort";

/** `IdentityCheckPort` with admin and suspension state held in memory. */
export class InMemoryIdentityCheck implements IdentityCheckPort {
  private readonly admins = new Set<string>();

  setAdmin(userId: string, isAdmin: boolean): void {
    if (isAdmin) this.admins.add(userId);
    else this.admins.delete(userId);
  }

  private readonly suspended = new Set<string>();

  suspend(userId: string): void {
    this.suspended.add(userId);
  }

  unsuspend(userId: string): void {
    this.suspended.delete(userId);
  }

  async isAdmin(userId: string): Promise<boolean> {
    return this.admins.has(userId);
  }

  async isInDealership(_userId: string, _dealershipId: string): Promise<boolean> {
    return false;
  }

  async isSuspended(userId: string): Promise<boolean> {
    return this.suspended.has(userId);
  }

  async isDeletionScheduled(_userId: string): Promise<boolean> {
    return false;
  }

  async holdsSignInPhone(_userId: string, _phone: string): Promise<boolean> {
    return false;
  }
}
