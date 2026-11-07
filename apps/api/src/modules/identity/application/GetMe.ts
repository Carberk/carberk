import { Inject, Injectable } from "@nestjs/common";
import type { UserRepository } from "../domain/ports/UserRepository";
import { isPhoneVerified } from "../domain/SignInMethods";
import { PrismaUserRepository } from "../infrastructure/PrismaUserRepository";
import { ConfigListingVideoAccess } from "../../../common/ConfigListingVideoAccess";
import { IDENTITY_TOKENS } from "../identity.tokens";
import type { IdentityCheckPort } from "../domain/ports/IdentityCheckPort";

export interface GetMeInput {
  userId: string;
}

export interface GetMeResult {
  id: string;
  phone: string | null;
  email: string | null;
  phoneVerified: boolean;
  displayName: string | null;
  nameNumber: number;
  avatarIndex: number;
  avatarKey: string | null;
  role: string;
  avatarUrl: string | null;
  locale: string | null;
  createdAt: string;
  deletionScheduledAt: string | null;
  isVideoUploadTester: boolean;
  canUploadVideo: boolean;
}

@Injectable()
export class GetMe {
  constructor(
    @Inject(PrismaUserRepository)
    private readonly userRepo: UserRepository,
    @Inject(ConfigListingVideoAccess)
    private readonly videoAccess: ConfigListingVideoAccess,
    @Inject(IDENTITY_TOKENS.IdentityCheckPort)
    private readonly identity: IdentityCheckPort,
  ) {}

  async execute(input: GetMeInput): Promise<GetMeResult> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const isVideoUploadTester = this.videoAccess.canResumeVideo(user.id)
      && !user.deletionScheduledAt && !(await this.identity.isSuspended(user.id));

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      phoneVerified: isPhoneVerified(user),
      displayName: user.displayName,
      nameNumber: user.nameNumber,
      avatarIndex: user.avatarIndex,
      avatarKey: user.avatarKey,
      role: user.role,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      createdAt: user.createdAt.toISOString(),
      deletionScheduledAt: user.deletionScheduledAt?.toISOString() ?? null,
      isVideoUploadTester,
      canUploadVideo: isVideoUploadTester && this.videoAccess.canUploadVideo(user.id),
    };
  }
}
