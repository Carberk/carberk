import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";

import { Conversation } from "../domain/Conversation";
import { Message } from "../domain/Message";
import { CONVERSATION_ERROR_CODES } from "../domain/types";
import type { ConversationRepository } from "../domain/ports/ConversationRepository";
import type { ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import type { IdentityCheckPort, IdentityReadPort } from "../../identity/identity.public";
import type { MessageEventPublisher, MessageSentEvent } from "../domain/ports/MessageEventPublisher";

import { SendMessage } from "./SendMessage";
import { ConversationAccessPolicy } from "./ConversationAccessPolicy";
import { ConversationMessageCommitter } from "./ConversationMessageCommitter";
import { ConversationSendPolicy } from "./ConversationSendPolicy";
import { SendConversationMessage } from "./SendConversationMessage";

class FakeConversationRepository implements ConversationRepository {
  conversations: Conversation[] = [];
  messages: Message[] = [];

  async findById(id: string): Promise<Conversation | null> {
    return this.conversations.find((c) => c.id === id) ?? null;
  }

  async findByListingAndBuyer(): Promise<Conversation | null> {
    return null;
  }

  async save(conversation: Conversation): Promise<void> {
    this.conversations.push(conversation);
  }

  async listForUser(): Promise<{
    items: Array<{ conversation: Conversation; lastMessage: Message | null }>;
    nextCursor: string | null;
  }> {
    return { items: [], nextCursor: null };
  }

  async listMessages(): Promise<{
    items: Message[];
    nextCursor: string | null;
  }> {
    return { items: [], nextCursor: null };
  }

  async findMessageById(id: string): Promise<Message | null> {
    return this.messages.find((m) => m.id === id) ?? null;
  }

  async findMessageByClientMessageId(
    conversationId: string,
    senderId: string,
    clientMessageId: string,
  ): Promise<Message | null> {
    return (
      this.messages.find(
        (m) =>
          m.conversationId === conversationId &&
          m.senderId === senderId &&
          m.clientMessageId === clientMessageId,
      ) ?? null
    );
  }

  async saveMessage(message: Message): Promise<void> {
    this.messages.push(message);
  }

  async updateWatermark(): Promise<{
    mutedAt: Date | null;
    lastReadAt: Date | null;
    lastDeliveredAt: Date | null;
  }> {
    return { mutedAt: null, lastReadAt: null, lastDeliveredAt: null };
  }

  async getParticipantState(): Promise<{
    mutedAt: Date | null;
    lastReadAt: Date | null;
    lastDeliveredAt: Date | null;
  } | null> {
    return { mutedAt: null, lastReadAt: null, lastDeliveredAt: null };
  }

  async muteConversation(): Promise<{
    mutedAt: Date | null;
    lastReadAt: Date | null;
    lastDeliveredAt: Date | null;
  }> {
    return { mutedAt: null, lastReadAt: null, lastDeliveredAt: null };
  }

  async softDeleteMessage(): Promise<Message | null> {
    return null;
  }

  async getParticipantStatesForConversations(
    _conversationIds: string[],
  ): Promise<
    Map<string, Array<{ userId: string; mutedAt: Date | null; lastReadAt: Date | null; lastDeliveredAt: Date | null }>>
  > {
    return new Map();
  }

  async countUnreadMessages(): Promise<number> {
    return 0;
  }
}

class FakeListingsReadPort implements ListingsReadPort {
  listings: Array<{
    id: string;
    sellerId: string;
    status: "active" | "sold" | "archived" | "banned";
    brandId: string;
    modelId: string;
    year?: number;
    priceAmount: number;
    priceCurrency: "TMT" | "USD" | "AED";
    displayPriceTmt: number;
    coverMediaKey?: string;
    cityId: string;
    publishedAt: Date;
    allowChat: boolean;
  }> = [];

  async getListingSummary(id: string) {
    const listing = this.listings.find((l) => l.id === id);
    if (!listing) return null;
    if (listing.status === "banned") return null;
    return listing;
  }

  async getListingSummaries(ids: string[]) {
    return this.listings.filter((l) => ids.includes(l.id));
  }

  async getListingAdminSummaries(): Promise<[]> {
    return [];
  }

  async getListingsForOwner() {
    return { items: [] };
  }
}

class FakeIdentityCheckPort implements IdentityCheckPort {
  suspendedUsers = new Set<string>();

  async isAdmin(): Promise<boolean> {
    return false;
  }

  async isInDealership(): Promise<boolean> {
    return false;
  }

  async isSuspended(userId: string): Promise<boolean> {
    return this.suspendedUsers.has(userId);
  }

  suspend(userId: string) {
    this.suspendedUsers.add(userId);
  }
}

class FakeIdentityReadPort implements IdentityReadPort {
  blockedPairs = new Set<string>();

  async findUserById(): Promise<null> {
    return null;
  }

  async findUsersByIds(): Promise<[]> {
    return [];
  }

  async findBlockedUserIds(): Promise<string[]> {
    return [];
  }

  async isUserBlockedBy(blockerId: string, blockedId: string): Promise<boolean> {
    return this.blockedPairs.has(`${blockerId}:${blockedId}`);
  }

  block(blockerId: string, blockedId: string) {
    this.blockedPairs.add(`${blockerId}:${blockedId}`);
  }
}

class FakeMessageEventPublisher implements MessageEventPublisher {
  events: MessageSentEvent[] = [];

  async emitMessageSent(event: MessageSentEvent): Promise<void> {
    this.events.push(event);
  }
}

function makeUseCase(
  repo?: FakeConversationRepository,
  listings?: FakeListingsReadPort,
  identityCheck?: FakeIdentityCheckPort,
  identityRead?: FakeIdentityReadPort,
  messageEvents?: FakeMessageEventPublisher,
) {
  const effectiveIdentityCheck = identityCheck ?? new FakeIdentityCheckPort();
  const effectiveIdentityRead = identityRead ?? new FakeIdentityReadPort();
  const effectiveRepo = repo ?? new FakeConversationRepository();
  const effectiveListings = listings ?? new FakeListingsReadPort();
  const effectiveEvents = messageEvents ?? new FakeMessageEventPublisher();
  const accessPolicy = new ConversationAccessPolicy(
    effectiveIdentityCheck,
    effectiveIdentityRead,
  );
  const workflow = new SendConversationMessage(
    effectiveRepo,
    new ConversationSendPolicy(
      effectiveRepo,
      effectiveListings,
      accessPolicy,
    ),
    new ConversationMessageCommitter(effectiveRepo, effectiveEvents),
  );
  return new SendMessage(workflow);
}

function seedConversation(
  repo: FakeConversationRepository,
  overrides?: Partial<Conversation>,
) {
  const c = Conversation.create({
    id: "conv-1",
    listingId: "listing-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    ...overrides,
  });
  repo.conversations.push(c);
  return c;
}

function seedListing(
  listings: FakeListingsReadPort,
  overrides?: Partial<FakeListingsReadPort["listings"][number]>,
) {
  const listing = {
    id: "listing-1",
    sellerId: "seller-1",
    status: "active" as const,
    brandId: "brand-1",
    modelId: "model-1",
    year: 2020,
    priceAmount: 100000,
    priceCurrency: "TMT" as const,
    displayPriceTmt: 100000,
    coverMediaKey: "cover.jpg",
    cityId: "city-1",
    publishedAt: new Date("2026-05-01T00:00:00Z"),
    allowChat: true,
    ...overrides,
  };
  listings.listings.push(listing);
  return listing;
}

describe("SendMessage", () => {
  let repo: FakeConversationRepository;
  let listings: FakeListingsReadPort;

  beforeEach(() => {
    repo = new FakeConversationRepository();
    listings = new FakeListingsReadPort();
  });

  it("sends a text message with clientMessageId", async () => {
    seedConversation(repo);
    seedListing(listings);
    const uc = makeUseCase(repo, listings);

    const result = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      kind: "text",
      text: "Hello",
      clientMessageId: "client-1",
    });

    expect(result.message.kind).toBe("text");
    expect(result.message.body).toBe("Hello");
    expect(result.message.clientMessageId).toBe("client-1");
    expect(repo.messages).toHaveLength(1);
  });

  it("emits MessageSent after saving", async () => {
    seedConversation(repo);
    seedListing(listings);
    const events = new FakeMessageEventPublisher();
    const uc = makeUseCase(repo, listings, undefined, undefined, events);

    const result = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      kind: "text",
      text: "Hello",
      clientMessageId: "client-1",
    });

    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      event: "MessageSent",
      conversationId: "conv-1",
      messageId: result.message.id,
      senderId: "buyer-1",
      recipientId: "seller-1",
      clientMessageId: "client-1",
    });
  });

  it("sends an image message", async () => {
    seedConversation(repo);
    seedListing(listings);
    const uc = makeUseCase(repo, listings);

    const result = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      kind: "image",
      metadata: { key: "chat/image.jpg", width: 800, height: 600 },
    });

    expect(result.message.kind).toBe("image");
    expect(result.message.metadata).toEqual({
      key: "chat/image.jpg",
      width: 800,
      height: 600,
    });
  });

  it("returns existing message for duplicate clientMessageId", async () => {
    seedConversation(repo);
    seedListing(listings);
    const events = new FakeMessageEventPublisher();
    const uc = makeUseCase(repo, listings, undefined, undefined, events);

    const first = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      kind: "text",
      text: "First",
      clientMessageId: "client-1",
    });

    const second = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      kind: "text",
      text: "Second",
      clientMessageId: "client-1",
    });

    expect(second.message.id).toBe(first.message.id);
    expect(repo.messages).toHaveLength(1);
    expect(events.events).toHaveLength(1);
  });

  it("returns existing duplicate text message before validating replacement text", async () => {
    seedConversation(repo);
    seedListing(listings);
    const uc = makeUseCase(repo, listings);

    const first = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      kind: "text",
      text: "First",
      clientMessageId: "client-1",
    });

    const second = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      kind: "text",
      text: "",
      clientMessageId: "client-1",
    });

    expect(second.message.id).toBe(first.message.id);
    expect(repo.messages).toHaveLength(1);
  });

  it("rejects non-participant sender", async () => {
    seedConversation(repo);
    seedListing(listings);
    const uc = makeUseCase(repo, listings);

    await expect(
      uc.execute({
        senderId: "random-user",
        conversationId: "conv-1",
        kind: "text",
        text: "Hello",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects invalid text", async () => {
    seedConversation(repo);
    seedListing(listings);
    const uc = makeUseCase(repo, listings);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        kind: "text",
        text: "",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it.each(["sold", "archived"] as const)(
    "accepts a text, an image and a retried send when the listing is %s",
    async (status) => {
      seedConversation(repo);
      seedListing(listings, { status });
      const events = new FakeMessageEventPublisher();
      const uc = makeUseCase(repo, listings, undefined, undefined, events);

      const text = await uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        kind: "text",
        text: "Is it still with you?",
        clientMessageId: "client-text",
      });
      const retry = await uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        kind: "text",
        text: "Is it still with you?",
        clientMessageId: "client-text",
      });
      const image = await uc.execute({
        senderId: "seller-1",
        conversationId: "conv-1",
        kind: "image",
        metadata: { key: "chat/image.jpg", width: 800, height: 600 },
      });

      expect(retry.message.id).toBe(text.message.id);
      expect(image.message.kind).toBe("image");
      expect(repo.messages).toHaveLength(2);
      expect(events.events.map((e) => [e.senderId, e.recipientId])).toEqual([
        ["buyer-1", "seller-1"],
        ["seller-1", "buyer-1"],
      ]);
      expect(repo.messages.some((m) => m.kind === "system")).toBe(false);
    },
  );

  it("blocks sends when listing is banned", async () => {
    seedConversation(repo);
    seedListing(listings, { status: "banned" });
    const uc = makeUseCase(repo, listings);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        kind: "text",
        text: "Hello",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("blocks sends when chat is off, even after the listing is sold", async () => {
    seedConversation(repo);
    seedListing(listings, { status: "sold", allowChat: false });
    const uc = makeUseCase(repo, listings);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        kind: "text",
        text: "Hello",
      }),
    ).rejects.toMatchObject({
      response: {
        message: "Chat is disabled for this listing",
        details: { reason: CONVERSATION_ERROR_CODES.CHAT_DISABLED },
      },
    });
  });

  it("checks parent listing contactability before suspension state", async () => {
    seedConversation(repo);
    seedListing(listings, { status: "banned" });
    const identity = new FakeIdentityCheckPort();
    identity.suspend("buyer-1");
    const uc = makeUseCase(repo, listings, identity);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        kind: "text",
        text: "Hello",
      }),
    ).rejects.toMatchObject({
      response: {
        message: "Listing is no longer available for contact",
        details: {
          reason: CONVERSATION_ERROR_CODES.LISTING_NOT_CONTACTABLE,
        },
      },
    });
  });

  it("blocks sends when sender is suspended and the listing is sold", async () => {
    seedConversation(repo);
    seedListing(listings, { status: "sold" });
    const identity = new FakeIdentityCheckPort();
    identity.suspend("buyer-1");
    const uc = makeUseCase(repo, listings, identity);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        kind: "text",
        text: "Hello",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("blocks sends when sender is suspended", async () => {
    seedConversation(repo);
    seedListing(listings);
    const identity = new FakeIdentityCheckPort();
    identity.suspend("buyer-1");
    const uc = makeUseCase(repo, listings, identity);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        kind: "text",
        text: "Hello",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("blocks sends when recipient is blocked by sender", async () => {
    seedConversation(repo);
    seedListing(listings);
    const identityRead = new FakeIdentityReadPort();
    identityRead.block("buyer-1", "seller-1");
    const uc = makeUseCase(repo, listings, undefined, identityRead);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        kind: "text",
        text: "Hello",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("blocks sends when sender is blocked by recipient", async () => {
    seedConversation(repo);
    seedListing(listings);
    const identityRead = new FakeIdentityReadPort();
    identityRead.block("seller-1", "buyer-1");
    const uc = makeUseCase(repo, listings, undefined, identityRead);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        kind: "text",
        text: "Hello",
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
