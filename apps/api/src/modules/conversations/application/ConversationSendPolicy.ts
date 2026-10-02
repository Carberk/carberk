import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import type { ListingSummary, ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import { LISTINGS_READ_PORT } from "../../listings/domain/ports/ListingsReadPort";
import type { Conversation } from "../domain/Conversation";
import { CONVERSATION_ERROR_CODES } from "../domain/types";
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from "../domain/ports/ConversationRepository";

import { ConversationAccessPolicy } from "./ConversationAccessPolicy";

export interface AuthorizedConversationSend {
  conversation: Conversation;
  listing: ListingSummary;
  recipientId: string;
}

@Injectable()
export class ConversationSendPolicy {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    @Inject(LISTINGS_READ_PORT)
    private readonly listings: ListingsReadPort,
    @Inject(ConversationAccessPolicy)
    private readonly accessPolicy: ConversationAccessPolicy,
  ) {}

  async authorize(
    conversationId: string,
    senderId: string,
  ): Promise<AuthorizedConversationSend> {
    const conversation = await this.conversations.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Conversation not found",
      });
    }

    const recipientId = this.accessPolicy.assertParticipant(
      conversation,
      senderId,
    );
    await this.accessPolicy.assertAccountNotPendingDeletion(senderId);
    const listing = await this.loadContactableListing(conversation.listingId);
    await this.accessPolicy.assertParticipantSafety({
      userId: senderId,
      otherParticipantId: recipientId,
      otherParticipantSuspendedMessage: "User is suspended",
    });

    return { conversation, listing, recipientId };
  }

  private async loadContactableListing(
    listingId: string,
  ): Promise<ListingSummary> {
    const listing = await this.listings.getListingSummary(listingId);
    if (!listing) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Listing is no longer available for contact",
        details: { reason: CONVERSATION_ERROR_CODES.LISTING_NOT_CONTACTABLE },
      });
    }
    if (listing.status !== "active") {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Listing is not available for contact",
        details: { reason: CONVERSATION_ERROR_CODES.LISTING_NOT_CONTACTABLE },
      });
    }
    if (!listing.allowChat) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Chat is disabled for this listing",
        details: { reason: CONVERSATION_ERROR_CODES.CHAT_DISABLED },
      });
    }
    return listing;
  }
}
