import { Inject, Injectable } from "@nestjs/common";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { SyncHistoryWaiting } from "./SyncHistoryWaiting";
import { HistoryReminderProjection } from "./HistoryReminderProjection";

@Injectable()
export class ReadHistoryReminder {
  constructor(
    @Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(SyncHistoryWaiting) private readonly sync: SyncHistoryWaiting,
    @Inject(HistoryReminderProjection) private readonly projection: HistoryReminderProjection,
  ) {}

  execute(actor: HistoryMessageActor, id: string) {
    return this.access.run(actor, id, async (requesterId, _senderId, objectId, _participant, waiting) =>
      this.projection.one(await this.sync.execute(requesterId, objectId, waiting), requesterId, objectId));
  }
}
