import { Inject, Injectable } from "@nestjs/common";
import { BUSINESS_MESSAGING_PORT, type BusinessMessagingPort } from "../../business-messaging/business-messaging.public";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";

@Injectable()
export class ReadHistoryReceipts {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(BUSINESS_MESSAGING_PORT) private readonly messages: BusinessMessagingPort) {}
  execute(actor: HistoryMessageActor, id: string) {
    return this.access.run(actor, id, (_requester, _sender, objectId) => this.messages.readReceipts({ purpose: "vehicle_history", objectId }));
  }
}
