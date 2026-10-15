import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";

import type { Conversation } from "../domain/Conversation";
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from "../domain/ports/ConversationRepository";

import { ConversationAccessPolicy } from "./ConversationAccessPolicy";
import { BusinessEnquiryAccess } from "./BusinessEnquiryAccess";
import type { ConversationActor } from "../domain/ports/BusinessEnquiryRepository";

export interface ValidateConversationAccessInput {
  userId: string;
  conversationId: string;
  actor?: ConversationActor | undefined;
}

@Injectable()
export class ValidateConversationAccess {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    @Inject(ConversationAccessPolicy)
    private readonly accessPolicy: ConversationAccessPolicy,
    @Inject(BusinessEnquiryAccess) @Optional() private readonly businessAccess?: BusinessEnquiryAccess,
  ) {}

  async execute(
    input: ValidateConversationAccessInput,
  ): Promise<Conversation> {
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
      if (!input.actor || !this.businessAccess) throw new NotFoundException({ code: "NOT_FOUND", message: "Conversation not found" });
      await this.businessAccess.authorize(conversation, input.actor, {});
      return conversation;
    }

    await this.accessPolicy.assertParticipantAccess({
      conversation,
      userId: input.userId,
    });

    return conversation;
  }
}
