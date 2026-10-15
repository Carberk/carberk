import {
  Inject,
  Injectable,
  Optional,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";

import type { Message } from "../domain/Message";
import {
  CONVERSATION_ERROR_CODES,
} from "../domain/types";
import type { ConversationActor } from "../domain/ports/BusinessEnquiryRepository";
import { BusinessEnquiryAccess } from "./BusinessEnquiryAccess";
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from "../domain/ports/ConversationRepository";

export interface ListMessagesInput {
  userId: string;
  conversationId: string;
  cursor?: string;
  limit?: number;
  actor?: ConversationActor;
}

export interface ListMessagesResult {
  items: Message[];
  nextCursor: string | null;
}

@Injectable()
export class ListMessages {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    @Inject(BusinessEnquiryAccess) @Optional() private readonly businessAccess?: BusinessEnquiryAccess,
  ) {}

  async execute(input: ListMessagesInput): Promise<ListMessagesResult> {
    const conversation = await this.conversations.findById(
      input.conversationId,
    );

    if (!conversation) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Conversation not found",
      });
    }

    if (conversation.businessId) {
      if (!input.actor || !this.businessAccess) throw new ForbiddenException({ code: "FORBIDDEN", message: "Business context required" });
      await this.businessAccess.authorize(conversation, input.actor, {});
    } else if (!conversation.isParticipant(input.userId)) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "You are not a participant in this conversation",
        details: { reason: CONVERSATION_ERROR_CODES.NOT_A_PARTICIPANT },
      });
    }

    const limit = input.limit ?? 20;
    const { items, nextCursor } = await this.conversations.listMessages(
      input.conversationId,
      { ...(input.cursor ? { cursor: input.cursor } : {}), limit },
    );

    return { items, nextCursor };
  }
}
