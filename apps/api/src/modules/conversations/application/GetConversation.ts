import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";

import type {
  ListingsReadPort,
  ListingSummary,
} from "../../listings/domain/ports/ListingsReadPort";
import { LISTINGS_READ_PORT } from "../../listings/domain/ports/ListingsReadPort";
import {
  IDENTITY_READ_PORT,
  type IdentityReadPort,
} from "../../identity/identity.public";
import type { Conversation } from "../domain/Conversation";
import type { Message } from "../domain/Message";
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from "../domain/ports/ConversationRepository";

import { ConversationAccessPolicy } from "./ConversationAccessPolicy";
import { BusinessEnquiryAccess } from "./BusinessEnquiryAccess";
import type { ConversationActor } from "../domain/ports/BusinessEnquiryRepository";
import { toConversationPeer, type ConversationPeer } from "./ConversationPeers";
import {
  ConversationSendPolicy,
  type SendRestriction,
} from "./ConversationSendPolicy";

export interface GetConversationInput {
  userId: string;
  conversationId: string;
  actor?: ConversationActor | undefined;
}

/** A list item plus whether the viewer's next Message would be accepted. */
export interface GetConversationResult {
  conversation: Conversation;
  listing: ListingSummary | null;
  lastMessage: Message | null;
  unreadCount: number;
  peerLastReadAt: Date | null;
  peerLastDeliveredAt: Date | null;
  mutedAt: Date | null;
  peer: ConversationPeer;
  blockedByMe: boolean;
  sendRestriction: SendRestriction | null;
}

@Injectable()
export class GetConversation {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    @Inject(LISTINGS_READ_PORT)
    private readonly listings: ListingsReadPort,
    @Inject(IDENTITY_READ_PORT)
    private readonly identityRead: IdentityReadPort,
    @Inject(ConversationAccessPolicy)
    private readonly accessPolicy: ConversationAccessPolicy,
    @Inject(ConversationSendPolicy)
    private readonly sendPolicy: ConversationSendPolicy,
    @Inject(BusinessEnquiryAccess) @Optional() private readonly businessAccess?: BusinessEnquiryAccess,
  ) {}

  async execute(input: GetConversationInput): Promise<GetConversationResult> {
    const conversation = await this.conversations.findById(
      input.conversationId,
    );
    if (!conversation) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Conversation not found",
      });
    }
    let peerId: string;
    if (conversation.businessId) {
      if (!input.actor || !this.businessAccess) throw new NotFoundException({ code: "NOT_FOUND", message: "Conversation not found" });
      await this.businessAccess.authorize(conversation, input.actor, {});
      peerId = conversation.buyerId;
    } else {
      peerId = this.accessPolicy.assertParticipant(conversation, input.userId);
    }

    // History stays readable in every restricted case, so a refused send
    // never refuses the read: the restriction is reported, not thrown.
    const listing = await this.listings.getListingSummary(
      conversation.listingId,
    );
    const [peerUsers, states, unreadCount, lastMessage, sendRestriction] =
      await Promise.all([
        this.identityRead.findUsersByIds([peerId]),
        this.conversations.getParticipantStatesForConversations([
          conversation.id,
        ]),
        this.conversations.countUnreadMessages(input.userId, conversation.id),
        this.conversations
          .listMessages(conversation.id, { limit: 1 })
          .then(({ items }) => items[0] ?? null),
        this.sendPolicy.restrictionFor(conversation, input.userId, listing),
      ]);

    const participantStates = states.get(conversation.id) ?? [];
    const peerState = participantStates.find((s) => s.userId !== input.userId);
    const ownState = participantStates.find((s) => s.userId === input.userId);
    const peerUser = peerUsers.find((u) => u.id === peerId);

    return {
      conversation,
      listing,
      lastMessage,
      unreadCount,
      peerLastReadAt: peerState?.lastReadAt ?? null,
      peerLastDeliveredAt: peerState?.lastDeliveredAt ?? null,
      mutedAt: ownState?.mutedAt ?? null,
      peer: toConversationPeer(peerId, peerUser),
      // The viewer's block is read once, inside the restriction, and
      // `blocked_by_me` outranks every other restriction. Deriving the flag
      // from it keeps both fields from one read, so a concurrent block or
      // unblock cannot make them disagree.
      blockedByMe: sendRestriction === "blocked_by_me",
      sendRestriction,
    };
  }
}
