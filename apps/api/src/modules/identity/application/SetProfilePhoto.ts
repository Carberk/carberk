import { Inject, Injectable } from "@nestjs/common";

import { UserSuspendedError } from "../domain/UserSuspendedError";
import type { IdentityCheckPort } from "../domain/ports/IdentityCheckPort";
import { PROFILE_PHOTO_PORT, type ProfilePhotoPort } from "../domain/ports/ProfilePhotoPort";
import type { UserRepository } from "../domain/ports/UserRepository";
import { IDENTITY_TOKENS } from "../identity.tokens";

export interface SetProfilePhotoInput {
  userId: string;
  key: string;
}

/**
 * Sets the signed-in User's Profile Photo from an upload they presigned. The
 * upload boundary decides whether the key may be adopted and stores it; a
 * second photo replaces the first. Sending the current photo's key again
 * changes nothing. The Assigned Avatar index never changes. A suspended User is
 * refused like on other marketplace changes, and a User with a scheduled
 * deletion never gets here (`AccountDeletionPendingGuard`).
 */
@Injectable()
export class SetProfilePhoto {
  constructor(
    @Inject(IDENTITY_TOKENS.UserRepository)
    private readonly userRepo: UserRepository,
    @Inject(IDENTITY_TOKENS.IdentityCheckPort)
    private readonly identityCheck: IdentityCheckPort,
    @Inject(PROFILE_PHOTO_PORT)
    private readonly photos: ProfilePhotoPort,
  ) {}

  async execute(input: SetProfilePhotoInput): Promise<void> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (await this.identityCheck.isSuspended(input.userId)) {
      throw new UserSuspendedError();
    }
    if (user.avatarKey === input.key) {
      return;
    }
    await this.photos.adopt({ userId: input.userId, key: input.key });
  }
}
