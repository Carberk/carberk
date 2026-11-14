import { Inject, Injectable } from "@nestjs/common";
import { BUSINESS_MESSAGING_PORT, type BusinessMessagingPort } from "../../business-messaging/business-messaging.public";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { HistoryMessageProjection } from "./HistoryMessageProjection";

@Injectable()
export class ReadHistoryMessages {
  constructor(
    @Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(BUSINESS_MESSAGING_PORT) private readonly messages: BusinessMessagingPort,
    @Inject(HistoryMessageProjection) private readonly projection: HistoryMessageProjection,
  ) {}
  async execute(actor: HistoryMessageActor, id: string, query: { cursor?: string | undefined; limit: number }) {
    const { page, requesterId } = await this.access.run(actor, id, async (requesterId, _senderId, objectId, participant) => ({
      requesterId, page: await this.messages.readMessages({ purpose: "vehicle_history", objectId,
        ...(query.cursor ? { cursor: query.cursor } : {}), limit: query.limit, participant }),
    }));
    return { items: await this.projection.many(page.items, requesterId), nextCursor: page.nextCursor };
  }
}
