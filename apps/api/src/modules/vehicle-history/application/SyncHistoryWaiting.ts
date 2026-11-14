import { Inject, Injectable } from "@nestjs/common";
import { BUSINESS_MESSAGING_PORT, type BusinessMessagingPort } from "../../business-messaging/business-messaging.public";
import type { HistoryWaitingStore } from "../domain/HistoryAssignmentRepository";
import { HistoryWaiting } from "../domain/HistoryWaiting";

@Injectable()
export class SyncHistoryWaiting {
  constructor(
    @Inject(BUSINESS_MESSAGING_PORT) private readonly messages: BusinessMessagingPort,
    @Inject(HistoryWaiting) private readonly policy: HistoryWaiting,
  ) {}

  async execute(requesterId: string, objectId: string, waiting: HistoryWaitingStore) {
    const original = await waiting.read();
    let facts = original;
    const stream = { purpose: "vehicle_history" as const, objectId };
    // One reminder per request: its trusted operation key is the request UUID.
    // Settle older appends before paging; reminder identity must be known first.
    const outcome = await this.messages.findTextOperation({ ...stream, operationKey: objectId });
    if (outcome) facts = this.policy.recordOutcome(facts, {
      messageId: outcome.id, senderId: outcome.senderId, clientMessageId: outcome.clientMessageId,
      text: outcome.text, order: BigInt(outcome.order), sentAt: new Date(outcome.createdAt),
    });
    let cursor = facts.publicMessageId ?? undefined;
    for (;;) {
      // No participant: recovery must not create fetch offers or acknowledge.
      const page = await this.messages.readMessages({ ...stream, ...(cursor ? { cursor } : {}), limit: 50 });
      for (const message of page.items) {
        facts = this.policy.reduceMessage(facts, { id: message.id, order: BigInt(message.order),
          sentAt: new Date(message.createdAt), author: message.senderId === requesterId ? "requester" : "operator",
          reminder: message.id === facts.outcome?.messageId });
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    // Failure anywhere leaves the checkpoint before all unapplied text.
    if (facts !== original) await waiting.save(facts);
    return facts;
  }
}
