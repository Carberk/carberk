import { Inject, Injectable } from "@nestjs/common";
import type { VehicleHistorySchemas } from "@auto-tm/contracts";
import { BUSINESS_MESSAGING_PORT, type BusinessMessagingPort } from "../../business-messaging/business-messaging.public";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { HistoryMessageProjection } from "./HistoryMessageProjection";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class SendHistoryText {
  constructor(
    @Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(BUSINESS_MESSAGING_PORT) private readonly messages: BusinessMessagingPort,
    @Inject(HistoryMessageProjection) private readonly projection: HistoryMessageProjection,
  ) {}
  async execute(actor: HistoryMessageActor, id: string, input: { clientMessageId: string; text: string }): Promise<VehicleHistorySchemas.HistoryMessage> {
    const { message, requesterId } = await this.access.run(actor, id, async (requesterId, senderId, objectId) => ({
      requesterId, message: await this.messages.sendText({ purpose: "vehicle_history", objectId, senderId,
        clientMessageId: input.clientMessageId, text: input.text }),
    }));
    const [result] = await this.projection.many([message], requesterId);
    if (!result) throw new HistoryRequestError("HISTORY_MESSAGE_UNAVAILABLE");
    return result;
  }
}
