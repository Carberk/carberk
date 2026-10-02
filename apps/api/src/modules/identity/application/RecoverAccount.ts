import { Inject, Injectable } from "@nestjs/common";
import type { UserRepository } from "../domain/ports/UserRepository";
import type { AccountDeletionListingsPort } from "../domain/ports/AccountDeletionListingsPort";
import { PrismaUserRepository } from "../infrastructure/PrismaUserRepository";
import { ACCOUNT_DELETION_LISTINGS_PORT } from "../domain/ports/AccountDeletionListingsPort";

export interface RecoverAccountInput {
  userId: string;
}

@Injectable()
export class RecoverAccount {
  constructor(
    @Inject(PrismaUserRepository)
    private readonly userRepo: UserRepository,
    @Inject(ACCOUNT_DELETION_LISTINGS_PORT)
    private readonly listingsPort: AccountDeletionListingsPort,
  ) {}

  /**
   * Restores a User whose deletion is scheduled. A User with no scheduled
   * deletion is left as is, so a retried or repeated restore succeeds.
   */
  async execute(input: RecoverAccountInput): Promise<void> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.deletionScheduledAt === null) {
      return;
    }

    await this.userRepo.clearDeletionSchedule(input.userId);
    await this.listingsPort.republishArchivedByDeletionListingsBySeller(input.userId);
  }
}
