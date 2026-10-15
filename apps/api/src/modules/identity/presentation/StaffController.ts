import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { StaffSchemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import { STAFF_AUTHORITY_PORT, StaffAuthorityDenied, type StaffAuthorityPort } from "../domain/ports/StaffAuthorityPort";
import { ChangeStaffGrant } from "../application/ChangeStaffGrant";
import { staffAuthorityException } from "./staffAuthorityException";
type StaffRequest = FastifyRequest & { user?: { sub?: string; sid?: string } };
@Controller("api/v1/staff")
export class StaffController {
  constructor(@Inject(STAFF_AUTHORITY_PORT) private readonly authority: StaffAuthorityPort,
    @Inject(ChangeStaffGrant) private readonly change: ChangeStaffGrant) {}
  private subject(req: StaffRequest) {
    if (!req.user?.sub || !req.user.sid) throw new StaffAuthorityDenied("SESSION_REQUIRED");
    return { userId: req.user.sub, sessionId: req.user.sid };
  }
  @Get("capabilities")
  async capabilities(@Req() req: StaffRequest) {
    try { return await this.authority.summary(this.subject(req)); } catch (error) { staffAuthorityException(error); }
  }
  @Post("grants")
  @HttpCode(204)
  async grant(@Body() body: unknown, @Req() req: StaffRequest): Promise<void> {
    const parsed = StaffSchemas.StaffGrantChangeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_FAILED", message: "Invalid staff grant change" });
    try { await this.change.execute({ ...this.subject(req), ...parsed.data }); } catch (error) { staffAuthorityException(error); }
  }
}
