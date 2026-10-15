import { randomUUID } from "node:crypto";

import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { AdminSchemas } from "@auto-tm/contracts";

import type {
  ListingsReadPort,
  ListingSummary,
} from "../../listings/domain/ports/ListingsReadPort";
import { LISTINGS_READ_PORT } from "../../listings/domain/ports/ListingsReadPort";
import {
  IDENTITY_CHECK_PORT,
  IDENTITY_READ_PORT,
  type IdentityCheckPort,
  type IdentityReadPort,
} from "../../identity/identity.public";
import { Conversation } from "../domain/Conversation";
import type { ConversationActor } from "../domain/ports/BusinessEnquiryRepository";
import { CONVERSATION_ERROR_CODES } from "../domain/types";
import {
  missingPeer,
  peerIdOf,
  readConversationPeers,
  type ConversationPeer,
} from "./ConversationPeers";
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from "../domain/ports/ConversationRepository";

export interface OpenConversationInput {
  buyerId: string;
  listingId: string;
  actor?: ConversationActor;
}

export interface OpenConversationResult {
  conversation: Conversation;
  listing: ListingSummary;
  peer: ConversationPeer;
  blockedByMe: boolean;
}

@Injectable()
export class OpenConversation {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    @Inject(LISTINGS_READ_PORT)
    private readonly listings: ListingsReadPort,
    @Inject(IDENTITY_CHECK_PORT)
    private readonly identityCheck: IdentityCheckPort,
    @Inject(IDENTITY_READ_PORT)
    private readonly identityRead: IdentityReadPort,
  ) {}

  async execute(input: OpenConversationInput): Promise<OpenConversationResult> {
    const listing = await this.listings.getListingSummary(input.listingId);

    if (!listing) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Listing not found",
      });
    }

    if (listing.sellerId === input.buyerId) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Cannot contact yourself",
        details: { reason: CONVERSATION_ERROR_CODES.SELF_CONTACT_NOT_ALLOWED },
      });
    }

    const existing = await this.conversations.findByListingAndBuyer(
      input.listingId,
      input.buyerId,
    );

    if (existing) {
      return this.withPeer(existing, listing, input.buyerId);
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

    // Block if either participant is suspended
    const buyerSuspended = await this.identityCheck.isSuspended(input.buyerId);
    if (buyerSuspended) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "User is suspended",
        details: { reason: AdminSchemas.AdminErrorReason.UserSuspended },
      });
    }

    const sellerSuspended = await this.identityCheck.isSuspended(listing.sellerId);
    if (sellerSuspended) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "User is suspended",
        details: { reason: AdminSchemas.AdminErrorReason.UserSuspended },
      });
    }

    // Block new contact if either user has blocked the other
    const blockedBySeller = await this.identityRead.isUserBlockedBy(
      listing.sellerId,
      input.buyerId,
    );
    if (blockedBySeller) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "You are blocked by this user",
        details: { reason: CONVERSATION_ERROR_CODES.BLOCKED_BY_USER },
      });
    }

    const blockedByBuyer = await this.identityRead.isUserBlockedBy(
      input.buyerId,
      listing.sellerId,
    );
    if (blockedByBuyer) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "You have blocked this user",
        details: { reason: CONVERSATION_ERROR_CODES.USER_BLOCKED },
      });
    }

    const conversation = Conversation.create({
      id: randomUUID(),
      listingId: input.listingId,
      buyerId: input.buyerId,
      sellerId: listing.sellerId,
      ...(input.actor?.businessId ? { businessId: input.actor.businessId } : {}),
    });

    await this.conversations.save(conversation, input.actor);

    return this.withPeer(conversation, listing, input.buyerId);
  }

  private async withPeer(
    conversation: Conversation,
    listing: ListingSummary,
    viewerId: string,
  ): Promise<OpenConversationResult> {
    const peers = await readConversationPeers(this.identityRead, viewerId, [
      conversation,
    ]);
    const peerId = peerIdOf(conversation, viewerId);
    const view = peers.get(peerId);
    return {
      conversation,
      listing,
      peer: view?.peer ?? missingPeer(peerId),
      blockedByMe: view?.blockedByMe ?? false,
    };
  }
}
