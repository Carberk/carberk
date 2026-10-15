import type { ConversationActor } from "./BusinessEnquiryRepository";
import type { Conversation } from "../Conversation";
import type { Message } from "../Message";

export class MessageAlreadySavedError extends Error {
  constructor(readonly existingMessage: Message) {
    super("A message with this client message ID already exists");
    this.name = "MessageAlreadySavedError";
  }
}

export interface ParticipantState {
  mutedAt: Date | null;
  lastReadAt: Date | null;
  lastDeliveredAt: Date | null;
}

export interface ConversationRepository {
  findById(id: string): Promise<Conversation | null>;
  findByListingAndBuyer(
    listingId: string,
    buyerId: string,
  ): Promise<Conversation | null>;
  save(conversation: Conversation, actor?: ConversationActor): Promise<void>;

  listForUser(
    userId: string,
    query: {
      cursor?: string;
      limit?: number;
    },
  ): Promise<{
    items: Array<{ conversation: Conversation; lastMessage: Message | null }>;
    nextCursor: string | null;
  }>;

  listMessages(
    conversationId: string,
    query: {
      cursor?: string;
      limit?: number;
    },
  ): Promise<{
    items: Message[];
    nextCursor: string | null;
  }>;

  findMessageById(id: string): Promise<Message | null>;
  findMessageByClientMessageId(
    conversationId: string,
    senderId: string,
    clientMessageId: string,
  ): Promise<Message | null>;

  saveMessage(message: Message, actor?: ConversationActor): Promise<void>;

  updateWatermark(
    userId: string,
    conversationId: string,
    data: {
      lastReadAt?: Date;
      lastDeliveredAt?: Date;
    },
  ): Promise<ParticipantState>;

  getParticipantState(
    userId: string,
    conversationId: string,
  ): Promise<ParticipantState | null>;

  getParticipantStatesForConversations(
    conversationIds: string[],
  ): Promise<Map<string, Array<{ userId: string } & ParticipantState>>>;

  muteConversation(
    userId: string,
    conversationId: string,
    muted: boolean,
  ): Promise<ParticipantState>;

  softDeleteMessage(
    messageId: string,
    userId: string,
    deletedAt: Date,
  ): Promise<Message | null>;

  countUnreadMessages(
    userId: string,
    conversationId: string,
  ): Promise<number>;

  /**
   * Unread Messages across every Conversation the User is in, in one query.
   * Counts what `countUnreadMessages` counts for each Conversation, muted ones
   * included, so the total equals the sum of the list's `unreadCount`.
   */
  countAllUnreadMessages(userId: string): Promise<number>;
}

export const CONVERSATION_REPOSITORY = Symbol("ConversationRepository");
