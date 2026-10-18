import { randomUUID } from "node:crypto";

import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";

import type { ListingSummary, ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import { LISTINGS_READ_PORT } from "../../listings/domain/ports/ListingsReadPort";
import type { Message } from "../domain/Message";
import { ConversationDomainError } from "../domain/types";
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from "../domain/ports/ConversationRepository";

import { ConversationMessageCommitter } from "./ConversationMessageCommitter";
import { ConversationSendPolicy } from "./ConversationSendPolicy";
import { BusinessEnquiryAccess } from "./BusinessEnquiryAccess";
import type { ConversationActor } from "../domain/ports/BusinessEnquiryRepository";

export interface SendConversationMessageInput {
  senderId: string;
  conversationId: string;
  clientMessageId?: string | undefined;
  actor?: ConversationActor;
  createMessage: (data: {
    id: string;
    conversationId: string;
    senderId: string;
    clientMessageId?: string | undefined;
  }) => Message | Promise<Message>;
}

export interface SendConversationMessageResult {
  message: Message;
  listing: ListingSummary | null;
  created: boolean;
}

@Injectable()
export class SendConversationMessage {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    @Inject(ConversationSendPolicy)
    private readonly sendPolicy: ConversationSendPolicy,
    @Inject(ConversationMessageCommitter)
    private readonly committer: ConversationMessageCommitter,
    @Inject(BusinessEnquiryAccess) @Optional() private readonly businessAccess?: BusinessEnquiryAccess,
    @Inject(LISTINGS_READ_PORT) @Optional() private readonly listings?: ListingsReadPort,
  ) {}

  async execute(
    input: SendConversationMessageInput,
  ): Promise<SendConversationMessageResult> {
    if (input.actor && input.actor.userId !== input.senderId) throw new ForbiddenException({ code: "FORBIDDEN", details: { reason: "ACTOR_MISMATCH" } });
    const conversation = await this.conversations.findById(input.conversationId);
    if (!conversation) throw new NotFoundException("Conversation not found");
    if (conversation.businessId) {
      if (!this.businessAccess || !this.listings || !input.actor) throw new BadRequestException("Business context required");
      const recipientId = await this.businessAccess.authorize(conversation, input.actor, { send: true });
      const authorized = await this.sendPolicy.authorizeBusiness(conversation, input.senderId, recipientId);
      return this.executeAuthorized(input, authorized);
    }
    const authorized = await this.sendPolicy.authorize(input.conversationId, input.senderId);
    return this.executeAuthorized(input, authorized);
  }

  private async executeAuthorized(input: SendConversationMessageInput, authorized: { recipientId: string; listing: ListingSummary }) {
    if (input.clientMessageId) {
      const existing = await this.conversations.findMessageByClientMessageId(
        input.conversationId,
        input.senderId,
        input.clientMessageId,
      );
      if (existing) {
        return { message: existing, listing: authorized.listing, created: false };
      }
    }

    const message = await this.createMessage(input);
    const committed = await this.committer.commit(
      message,
      authorized.recipientId,
      input.actor,
    );
    return { ...committed, listing: authorized.listing };
  }

  private async createMessage(input: SendConversationMessageInput) {
    try {
      return await input.createMessage({
        id: randomUUID(),
        conversationId: input.conversationId,
        senderId: input.senderId,
        clientMessageId: input.clientMessageId,
      });
    } catch (error) {
      if (error instanceof ConversationDomainError) {
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: error.message,
          details: { reason: error.code },
        });
      }
      throw error;
    }
  }
}
