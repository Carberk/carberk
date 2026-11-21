import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { STAFF_ACCESS_PORT, type StaffAccessPort, type StaffPurpose } from "../../identity/identity.public";
import type { Env } from "../../../env.schema";
import type { HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class CurrentHistoryOperator {
  constructor(
    @Inject(STAFF_ACCESS_PORT) private readonly staff: StaffAccessPort,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async require({ sub, sid }: HistoryRequesterClaims, purpose: StaffPurpose = "vehicle-history") {
    const environment = this.config.get("APP_ENV", { infer: true });
    const testers = this.config.get("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", { infer: true }) ?? "";
    if (this.config.get("VEHICLE_HISTORY_SYNTHETIC_ENABLED", { infer: true }) !== true ||
      !["development", "test"].includes(environment) || typeof sub !== "string" || typeof sid !== "string" ||
      !testers.split(",").some((id) => id.trim() === sub)) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    const actor = await this.staff.findCurrentActor({ userId: sub, sessionId: sid, purpose });
    if (!actor) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    return actor;
  }

  async requireAssignable(userId: string) {
    const environment = this.config.get("APP_ENV", { infer: true });
    const testers = this.config.get("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", { infer: true }) ?? "";
    if (this.config.get("VEHICLE_HISTORY_SYNTHETIC_ENABLED", { infer: true }) !== true ||
      !["development", "test"].includes(environment) ||
      !testers.split(",").some((id) => id.trim() === userId)) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    const actor = await this.staff.findAssignableActor({ userId, purpose: "vehicle-history" });
    if (!actor) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    return actor;
  }

  async listAssignable(claims: HistoryRequesterClaims) {
    const actor = await this.require(claims);
    const testers = this.config.get("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", { infer: true }) ?? "";
    const ids = [...new Set(testers.split(",").map((id) => id.trim()).filter((id) => id && id !== actor.id))];
    const candidates = await Promise.all(ids.map((userId) => this.staff.findAssignableActor({ userId, purpose: "vehicle-history" })));
    await this.require(claims);
    return { items: candidates.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((a, b) => a.nameNumber - b.nameNumber || a.id.localeCompare(b.id)) };
  }
}
