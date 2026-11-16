import { Inject, Injectable } from "@nestjs/common";

import { UserSuspendedError } from "../domain/UserSuspendedError";
import type { IdentityCheckPort } from "../domain/ports/IdentityCheckPort";
import { PROFILE_PHOTO_PORT, type ProfilePhotoPort } from "../domain/ports/ProfilePhotoPort";
import type { UserRepository } from "../domain/ports/UserRepository";
import { IDENTITY_TOKENS } from "../identity.tokens";

export interface RemoveProfilePhotoInput {
  userId: string;
}

/**
 * Removes the signed-in User's Profile Photo, so their Assigned Avatar shows
 * again. A User with no photo succeeds unchanged. The upload boundary retires
 * the photo's upload and records its storage deletion. A suspended User is
 * refused like on other marketplace changes.
 */
@Injectable()
export class RemoveProfilePhoto {
  constructor(
    @Inject(IDENTITY_TOKENS.UserRepository)
    private readonly userRepo: UserRepository,
    @Inject(IDENTITY_TOKENS.IdentityCheckPort)
    private readonly identityCheck: IdentityCheckPort,
    @Inject(PROFILE_PHOTO_PORT)
    private readonly photos: ProfilePhotoPort,
  ) {}

  async execute(input: RemoveProfilePhotoInput): Promise<void> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (await this.identityCheck.isSuspended(input.userId)) {
      throw new UserSuspendedError();
    }
    await this.photos.release(input.userId);
  }
}
