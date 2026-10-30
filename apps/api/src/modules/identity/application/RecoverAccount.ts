import { Inject, Injectable } from "@nestjs/common";
import type { UserRepository } from "../domain/ports/UserRepository";
import type { AccountRestoreUnitOfWork } from "../domain/ports/AccountRestoreUnitOfWork";
import { PrismaUserRepository } from "../infrastructure/PrismaUserRepository";
import { ACCOUNT_RESTORE_UNIT_OF_WORK } from "../domain/ports/AccountRestoreUnitOfWork";

export interface RecoverAccountInput {
  userId: string;
}

@Injectable()
export class RecoverAccount {
  constructor(
    @Inject(PrismaUserRepository)
    private readonly userRepo: UserRepository,
    @Inject(ACCOUNT_RESTORE_UNIT_OF_WORK)
    private readonly unitOfWork: AccountRestoreUnitOfWork,
  ) {}

  /**
   * Restores a User whose deletion is scheduled: republishes the Listings the
   * deletion archived and clears the schedule in one unit of work, so either
   * both writes commit or neither does and a retry starts from the same state.
   * A User with no scheduled deletion is left as is, so a repeated restore
   * succeeds without writing.
   */
  async execute(input: RecoverAccountInput): Promise<void> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.deletionScheduledAt === null) {
      return;
    }

    await this.unitOfWork.run({ userId: input.userId }, async (writes) => {
      await writes.republishListingsArchivedByDeletion(input.userId);
      await writes.clearDeletionSchedule(input.userId);
    });
  }
}
