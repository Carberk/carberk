import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, Param, Post, Req, ConflictException } from "@nestjs/common";
import { BusinessSchemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import { AdmitBusiness } from "../application/AdmitBusiness";
import { InviteBusinessMember } from "../application/InviteBusinessMember";
import { RedeemBusinessInvitation } from "../application/RedeemBusinessInvitation";
import { RevokeBusinessInvitation } from "../application/RevokeBusinessInvitation";
import { ChangeBusinessMembership } from "../application/ChangeBusinessMembership";
import { UpdateBusinessSettings } from "../application/UpdateBusinessSettings";
import { RecoverBusinessOwner } from "../application/RecoverBusinessOwner";
import { BUSINESS_REPOSITORY, type BusinessRepository } from "../domain/ports/BusinessRepository";
import { BusinessAuthorityDenied, type BusinessSubject } from "../domain/ports/BusinessAuthorityPort";
import { StaffAuthorityDenied } from "../domain/ports/StaffAuthorityPort";
import { staffAuthorityException } from "./staffAuthorityException";

import { IDENTITY_TOKENS } from "../identity.tokens";
import type { ClockPort } from "../domain/ports/ClockPort";

type Request = FastifyRequest & { user?: { sub?: string; sid?: string } };
@Controller("api/v1/business")
export class BusinessController {
 constructor(@Inject(IDENTITY_TOKENS.ClockPort) private readonly clock: ClockPort, @Inject(BUSINESS_REPOSITORY) private readonly repository: BusinessRepository,
 @Inject(AdmitBusiness) private readonly admission: AdmitBusiness,
 @Inject(InviteBusinessMember) private readonly invitation: InviteBusinessMember,
 @Inject(RedeemBusinessInvitation) private readonly redemption: RedeemBusinessInvitation,
 @Inject(RevokeBusinessInvitation) private readonly revocation: RevokeBusinessInvitation,
 @Inject(ChangeBusinessMembership) private readonly membership: ChangeBusinessMembership,
 @Inject(UpdateBusinessSettings) private readonly settings: UpdateBusinessSettings,
 @Inject(RecoverBusinessOwner) private readonly recovery: RecoverBusinessOwner) {}
 private subject(req: Request): BusinessSubject {
  if (!req.user?.sub || !req.user.sid) throw new BusinessAuthorityDenied("SESSION_REQUIRED");
  return { userId: req.user.sub, sessionId: req.user.sid };
 }
 private parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_FAILED", message: "Invalid business request" });
  return parsed.data;
 }
 private async result<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
   if (error instanceof StaffAuthorityDenied) staffAuthorityException(error);
   if (error instanceof BusinessAuthorityDenied) {
    const body = { code: "FORBIDDEN", message: "Business request refused", details: { reason: error.reason } };
    if (["INVITATION_INVALID", "MEMBERSHIP_CONFLICT", "SOLE_OWNER", "RECOVERY_REQUIRED"].includes(error.reason)) throw new ConflictException({ ...body, code: "CONFLICT" });
    throw new ForbiddenException(body);
   }
   // Unique membership, concurrent transaction or a changed foreign key must
   // fail without returning raw constraints, recipient values or token hashes.
   if (typeof error === "object" && error && "code" in error && ["P2002", "P2003", "P2025", "P2034"].includes(String(error.code))) throw new ConflictException({ code: "CONFLICT", message: "Business request changed; refresh and retry", details: { reason: "MEMBERSHIP_CONFLICT" } });
   throw error;
  }
 }
 @Get("current") current(@Req() req: Request) { return this.result(async () => ({ workspace: await this.repository.workspace(this.subject(req), this.clock.now()) })); }
 @Post("admission") admit(@Req() req: Request, @Body() body: unknown) { return this.result(() => this.admission.execute({ ...this.subject(req), ...this.parse(BusinessSchemas.AdmitBusinessSchema, body) })); }
 @Post("invitations/redeem") redeem(@Req() req: Request, @Body() body: unknown) { return this.result(() => this.redemption.execute({ ...this.subject(req), ...this.parse(BusinessSchemas.RedeemBusinessInviteSchema, body) })); }
 @Post(":businessId/invitations") invite(@Req() req: Request, @Param("businessId") businessId: string, @Body() body: unknown) { return this.result(() => this.invitation.execute({ ...this.subject(req), businessId, ...this.parse(BusinessSchemas.BusinessInviteSchema, body) })); }
 @Post(":businessId/invitations/revoke") revoke(@Req() req: Request, @Param("businessId") businessId: string, @Body() body: unknown) { return this.result(async () => { await this.revocation.execute({ ...this.subject(req), businessId, ...this.parse(BusinessSchemas.RevokeBusinessInviteSchema, body) }); return { ok: true }; }); }
 @Post(":businessId/members") change(@Req() req: Request, @Param("businessId") businessId: string, @Body() body: unknown) { return this.result(async () => { await this.membership.execute({ ...this.subject(req), businessId, ...this.parse(BusinessSchemas.BusinessMembershipChangeSchema, body) }); return { ok: true }; }); }
 @Post(":businessId/settings") update(@Req() req: Request, @Param("businessId") businessId: string, @Body() body: unknown) { return this.result(async () => { await this.settings.execute({ ...this.subject(req), businessId, ...this.parse(BusinessSchemas.BusinessSettingsSchema, body) }); return { ok: true }; }); }
 @Post(":businessId/recovery") recover(@Req() req: Request, @Param("businessId") businessId: string, @Body() body: unknown) { return this.result(() => this.recovery.execute({ ...this.subject(req), businessId, ...this.parse(BusinessSchemas.RecoverBusinessSchema, body) })); }
}
