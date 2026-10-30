import { Inject, Injectable, Optional } from "@nestjs/common";

import type {
  ListingsReadPort,
  ListingSummary,
} from "../../listings/domain/ports/ListingsReadPort";
import { LISTINGS_READ_PORT } from "../../listings/domain/ports/ListingsReadPort";
import {
  IDENTITY_READ_PORT,
  type IdentityReadPort,
} from "../../identity/identity.public";
import type { Message } from "../domain/Message";
import type { Conversation } from "../domain/Conversation";
import { BUSINESS_ENQUIRY_REPOSITORY, type BusinessEnquiryRepository } from "../domain/ports/BusinessEnquiryRepository";
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from "../domain/ports/ConversationRepository";
import {
  missingPeer,
  toBusinessPeer,
  peerIdOf,
  readConversationPeers,
  type ConversationPeer,
} from "./ConversationPeers";

export interface ListMyConversationsInput {
  userId: string;
  cursor?: string;
  limit?: number;
}

export interface ListMyConversationsResult {
  items: Array<{
    conversation: Conversation;
    listing: ListingSummary | null;
    lastMessage: Message | null;
    unreadCount: number;
    peerLastReadAt: Date | null;
    peerLastDeliveredAt: Date | null;
    mutedAt: Date | null;
    peer: ConversationPeer;
    blockedByMe: boolean;
  }>;
  nextCursor: string | null;
}

@Injectable()
export class ListMyConversations {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    @Inject(LISTINGS_READ_PORT)
    private readonly listings: ListingsReadPort,
    @Inject(IDENTITY_READ_PORT)
    private readonly identityRead: IdentityReadPort,
    @Inject(BUSINESS_ENQUIRY_REPOSITORY) @Optional() private readonly businesses?: BusinessEnquiryRepository,
  ) {}

  async execute(
    input: ListMyConversationsInput,
  ): Promise<ListMyConversationsResult> {
    const limit = input.limit ?? 20;
    const { items, nextCursor } = await this.conversations.listForUser(
      input.userId,
      { ...(input.cursor ? { cursor: input.cursor } : {}), limit },
    );

    const listingIds = items.map((item) => item.conversation.listingId);
    const listingSummaries =
      listingIds.length > 0
        ? await this.listings.getListingSummaries(listingIds)
        : [];
    const listingMap = new Map(listingSummaries.map((l) => [l.id, l]));

    const conversationIds = items.map((item) => item.conversation.id);
    const participantStates =
      await this.conversations.getParticipantStatesForConversations(
        conversationIds,
      );

    const peers = await readConversationPeers(
      this.identityRead,
      input.userId,
      items.map((item) => item.conversation),
    );

    const businessIds = [...new Set(items.map(item => item.conversation.businessId).filter((id): id is string => !!id))];
    const businessNames = new Map(await Promise.all(businessIds.map(async id => [id, await this.businesses?.businessName(id)] as const)));
    const enriched = await Promise.all(
      items.map(async (item) => {
        const unreadCount = await this.conversations.countUnreadMessages(
          input.userId,
          item.conversation.id,
        );
        const states = participantStates.get(item.conversation.id) ?? [];
        const peerState = states.find(
          (state) => state.userId !== input.userId,
        );
        const ownState = states.find(
          (state) => state.userId === input.userId,
        );
        const peerId = peerIdOf(item.conversation, input.userId);
        const peerView = peers.get(peerId);
        const businessId = item.conversation.businessId;
        const businessName = businessId ? businessNames.get(businessId) : null;
        const businessPeer = businessId && businessName && item.conversation.buyerId === input.userId ? toBusinessPeer(businessId, businessName) : null;
        return {
          conversation: item.conversation,
          listing: listingMap.get(item.conversation.listingId) ?? null,
          lastMessage: item.lastMessage,
          unreadCount,
          peerLastReadAt: peerState?.lastReadAt ?? null,
          peerLastDeliveredAt: peerState?.lastDeliveredAt ?? null,
          mutedAt: ownState?.mutedAt ?? null,
          peer: businessPeer ?? peerView?.peer ?? missingPeer(peerId),
          blockedByMe: businessPeer ? false : peerView?.blockedByMe ?? false,
        };
      }),
    );

    return {
      items: enriched,
      nextCursor,
    };
  }
}
