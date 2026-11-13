import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  IDENTITY_SESSION_REPOSITORY, IDENTITY_READ_PORT, IDENTITY_CHECK_PORT, IDENTITY_CLOCK_PORT,
  type SessionRepository, type IdentityReadPort, type IdentityCheckPort, type ClockPort,
} from "../../identity/identity.public";
import type { Env } from "../../../env.schema";
import { HistoryRequestError } from "../domain/HistoryRequestError";

export interface HistoryRequesterClaims { sub?: string; sid?: string }
@Injectable()
export class CurrentHistoryRequester {
  constructor(
    @Inject(IDENTITY_SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly checks: IdentityCheckPort,
    @Inject(IDENTITY_CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  async require({ sub, sid }: HistoryRequesterClaims): Promise<{ requesterId: string; sessionId: string }> {
    const environment = this.config.get("APP_ENV", { infer: true });
    const testers = this.config.get("VEHICLE_HISTORY_SYNTHETIC_USER_IDS", { infer: true }) ?? "";
    if (this.config.get("VEHICLE_HISTORY_SYNTHETIC_ENABLED", { infer: true }) !== true ||
      !["development", "test"].includes(environment) || typeof sub !== "string" || typeof sid !== "string" ||
      !testers.split(",").some((id) => id.trim() === sub)) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
    const [session, user, deleting] = await Promise.all([
      this.sessions.findById(sid), this.identity.findUserById(sub), this.checks.isDeletionScheduled(sub),
    ]);
    if (!session || session.userId !== sub || session.expiresAt <= this.clock.now() ||
      !user || user.deleted || user.suspendedAt || deleting) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
    return { requesterId: sub, sessionId: sid };
  }
}
