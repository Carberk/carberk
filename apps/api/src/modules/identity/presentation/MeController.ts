import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Body,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import { AuthSchemas, IdentitySchemas } from "@auto-tm/contracts";

import { GetMe } from "../application/GetMe";
import { DeleteMe } from "../application/DeleteMe";
import { BlockUser } from "../application/BlockUser";
import { UnblockUser } from "../application/UnblockUser";
import { IsBlocked } from "../application/IsBlocked";
import { RequestSignInMethodChange } from "../application/RequestSignInMethodChange";
import { ConfirmSignInMethodChange } from "../application/ConfirmSignInMethodChange";
import { RecoverAccount } from "../application/RecoverAccount";
import { AllowPendingDeletion } from "../../../common/allow-pending-deletion.decorator";
import {
  IDENTITY_ERROR_CODES,
  IdentityDomainError,
} from "../domain/types";
import { signInCodeRateLimitedException } from "./signInCodeRateLimited";

type AuthenticatedRequest = FastifyRequest & { user?: { sub?: string } };

@Controller("api/v1/me")
export class MeController {
  constructor(
    @Inject(GetMe) private readonly getMe: GetMe,
    @Inject(DeleteMe) private readonly deleteMe: DeleteMe,
    @Inject(BlockUser) private readonly blockUser: BlockUser,
    @Inject(UnblockUser) private readonly unblockUser: UnblockUser,
    @Inject(IsBlocked) private readonly isBlocked: IsBlocked,
    @Inject(RequestSignInMethodChange)
    private readonly requestSignInMethodChange: RequestSignInMethodChange,
    @Inject(ConfirmSignInMethodChange)
    private readonly confirmSignInMethodChange: ConfirmSignInMethodChange,
    @Inject(RecoverAccount) private readonly recoverAccount: RecoverAccount,
  ) {}

  @Get()
  async me(@Req() req: FastifyRequest) {
    const userId = this.userId(req);

    try {
      return await this.getMe.execute({ userId });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "User not found") {
        throw new NotFoundException({
          code: "USER_NOT_FOUND",
          message: "User not found.",
        });
      }
      throw err;
    }
  }

  @Delete()
  @HttpCode(204)
  async delete(@Req() req: FastifyRequest): Promise<void> {
    const userId = this.userId(req);

    try {
      await this.deleteMe.execute({ userId });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "User not found") {
        throw new NotFoundException({
          code: "USER_NOT_FOUND",
          message: "User not found.",
        });
      }
      throw err;
    }
  }

  /**
   * Restores the account after the User confirms (ADR-0032). The session that
   * signed in during the grace period may call it before anything else.
   */
  @Post("restore")
  @AllowPendingDeletion()
  @HttpCode(200)
  async restore(@Req() req: FastifyRequest) {
    const userId = this.userId(req);

    try {
      await this.recoverAccount.execute({ userId });
      return await this.getMe.execute({ userId });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "User not found") {
        throw new NotFoundException({
          code: "USER_NOT_FOUND",
          message: "User not found.",
        });
      }
      throw err;
    }
  }

  @Post("blocked-users")
  async block(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    const userId = this.userId(req);
    const parsed = this.parseOrThrow(IdentitySchemas.BlockUserRequestSchema, body);

    const result = await this.blockUser.execute({
      blockerId: userId,
      blockedId: parsed.userId,
    });

    return result;
  }

  @Post("sign-in-methods/request")
  async requestMethodChange(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    const userId = this.userId(req);
    const parsed = this.parseOrThrow(
      AuthSchemas.SignInMethodChangeRequestSchema,
      body,
    );

    try {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
        ?? req.ip
        ?? "127.0.0.1";
      const locale = (req as FastifyRequest & { locale?: "ru" | "tk" | "en" }).locale
        ?? "ru";
      return await this.requestSignInMethodChange.execute(
        "phone" in parsed
          ? { userId, phone: parsed.phone, ip, locale }
          : { userId, email: parsed.email, ip, locale },
      );
    } catch (error) {
      this.throwSignInMethodError(error);
    }
  }

  @Post("sign-in-methods/verify")
  async verifyMethodChange(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    const userId = this.userId(req);
    const parsed = this.parseOrThrow(
      AuthSchemas.SignInMethodChangeVerifyRequestSchema,
      body,
    );

    try {
      await this.confirmSignInMethodChange.execute(
        "phone" in parsed
          ? { userId, phone: parsed.phone, code: parsed.code }
          : { userId, email: parsed.email, code: parsed.code },
      );
      return await this.getMe.execute({ userId });
    } catch (error) {
      this.throwSignInMethodError(error);
    }
  }

  @Delete("blocked-users/:userId")
  @HttpCode(200)
  async unblock(
    @Req() req: FastifyRequest,
    @Param("userId") blockedId: string,
  ) {
    const userId = this.userId(req);

    const result = await this.unblockUser.execute({
      blockerId: userId,
      blockedId,
    });

    return result;
  }

  @Get("blocked-users/:userId")
  async isBlockedUser(
    @Req() req: FastifyRequest,
    @Param("userId") blockedId: string,
  ) {
    const userId = this.userId(req);

    return this.isBlocked.execute({ blockerId: userId, blockedId });
  }

  private userId(req: FastifyRequest): string {
    const sub = (req as AuthenticatedRequest).user?.sub;
    if (!sub) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      });
    }
    return sub;
  }

  private parseOrThrow<T>(
    schema: { parse: (data: unknown) => T },
    data: unknown,
  ): T {
    try {
      return schema.parse(data);
    } catch (err) {
      if (err && typeof err === "object" && "issues" in err) {
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: "Invalid request",
          details: (err as z.ZodError).flatten(),
        });
      }
      throw err;
    }
  }

  private throwSignInMethodError(error: unknown): never {
    if (
      error instanceof IdentityDomainError &&
      error.code === IDENTITY_ERROR_CODES.SIGN_IN_METHOD_TAKEN
    ) {
      throw new ConflictException({
        code: IDENTITY_ERROR_CODES.SIGN_IN_METHOD_TAKEN,
        message: "This Sign-in Method belongs to another User.",
      });
    }
    if (error instanceof Error && error.message === "User not found") {
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "User not found.",
      });
    }
    const rateLimited = signInCodeRateLimitedException(
      error,
      "Too many code requests. Please wait before trying again.",
    );
    if (rateLimited !== null) throw rateLimited;
    if (
      error instanceof Error &&
      (error.message.startsWith("Phone must be") ||
        error.message.startsWith("Email must be"))
    ) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: error.message,
      });
    }

    const otpErrors: Record<string, { code: string; message: string }> = {
      "OTP code has expired": {
        code: "OTP_EXPIRED",
        message: "OTP code has expired. Please request a new one.",
      },
      "OTP code has already been used": {
        code: "OTP_ALREADY_USED",
        message: "This code has already been used.",
      },
      "Invalid OTP code": {
        code: "INVALID_OTP",
        message: "Invalid OTP code. Please try again.",
      },
      "Too many attempts": {
        code: "OTP_LOCKED",
        message: "Too many failed attempts. Please request a new code.",
      },
      "No Sign-in Code request found": {
        code: "OTP_NOT_FOUND",
        message: "No code request found. Please request a code first.",
      },
      "No Sign-in Method change request found": {
        code: "OTP_NOT_FOUND",
        message: "No Sign-in Method change request found.",
      },
    };
    if (error instanceof Error && otpErrors[error.message]) {
      throw new BadRequestException(otpErrors[error.message]);
    }
    throw error;
  }
}
