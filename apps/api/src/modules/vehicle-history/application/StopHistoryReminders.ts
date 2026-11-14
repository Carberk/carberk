import { Inject, Injectable } from "@nestjs/common";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { SyncHistoryWaiting } from "./SyncHistoryWaiting";
import { ChangeHistoryWaiting } from "./ChangeHistoryWaiting";
import { HistoryReminderProjection } from "./HistoryReminderProjection";

@Injectable()
export class StopHistoryReminders {
  constructor(
    @Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(SyncHistoryWaiting) private readonly sync: SyncHistoryWaiting,
    @Inject(ChangeHistoryWaiting) private readonly lifecycle: ChangeHistoryWaiting,
    @Inject(HistoryReminderProjection) private readonly projection: HistoryReminderProjection,
  ) {}

  execute(actor: HistoryMessageActor, id: string, expectedWaitingVersion: number) {
    if (actor.operator) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    return this.access.run(actor, id, async (requesterId, _senderId, objectId, _participant, waiting) => {
      const facts = await this.sync.execute(requesterId, objectId, waiting);
      // A permanent Stop already achieved its intent, even after later messages.
      if (facts.stopped) return this.projection.one(facts, requesterId, objectId);
      if (facts.version !== expectedWaitingVersion) throw new HistoryRequestError("HISTORY_REMINDER_CONFLICT");
      const changed = await this.lifecycle.whileLocked(actor, requesterId, objectId, waiting, {
        sourceId: "customer-stop", sourceVersion: facts.sourceVersion + 1, expectedVersion: facts.version, action: "stop",
      });
      return this.projection.one(changed.facts, requesterId, objectId);
    });
  }
}
