import {
  Body,
  Controller,
  Get,
  Post,
  BadRequestException,
  ConflictException,
  Req,
  Inject,
} from "@nestjs/common";
import { AuthSchemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import { GetAdminTotpStatus } from "../application/GetAdminTotpStatus";
import { EnrollAdminTotp } from "../application/EnrollAdminTotp";
import { VerifyAdminTotp } from "../application/VerifyAdminTotp";
import { STAFF_AUTHORITY_PORT, StaffAuthorityDenied, type StaffAuthorityPort } from "../domain/ports/StaffAuthorityPort";
import { staffAuthorityException } from "./staffAuthorityException";

type AuthenticatedRequest = FastifyRequest & {
  user?: { sub?: string; sid?: string; role?: string };
};

@Controller(["api/v1/auth/admin/totp", "api/v1/auth/staff/totp"])
export class AdminAuthController {
  constructor(
    @Inject(GetAdminTotpStatus)
    private readonly getStatus: GetAdminTotpStatus,
    @Inject(EnrollAdminTotp)
    private readonly enrollUC: EnrollAdminTotp,
    @Inject(VerifyAdminTotp)
    private readonly verifyUC: VerifyAdminTotp,
    @Inject(STAFF_AUTHORITY_PORT)
    private readonly authority: StaffAuthorityPort,
  ) {}

  @Get("status")
  async status(@Req() req: AuthenticatedRequest) {
    const { userId, sessionId } = await this.requireAdminSession(req);
    const result = await this.getStatus.execute({ userId, sessionId });
    return result;
  }

  @Post("enroll")
  async enroll(@Req() req: AuthenticatedRequest) {
    const { userId } = await this.requireAdminSession(req);
    try {
      const result = await this.enrollUC.execute({ userId });
      return result;
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "TOTP_ALREADY_ENROLLED") {
        throw new ConflictException({
          code: "CONFLICT",
          message: "TOTP already enrolled",
          details: { reason: "TOTP_ALREADY_ENROLLED" },
        });
      }
      staffAuthorityException(err);
    }
  }

  @Post("verify")
  async verify(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const parsed = AuthSchemas.AdminTotpVerifyRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Invalid TOTP verification request",
        details: parsed.error.flatten(),
      });
    }

    const { userId, sessionId } = await this.requireAdminSession(req);
    try {
      const result = await this.verifyUC.execute({
        userId,
        sessionId,
        code: parsed.data.code,
      });
      return result;
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "TOTP_RATE_LIMITED") {
        throw new BadRequestException({
          code: "RATE_LIMITED",
          message: "Too many failed attempts. Please try again later.",
        });
      }
      if (err instanceof Error && err.message === "Invalid TOTP code") {
        throw new BadRequestException({
          code: "INVALID_TOTP",
          message: "Invalid TOTP code. Please try again.",
        });
      }
      staffAuthorityException(err);
    }
  }

  private async requireAdminSession(
    req: AuthenticatedRequest,
  ): Promise<{ userId: string; sessionId: string }> {
    const user = req.user;
    if (!user?.sub || !user.sid) return staffAuthorityException(new StaffAuthorityDenied("SESSION_REQUIRED"));
    try { await this.authority.summary({ userId: user.sub, sessionId: user.sid }); }
    catch (error) { staffAuthorityException(error); }
    return { userId: user.sub, sessionId: user.sid };
  }
}
