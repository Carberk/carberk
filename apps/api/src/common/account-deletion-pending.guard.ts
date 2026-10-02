import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthSchemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";

import {
  IDENTITY_CHECK_PORT,
  type IdentityCheckPort,
} from "../modules/identity/identity.public";

import { ALLOWS_PENDING_DELETION_KEY } from "./allow-pending-deletion.decorator";
import { IS_PUBLIC_KEY } from "./public.decorator";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Until a User whose deletion is scheduled restores the account (ADR-0032),
 * their session may read but not change anything. Routes that allow it, such
 * as restore and logout-all, opt back in with `@AllowPendingDeletion()`.
 * Public routes carry no signed-in User and are never checked.
 */
@Injectable()
export class AccountDeletionPendingGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IDENTITY_CHECK_PORT)
    private readonly identityCheck: IdentityCheckPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: { sub?: string } }>();
    if (READ_METHODS.has(request.method)) return true;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    if (
      this.reflector.getAllAndOverride<boolean>(
        ALLOWS_PENDING_DELETION_KEY,
        targets,
      )
    ) {
      return true;
    }

    const userId = request.user?.sub;
    if (!userId) return true;

    if (await this.identityCheck.isDeletionScheduled(userId)) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message:
          "Your account is scheduled for deletion. Restore it to make changes.",
        details: { reason: AuthSchemas.ACCOUNT_DELETION_PENDING_REASON },
      });
    }
    return true;
  }
}
