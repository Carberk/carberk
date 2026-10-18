import { Inject, Injectable } from "@nestjs/common";

import type { ListingSummary } from "../../listings/domain/ports/ListingsReadPort";
import type { Message } from "../domain/Message";
import {
  CHAT_ATTACHMENT_CLEANER,
  type ChatAttachmentCleaner,
} from "../domain/ports/ChatAttachmentCleaner";

import { createCleanRichMessage, type RichMessageInput } from "./RichMessageFactory";
import { SendConversationMessage } from "./SendConversationMessage";
import type { ConversationActor } from "../domain/ports/BusinessEnquiryRepository";

export type SendMessageInput = RichMessageInput & {
  senderId: string;
  conversationId: string;
  actor?: ConversationActor;
};

export interface SendMessageResult {
  message: Message;
  listing: ListingSummary | null;
}

@Injectable()
export class SendMessage {
  constructor(
    @Inject(SendConversationMessage)
    private readonly sendConversationMessage: SendConversationMessage,
    @Inject(CHAT_ATTACHMENT_CLEANER)
    private readonly attachmentCleaner: ChatAttachmentCleaner,
  ) {}

  async execute(input: SendMessageInput): Promise<SendMessageResult> {
    const result = await this.sendConversationMessage.execute({
      senderId: input.senderId,
      conversationId: input.conversationId,
      ...(input.actor ? { actor: input.actor } : {}),
      clientMessageId: input.clientMessageId,
      createMessage: ({ id, conversationId, senderId, businessId }) =>
        createCleanRichMessage(this.attachmentCleaner, {
          id,
          businessId,
          conversationId,
          senderId,
          input,
        }),
    });

    return { message: result.message, listing: result.listing };
  }
}
