import { Inject, Injectable, Optional } from "@nestjs/common";

import type { Message } from "../domain/Message";
import type { BusinessEnquiryRepository, ConversationActor } from "../domain/ports/BusinessEnquiryRepository";
import { BUSINESS_ENQUIRY_REPOSITORY } from "../domain/ports/BusinessEnquiryRepository";
import {
  CONVERSATION_REPOSITORY,
  MessageAlreadySavedError,
  type ConversationRepository,
} from "../domain/ports/ConversationRepository";
import type { MessageEventPublisher } from "../domain/ports/MessageEventPublisher";
import { MESSAGE_EVENT_PUBLISHER } from "../domain/ports/MessageEventPublisher";

@Injectable()
export class ConversationMessageCommitter {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    @Inject(MESSAGE_EVENT_PUBLISHER)
    private readonly messageEvents: MessageEventPublisher,
    @Inject(BUSINESS_ENQUIRY_REPOSITORY) @Optional()
    private readonly businessEnquiries?: BusinessEnquiryRepository,
  ) {}

  async commit(
    message: Message,
    recipientId: string,
    actor?: ConversationActor,
  ): Promise<{ message: Message; created: boolean }> {
    try {
      await this.conversations.saveMessage(message, actor);
    } catch (error) {
      if (error instanceof MessageAlreadySavedError) {
        return { message: error.existingMessage, created: false };
      }
      throw error;
    }

    const persisted = this.businessEnquiries ? await this.conversations.findById(message.conversationId) : null;
    const recipients = persisted?.businessId && this.businessEnquiries
      ? await this.businessEnquiries.recipients(message.conversationId, message.senderId)
      : [recipientId];
    const targets = persisted?.businessId && !recipients.length ? [message.senderId] : recipients;
    for (const [index, targetId] of targets.entries()) {
      await this.messageEvents.emitMessageSent({
        event: "MessageSent",
        ...(persisted?.businessId ? { businessId: persisted.businessId, echoSender: index === 0 } : {}),
        conversationId: message.conversationId,
        messageId: message.id,
        senderId: message.senderId,
        recipientId: targetId,
        sentAt: message.createdAt.toISOString(),
        messageKind: message.kind,
        messageBody: message.body,
        messageMetadata: message.metadata,
        messageDeletedAt: message.deletedAt?.toISOString() ?? null,
        clientMessageId: message.clientMessageId,
      });
    }
    return { message, created: true };
  }
}
