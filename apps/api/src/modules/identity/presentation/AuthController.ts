import {
  Body,
  Controller,
  HttpCode,
  Post,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  Req,
  Inject,
  Optional,
} from "@nestjs/common";
import { MEASUREMENT_SIGN_IN_OUTCOME_PORT,type MeasurementSignInOutcomePort } from "../../measurement/measurement.public";
import { AuthSchemas, AdminSchemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import { AllowPendingDeletion } from "../../../common/allow-pending-deletion.decorator";
import { resolveClientIp } from "../../../common/client-ip";
import { Public } from "../../../common/public.decorator";
import { RequestOtp } from "../application/RequestOtp";
import { UserSuspendedError } from "../domain/UserSuspendedError";
import { VerifyOtp } from "../application/VerifyOtp";
import { RefreshSession } from "../application/RefreshSession";
import { Logout } from "../application/Logout";
import { LogoutAll } from "../application/LogoutAll";
import { signInCodeRateLimitedException } from "./signInCodeRateLimited";

type AuthenticatedRequest = FastifyRequest & { user?: { sub?: string } };
type LocalizedAuthRequest = FastifyRequest & { locale?: "ru" | "tk" | "en" };

@Controller("api/v1/auth")
export class AuthController {
  constructor(
    @Inject(RequestOtp) private readonly requestOtp: RequestOtp,
    @Inject(VerifyOtp) private readonly verifyOtp: VerifyOtp,
    @Inject(RefreshSession) private readonly refreshSession: RefreshSession,
    @Inject(Logout) private readonly logoutUseCase: Logout,
    @Inject(LogoutAll) private readonly logoutAllUseCase: LogoutAll,
    @Optional() @Inject(MEASUREMENT_SIGN_IN_OUTCOME_PORT) private readonly signInMeasurement?:MeasurementSignInOutcomePort,
  ) {}

  @Public()
  @Post("otp/request")
  async otpRequest(
    @Body() body: unknown,
    @Req() req: LocalizedAuthRequest,
  ) {
    const parsed = AuthSchemas.OtpRequestRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Invalid sign-in destination",
        details: parsed.error.flatten(),
      });
    }

    try {
      const ip = resolveClientIp(req);

      const result = await this.requestOtp.execute(
        "phone" in parsed.data
          ? { phone: parsed.data.phone, ip, locale: req.locale ?? "ru" }
          : { email: parsed.data.email, ip, locale: req.locale ?? "ru" },
      );

      return {
        requestId: result.requestId,
        resendInSeconds: result.resendInSeconds,
        ...(result.testCode !== undefined ? { testCode: result.testCode } : {}),
      };
    } catch (err: unknown) {
      const rateLimited = signInCodeRateLimitedException(
        err,
        "Too many OTP requests. Please wait before trying again.",
      );
      if (rateLimited !== null) throw rateLimited;
      if (
        err instanceof Error &&
        (err.message.startsWith("Phone must be") ||
          err.message.startsWith("Email must be"))
      ) {
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: err.message,
        });
      }
      throw err;
    }
  }

  @Public()
  @Post("otp/verify")
  async otpVerify(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    const parsed = AuthSchemas.OtpVerifyRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Invalid OTP verification request",
        details: parsed.error.flatten(),
      });
    }

    const startedAt=Date.now();
    const attempt=req.headers["x-measurement-attempt"],guest=req.headers["x-measurement-guest"];
    const record=(result:"success"|"expected_rejection"|"technical_failure",category?:"validation"|"permission"|"unknown")=>{
      void this.signInMeasurement?.record({...(typeof attempt==="string"?{attemptId:attempt}:{}),...(typeof guest==="string"?{guestCapability:guest}:{}),result,durationMs:Math.min(86400000,Math.max(0,Date.now()-startedAt)),...(category?{category}:{})}).catch(()=>undefined);
    };
    try {
      const userAgent = req.headers["user-agent"] as string | undefined;

      const result = await this.verifyOtp.execute({
        ...("phone" in parsed.data
          ? { phone: parsed.data.phone }
          : { email: parsed.data.email }),
        code: parsed.data.code,
        ...(parsed.data.deviceLabel !== undefined ? { deviceLabel: parsed.data.deviceLabel } : {}),
        ...(userAgent !== undefined ? { userAgent } : {}),
      });

      record("success");
      return result;
    } catch (err: unknown) {
      const expected=err instanceof UserSuspendedError || (err instanceof Error && /^(OTP|Invalid OTP|Too many|Signups are currently disabled)/.test(err.message));
      record(expected?"expected_rejection":"technical_failure",err instanceof UserSuspendedError?"permission":expected?"validation":"unknown");
      if (err instanceof UserSuspendedError) {
        throw new ForbiddenException({
          code: "FORBIDDEN",
          message: err.message,
          details: { reason: AdminSchemas.AdminErrorReason.UserSuspended },
        });
      }
      if (err instanceof Error && err.message === "OTP code has expired") {
        throw new BadRequestException({
          code: "OTP_EXPIRED",
          message: "OTP code has expired. Please request a new one.",
        });
      }
      if (err instanceof Error && err.message === "OTP code has already been used") {
        throw new BadRequestException({
          code: "OTP_ALREADY_USED",
          message: "This code has already been used.",
        });
      }
      if (err instanceof Error && err.message === "Invalid OTP code") {
        throw new BadRequestException({
          code: "INVALID_OTP",
          message: "Invalid OTP code. Please try again.",
        });
      }
      if (err instanceof Error && err.message === "Too many attempts") {
        throw new BadRequestException({
          code: "OTP_LOCKED",
          message: "Too many failed attempts. Wait 15 minutes and try again.",
        });
      }
      if (err instanceof Error && err.message === "No Sign-in Code request found") {
        throw new BadRequestException({
          code: "OTP_NOT_FOUND",
          message: "No OTP request found. Please request a code first.",
        });
      }
      if (err instanceof Error && err.message === "Signups are currently disabled") {
        throw new ForbiddenException({
          code: "FORBIDDEN",
          message: "Signups are currently disabled. Please try again later.",
          details: { reason: "FEATURE_DISABLED" },
        });
      }
      throw err;
    }
  }

  @Public()
  @Post("refresh")
  async refresh(@Body() body: unknown) {
    const parsed = AuthSchemas.RefreshRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Invalid refresh token format",
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await this.refreshSession.execute({
        refreshToken: parsed.data.refreshToken,
      });
      return result;
    } catch (err: unknown) {
      if (err instanceof UserSuspendedError) {
        throw new ForbiddenException({
          code: "FORBIDDEN",
          message: err.message,
          details: { reason: AdminSchemas.AdminErrorReason.UserSuspended },
        });
      }
      if (err instanceof Error && err.message === "Invalid refresh token") {
        throw new UnauthorizedException({
          code: "INVALID_REFRESH_TOKEN",
          message: "The refresh token is invalid or has been revoked.",
        });
      }
      if (err instanceof Error && err.message === "Session expired") {
        throw new UnauthorizedException({
          code: "SESSION_EXPIRED",
          message: "Your session has expired. Please log in again.",
        });
      }
      if (err instanceof Error && err.message === "Token already used") {
        throw new UnauthorizedException({
          code: "TOKEN_ALREADY_USED",
          message: "This refresh token has already been used.",
        });
      }
      throw err;
    }
  }

  @Public()
  @HttpCode(204)
  @Post("logout")
  async logout(@Body() body: unknown) {
    const parsed = AuthSchemas.LogoutRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Invalid refresh token format",
        details: parsed.error.flatten(),
      });
    }

    try {
      await this.logoutUseCase.execute({ refreshToken: parsed.data.refreshToken });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "Invalid refresh token") {
        throw new UnauthorizedException({
          code: "INVALID_REFRESH_TOKEN",
          message: "The refresh token is invalid or has been revoked.",
        });
      }
      throw err;
    }
  }

  @AllowPendingDeletion()
  @HttpCode(204)
  @Post("logout-all")
  async logoutAll(@Req() req: FastifyRequest) {
    const userId = (req as AuthenticatedRequest).user?.sub as string;
    await this.logoutAllUseCase.execute({ userId });
  }
}
