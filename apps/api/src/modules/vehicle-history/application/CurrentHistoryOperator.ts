import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { STAFF_ACCESS_PORT, type StaffAccessPort } from "../../identity/identity.public";
import type { Env } from "../../../env.schema";
import type { HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class CurrentHistoryOperator {
  constructor(
    @Inject(STAFF_ACCESS_PORT) private readonly staff: StaffAccessPort,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async require({ sub, sid }: HistoryRequesterClaims) {
    const environment = this.config.get("APP_ENV", { infer: true });
    const testers = this.config.get("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", { infer: true }) ?? "";
    if (this.config.get("VEHICLE_HISTORY_SYNTHETIC_ENABLED", { infer: true }) !== true ||
      !["development", "test"].includes(environment) || typeof sub !== "string" || typeof sid !== "string" ||
      !testers.split(",").some((id) => id.trim() === sub)) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    const actor = await this.staff.findCurrentActor({ userId: sub, sessionId: sid, purpose: "vehicle-history" });
    if (!actor) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    return actor;
  }
}
