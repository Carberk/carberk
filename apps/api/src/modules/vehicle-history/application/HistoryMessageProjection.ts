import { Inject, Injectable } from "@nestjs/common";
import type { VehicleHistorySchemas } from "@auto-tm/contracts";
import { IDENTITY_READ_PORT, type IdentityReadPort } from "../../identity/identity.public";
import type { ServiceMessage } from "../../business-messaging/business-messaging.public";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class HistoryMessageProjection {
  constructor(@Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort) {}
  async many(messages: ServiceMessage[], requesterId: string): Promise<VehicleHistorySchemas.HistoryMessage[]> {
    if (!messages.length) return [];
    const users = await this.identity.findUsersByIds([...new Set(messages.map((message) => message.senderId))]);
    const authors = new Map(users.map((user) => [user.id, user]));
    return messages.map(({ purpose: _purpose, objectId: _objectId, senderId, ...message }) => {
      const user = authors.get(senderId);
      if (!user) throw new HistoryRequestError("HISTORY_MESSAGE_UNAVAILABLE");
      return { ...message, author: { id: user.id, displayName: user.deleted ? null : user.displayName,
        nameNumber: user.nameNumber, kind: senderId === requesterId ? "requester" : "operator" } };
    });
  }
}
