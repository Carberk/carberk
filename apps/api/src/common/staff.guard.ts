import { ForbiddenException, Inject, Injectable, SetMetadata, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { StaffSchemas } from "@auto-tm/contracts";
import { STAFF_AUTHORITY_PORT, StaffAuthorityDenied, type StaffAuthorityPort } from "../modules/identity/identity.public";
const PURPOSE = "staff-purpose";
export const StaffCapability = (capability: StaffSchemas.StaffCapability) => SetMetadata(PURPOSE, capability);
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector,
    @Inject(STAFF_AUTHORITY_PORT) private readonly authority: StaffAuthorityPort) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const capability = this.reflector.getAllAndOverride<string>(PURPOSE, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<{ user?: { sub?: string; sid?: string } }>();
    try {
      if (!request.user?.sub || !request.user.sid) throw new StaffAuthorityDenied("SESSION_REQUIRED");
      if (!capability) throw new StaffAuthorityDenied("CAPABILITY_REQUIRED");
      await this.authority.authorize({ userId: request.user.sub, sessionId: request.user.sid, capability });
      return true;
    } catch (error) {
      if (error instanceof StaffAuthorityDenied) throw new ForbiddenException({ code: "FORBIDDEN", message: "Current staff authority required", details: { reason: error.reason } });
      throw error;
    }
  }
}
