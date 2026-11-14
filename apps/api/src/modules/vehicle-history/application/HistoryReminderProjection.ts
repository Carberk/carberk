import { Inject, Injectable } from "@nestjs/common";
import type { VehicleHistorySchemas } from "@auto-tm/contracts";
import { HistoryWaiting, type HistoryWaitingFacts } from "../domain/HistoryWaiting";
import { HistoryMessageProjection } from "./HistoryMessageProjection";

@Injectable()
export class HistoryReminderProjection {
  constructor(@Inject(HistoryWaiting) private readonly policy: HistoryWaiting,
    @Inject(HistoryMessageProjection) private readonly messages: HistoryMessageProjection) {}

  async one(facts: HistoryWaitingFacts, requesterId: string, objectId: string): Promise<VehicleHistorySchemas.HistoryReminder> {
    const original = facts.outcome;
    const [outcome] = original ? await this.messages.many([{
      purpose: "vehicle_history", objectId, id: original.messageId, senderId: original.senderId,
      clientMessageId: original.clientMessageId, kind: "TEXT", text: original.text,
      order: original.order.toString(), createdAt: original.sentAt.toISOString(),
    }], requesterId) : [];
    const ineligibleReason = this.policy.ineligible(facts);
    return { reason: facts.reason, since: facts.since?.toISOString() ?? null, version: facts.version,
      eligibleAt: facts.since ? new Date(facts.since.getTime() + 86_400_000).toISOString() : null,
      eligible: ineligibleReason === null, ineligibleReason,
      declined: facts.declined, stopped: facts.stopped, used: facts.used, outcome: outcome ?? null };
  }
}
