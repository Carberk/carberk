import { Controller, ForbiddenException, Get, Header, Inject, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";
import type { VehicleHistorySchemas } from "@auto-tm/contracts";

import { STAFF_ACCESS_PORT, type StaffAccessPort } from "../../identity/identity.public";
import type { Env } from "../../../env.schema";

@Controller("api/v1/vehicle-history")
export class VehicleHistoryController {
  constructor(
    @Inject(STAFF_ACCESS_PORT) private readonly staff: StaffAccessPort,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  @Get("desk")
  @Header("Cache-Control", "private, no-store")
  async desk(@Req() request: FastifyRequest & { user?: { sub?: string; sid?: string } }): Promise<VehicleHistorySchemas.HistoryDesk> {
    const { sub, sid } = request.user ?? {};
    const locale = request.headers["accept-language"]?.split(/[-,;]/)[0]?.trim();
    const message = locale === "tk" ? "Awtoulag taryhy üçin häzirki işgär rugsady we tassyklanan sessiýa gerek. Gaýtadan giriň ýa-da esaslandyryja ýüz tutuň."
      : locale === "ru" ? "Нужны действующий доступ к истории автомобиля и подтверждённая сессия. Войдите снова или обратитесь к основателю."
      : "Current Vehicle History staff access and a verified session are required. Sign in again or contact the founder.";
    const enabled = this.config.get("VEHICLE_HISTORY_SYNTHETIC_ENABLED", { infer: true });
    const environment = this.config.get("APP_ENV", { infer: true });
    const testers = this.config.get("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", { infer: true }) ?? "";
    // No deployed/live activation path. The explicit local tester list is
    // independent of (and never substitutes for) a current staff grant.
    if (enabled !== true || !["development", "test"].includes(environment) || !sub || !testers.split(",").some((id) => id.trim() === sub)) {
      throw new ForbiddenException({ code: "HISTORY_ACCESS_DENIED", message });
    }
    const actor = sid ? await this.staff.findCurrentActor({ userId: sub, sessionId: sid, purpose: "vehicle-history" }) : null;
    if (!actor) {
      throw new ForbiddenException({ code: "HISTORY_ACCESS_DENIED", message });
    }
    return { purpose: "vehicle-history", mode: "synthetic", actor, requests: [] };
  }
}
