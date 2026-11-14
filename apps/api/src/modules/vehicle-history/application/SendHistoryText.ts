import { Inject, Injectable } from "@nestjs/common";
import type { VehicleHistorySchemas } from "@auto-tm/contracts";
import { BUSINESS_MESSAGING_PORT, type BusinessMessagingPort } from "../../business-messaging/business-messaging.public";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { HistoryMessageProjection } from "./HistoryMessageProjection";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { SyncHistoryWaiting } from "./SyncHistoryWaiting";

@Injectable()
export class SendHistoryText {
  constructor(
    @Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(BUSINESS_MESSAGING_PORT) private readonly messages: BusinessMessagingPort,
    @Inject(HistoryMessageProjection) private readonly projection: HistoryMessageProjection,
    @Inject(SyncHistoryWaiting) private readonly sync: SyncHistoryWaiting,
  ) {}
  async execute(actor: HistoryMessageActor, id: string, input: { clientMessageId: string; text: string }): Promise<VehicleHistorySchemas.HistoryMessage> {
    const { message, requesterId } = await this.access.run(actor, id, async (requesterId, senderId, objectId, _participant, waiting) => {
      await this.sync.execute(requesterId, objectId, waiting);
      const message = await this.messages.sendText({ purpose: "vehicle_history", objectId, senderId,
        clientMessageId: input.clientMessageId, text: input.text });
      await this.sync.execute(requesterId, objectId, waiting);
      return { requesterId, message };
    });
    const [result] = await this.projection.many([message], requesterId);
    if (!result) throw new HistoryRequestError("HISTORY_MESSAGE_UNAVAILABLE");
    return result;
  }
}
