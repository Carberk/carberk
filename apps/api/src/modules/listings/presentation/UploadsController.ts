import { Controller, Inject, Post, Body, Req, ForbiddenException, BadRequestException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { FastifyRequest } from "fastify";
import { UploadsSchemas, AdminSchemas, ErrorCode } from "@auto-tm/contracts";

import { IDENTITY_CHECK_PORT, type IdentityCheckPort } from "../../identity/identity.public";
import { PresignUpload } from "../application/PresignUpload";
import { RenewPhotoUpload } from "../application/RenewPhotoUpload";

type AuthenticatedRequest = FastifyRequest & { user?: { sub?: string } };

@Controller("api/v1/uploads")
export class UploadsController {
  constructor(
    @Inject(PresignUpload) private readonly presignUploadUC: PresignUpload,
    @Inject(RenewPhotoUpload) private readonly renewPhotoUpload: RenewPhotoUpload,
    @Inject(IDENTITY_CHECK_PORT)
    private readonly identityCheck: IdentityCheckPort,
  ) {}

  @Post("renew")
  @SkipThrottle()
  async renew(@Body() body: unknown, @Req() req: FastifyRequest) {
    const userId = (req as AuthenticatedRequest).user?.sub as string;
    if (await this.identityCheck.isSuspended(userId)) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "User is suspended",
        details: { reason: AdminSchemas.AdminErrorReason.UserSuspended } });
    }
    const parsed = UploadsSchemas.RenewPhotoUploadRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: ErrorCode.ValidationFailed, message: "Invalid photo renewal request" });
    return this.renewPhotoUpload.execute({ ...parsed.data, userId });
  }

  @Post("presign")
  @SkipThrottle()
  async presignUpload(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    const userId = (req as AuthenticatedRequest).user?.sub as string;
    const suspended = await this.identityCheck.isSuspended(userId);
    if (suspended) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "User is suspended",
        details: { reason: AdminSchemas.AdminErrorReason.UserSuspended },
      });
    }

    const parsed = UploadsSchemas.PresignRequestSchema.parse(body);

    const result = await this.presignUploadUC.execute({
      userId,
      kind: parsed.kind,
      contentType: parsed.contentType,
      sizeBytes: parsed.sizeBytes,
      ...(parsed.writeProtocol ? { writeProtocol: parsed.writeProtocol } : {}),
    });

    return {
      uploadUrl: result.uploadUrl,
      key: result.key,
      expiresIn: result.expiresIn,
      maxSizeBytes: result.maxSizeBytes,
      ...(result.headers ? { headers: result.headers } : {}),
    };
  }
}
