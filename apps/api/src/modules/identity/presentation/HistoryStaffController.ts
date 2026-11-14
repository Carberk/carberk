import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Inject, Post, Query, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HistoryStaffSchemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import type { Env } from "../../../env.schema";
import { ManageHistoryStaff } from "../application/ManageHistoryStaff";

@Controller("api/v1/identity/history-staff")
export class HistoryStaffController {
  constructor(@Inject(ManageHistoryStaff) private readonly manage: ManageHistoryStaff,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  inspect(@Req() request: FastifyRequest & { user?: { sub?: string; sid?: string } }, @Query() query: unknown) {
    const session = this.session(request);
    const parsed = HistoryStaffSchemas.HistoryStaffLookupSchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_FAILED", message: "Supply an exact target ID" });
    return this.manage.execute(session, parsed.data.targetId);
  }

  @Post()
  @Header("Cache-Control", "private, no-store")
  change(@Req() request: FastifyRequest & { user?: { sub?: string; sid?: string } }, @Body() body: unknown) {
    const session = this.session(request);
    const parsed = HistoryStaffSchemas.HistoryStaffChangeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_FAILED", message: "Supply a target, supported capability and reason" });
    return this.manage.execute(session, parsed.data.targetId, parsed.data);
  }

  private session(request: FastifyRequest & { user?: { sub?: string; sid?: string } }) {
    const { sub, sid } = request.user ?? {};
    const environment = this.config.get("APP_ENV", { infer: true });
    const testers = this.config.get("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", { infer: true }) ?? "";
    if (!sub || !sid || this.config.get("VEHICLE_HISTORY_SYNTHETIC_ENABLED", { infer: true }) !== true ||
      !["development", "test"].includes(environment) || !testers.split(",").some((id) => id.trim() === sub)) {
      throw new ForbiddenException({ code: "HISTORY_ACCESS_DENIED", message: "Current synthetic founder session required" });
    }
    return { userId: sub, sessionId: sid };
  }
}
