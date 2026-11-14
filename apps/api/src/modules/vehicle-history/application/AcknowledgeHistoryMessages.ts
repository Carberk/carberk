import { Inject, Injectable } from "@nestjs/common";
import { BUSINESS_MESSAGING_PORT, type BusinessMessagingPort } from "../../business-messaging/business-messaging.public";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";

@Injectable()
export class AcknowledgeHistoryMessages {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(BUSINESS_MESSAGING_PORT) private readonly messages: BusinessMessagingPort) {}
  execute(actor: HistoryMessageActor, id: string, input: { cursor: string; kind: "received" | "read" }) {
    return this.access.run(actor, id, (_requester, _sender, objectId, participant) => this.messages.acknowledge({
      purpose: "vehicle_history", objectId, participant, cursor: input.cursor, kind: input.kind,
    }));
  }
}
