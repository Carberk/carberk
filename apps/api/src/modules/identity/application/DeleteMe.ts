import { Inject, Injectable } from "@nestjs/common";
import type { UserRepository } from "../domain/ports/UserRepository";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import type { AccountDeletionUnitOfWork } from "../domain/ports/AccountDeletionUnitOfWork";
import type { ClockPort } from "../domain/ports/ClockPort";
import { ACCOUNT_DELETION_UNIT_OF_WORK } from "../domain/ports/AccountDeletionUnitOfWork";
import { IDENTITY_TOKENS } from "../identity.tokens";

const GRACE_PERIOD_DAYS = 30;

export interface DeleteMeInput {
  userId: string;
}

@Injectable()
export class DeleteMe {
  constructor(
    @Inject(IDENTITY_TOKENS.UserRepository)
    private readonly userRepo: UserRepository,
    @Inject(IDENTITY_TOKENS.SessionRepository)
    private readonly sessionRepo: SessionRepository,
    @Inject(ACCOUNT_DELETION_UNIT_OF_WORK)
    private readonly unitOfWork: AccountDeletionUnitOfWork,
    @Inject(IDENTITY_TOKENS.ClockPort)
    private readonly clock: ClockPort,
  ) {}

  /**
   * Schedules the User's deletion after the grace period and archives the
   * seller's active Listings in one unit of work, so either both writes commit
   * or neither does.
   *
   * Session revocation stays outside that unit of work: refresh state is
   * written only through the session repository. It runs first, so a failed
   * revocation writes nothing, and a failed deletion leaves the User signed
   * out but not scheduled. Both leave `DELETE /me` open to a retry, which the
   * pending-deletion guard would refuse once the schedule is set.
   */
  async execute(input: DeleteMeInput): Promise<void> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const now = this.clock.now();
    const deletionScheduledAt = new Date(
      now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.sessionRepo.deleteAllByUserId(input.userId);
    await this.unitOfWork.run(async (writes) => {
      await writes.scheduleDeletion(input.userId, deletionScheduledAt);
      await writes.archiveActiveListings(input.userId);
    });
  }
}
