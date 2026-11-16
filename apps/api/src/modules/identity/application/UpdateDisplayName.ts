import { Inject, Injectable } from "@nestjs/common";

import { DisplayName } from "../domain/DisplayName";
import { UserSuspendedError } from "../domain/UserSuspendedError";
import type { IdentityCheckPort } from "../domain/ports/IdentityCheckPort";
import type { UserRepository } from "../domain/ports/UserRepository";
import { IDENTITY_TOKENS } from "../identity.tokens";

export interface UpdateDisplayNameInput {
  userId: string;
  displayName: string;
}

/**
 * Sets the signed-in User's own Display Name. The name is checked by the
 * shared rule and stored normalized; nothing else on the User changes. A
 * suspended User is refused like on other marketplace changes, and a User with
 * a scheduled deletion never gets here (`AccountDeletionPendingGuard`).
 */
@Injectable()
export class UpdateDisplayName {
  constructor(
    @Inject(IDENTITY_TOKENS.UserRepository)
    private readonly userRepo: UserRepository,
    @Inject(IDENTITY_TOKENS.IdentityCheckPort)
    private readonly identityCheck: IdentityCheckPort,
  ) {}

  async execute(input: UpdateDisplayNameInput): Promise<void> {
    const name = DisplayName.create(input.displayName);
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (await this.identityCheck.isSuspended(input.userId)) {
      throw new UserSuspendedError();
    }
    await this.userRepo.updateDisplayName(input.userId, name.value);
  }
}
