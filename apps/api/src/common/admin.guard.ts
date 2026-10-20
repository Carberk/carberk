import type { CanActivate, ExecutionContext } from "@nestjs/common";
import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import {
  IDENTITY_CHECK_PORT,
  ADMIN_SESSION_ELEVATION_PORT,
  type AdminSessionElevationPort,
  type IdentityCheckPort,
} from "../modules/identity/identity.public";

interface JwtPayload {
  sub?: string;
  sid?: string;
  role?: string;
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(IDENTITY_CHECK_PORT)
    private readonly identityCheck: IdentityCheckPort,
    @Inject(ADMIN_SESSION_ELEVATION_PORT)
    private readonly elevation: AdminSessionElevationPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: JwtPayload }>();
    const user = request.user;

    if (!user?.sub) {
      throw new UnauthorizedException("Authentication required");
    }

    const isAdmin = await this.identityCheck.isAdmin(user.sub);
    if (!isAdmin) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Admin role required",
      });
    }

    if (!user.sid) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Admin TOTP elevation required",
      });
    }

    const result = await this.elevation.check({
      userId: user.sub,
      sessionId: user.sid,
    });
    if (result === "session-required") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Admin TOTP elevation required",
      });
    }

    if (result === "session-expired") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Admin session expired",
      });
    }

    if (result === "elevation-expired") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Admin TOTP elevation expired",
      });
    }

    return true;
  }
}
