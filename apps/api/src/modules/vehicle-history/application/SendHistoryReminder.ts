import { Inject, Injectable } from "@nestjs/common";
import { BUSINESS_MESSAGING_PORT, type BusinessMessagingPort } from "../../business-messaging/business-messaging.public";
import { HistoryWaiting } from "../domain/HistoryWaiting";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { historyReminderText } from "../domain/historyReminderText";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { SyncHistoryWaiting } from "./SyncHistoryWaiting";
import { HistoryReminderProjection } from "./HistoryReminderProjection";
import { CurrentHistoryOperator } from "./CurrentHistoryOperator";

@Injectable()
export class SendHistoryReminder {
  constructor(
    @Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(CurrentHistoryOperator) private readonly operator: CurrentHistoryOperator,
    @Inject(BUSINESS_MESSAGING_PORT) private readonly messages: BusinessMessagingPort,
    @Inject(HistoryWaiting) private readonly policy: HistoryWaiting,
    @Inject(SyncHistoryWaiting) private readonly sync: SyncHistoryWaiting,
    @Inject(HistoryReminderProjection) private readonly projection: HistoryReminderProjection,
  ) {}

  execute(actor: HistoryMessageActor, id: string, input: { clientMessageId: string; expectedWaitingVersion: number }, language?: string) {
    if (!actor.operator) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    return this.access.run(actor, id, async (requesterId, senderId, objectId, _participant, waiting) => {
      const facts = await this.sync.execute(requesterId, objectId, waiting);
      // Settled lookup can wait past an elapsed Session/TOTP deadline.
      await this.operator.require(actor.claims);
      // Current authority is required even for recovery. Original committed intent
      // wins over a changed clock/wait/version or the retry's sender/key/locale.
      if (facts.outcome) return this.projection.one(facts, requesterId, objectId);
      if (facts.version !== input.expectedWaitingVersion || this.policy.ineligible(facts)) {
        throw new HistoryRequestError("HISTORY_REMINDER_CONFLICT");
      }
      await this.messages.sendOnceText({ purpose: "vehicle_history", objectId, operationKey: objectId,
        senderId, clientMessageId: input.clientMessageId, text: historyReminderText(language) });
      return this.projection.one(await this.sync.execute(requesterId, objectId, waiting), requesterId, objectId);
    });
  }
}
