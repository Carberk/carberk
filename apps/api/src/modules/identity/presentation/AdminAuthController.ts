import {
  Body,
  Controller,
  Get,
  Post,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Req,
  Inject,
} from "@nestjs/common";
import { AuthSchemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import { GetAdminTotpStatus } from "../application/GetAdminTotpStatus";
import { EnrollAdminTotp } from "../application/EnrollAdminTotp";
import { VerifyAdminTotp } from "../application/VerifyAdminTotp";
import type { SessionRepository } from "../domain/ports/SessionRepository";
import { PrismaSessionRepository } from "../infrastructure/PrismaSessionRepository";
import { STAFF_ACCESS_PORT, type StaffAccessPort } from "../domain/ports/StaffAccessPort";
import { PrismaIdentityCheckAdapter } from "../infrastructure/PrismaIdentityCheckAdapter";
import type { IdentityCheckPort } from "../domain/ports/IdentityCheckPort";
import { SystemClockAdapter } from "../infrastructure/SystemClockAdapter";
import type { ClockPort } from "../domain/ports/ClockPort";

type AuthenticatedRequest = FastifyRequest & {
  user?: { sub?: string; sid?: string; role?: string };
};

@Controller("api/v1/auth/admin/totp")
export class AdminAuthController {
  constructor(
    @Inject(GetAdminTotpStatus)
    private readonly getStatus: GetAdminTotpStatus,
    @Inject(EnrollAdminTotp)
    private readonly enrollUC: EnrollAdminTotp,
    @Inject(VerifyAdminTotp)
    private readonly verifyUC: VerifyAdminTotp,
    @Inject(PrismaSessionRepository)
    private readonly sessionRepo: SessionRepository,
    @Inject(STAFF_ACCESS_PORT) private readonly staff: StaffAccessPort,
    @Inject(PrismaIdentityCheckAdapter) private readonly identity: IdentityCheckPort,
    @Inject(SystemClockAdapter) private readonly clock: ClockPort,
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
      throw err;
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
      throw err;
    }
  }

  private async requireAdminSession(
    req: AuthenticatedRequest,
  ): Promise<{ userId: string; sessionId: string }> {
    const user = req.user;
    if (!user?.sub || !user.sid) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Admin session required",
      });
    }
    const purpose = (req.query as { purpose?: unknown }).purpose;
    if (purpose === "vehicle-history") {
      const actor = await this.staff.findEligibleActor({ userId: user.sub, sessionId: user.sid, purpose });
      if (!actor) throw new ForbiddenException({ code: "HISTORY_ACCESS_DENIED", message: "Current History staff session required" });
      return { userId: actor.id, sessionId: user.sid };
    }
    if (purpose !== undefined || !await this.identity.isAdmin(user.sub)) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Admin role required",
      });
    }

    const session = await this.sessionRepo.findById(user.sid);
    if (!session || session.userId !== user.sub || session.expiresAt <= this.clock.now()) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Session ownership mismatch",
      });
    }

    return { userId: user.sub, sessionId: user.sid };
  }
}
