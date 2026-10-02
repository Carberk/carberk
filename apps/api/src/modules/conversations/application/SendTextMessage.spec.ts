import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";

import { Conversation } from "../domain/Conversation";
import { Message } from "../domain/Message";
import type { ConversationRepository } from "../domain/ports/ConversationRepository";
import type { ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import type { IdentityCheckPort, IdentityReadPort } from "../../identity/identity.public";
import type { MessageEventPublisher, MessageSentEvent } from "../domain/ports/MessageEventPublisher";

import { SendTextMessage } from "./SendTextMessage";
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
  const accessPolicy = new ConversationAccessPolicy(
    effectiveIdentityCheck,
    effectiveIdentityRead,
  );
  const effectiveRepo = repo ?? new FakeConversationRepository();
  const effectiveListings = listings ?? new FakeListingsReadPort();
  const effectiveEvents = messageEvents ?? new FakeMessageEventPublisher();
  const workflow = new SendConversationMessage(
    effectiveRepo,
    new ConversationSendPolicy(effectiveRepo, effectiveListings, accessPolicy),
    new ConversationMessageCommitter(effectiveRepo, effectiveEvents),
  );
  return new SendTextMessage(workflow);
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

describe("SendTextMessage", () => {
  let repo: FakeConversationRepository;
  let listings: FakeListingsReadPort;

  beforeEach(() => {
    repo = new FakeConversationRepository();
    listings = new FakeListingsReadPort();
  });

  it("sends a valid text message as buyer", async () => {
    seedConversation(repo);
    seedListing(listings);
    const uc = makeUseCase(repo, listings);

    const result = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      text: "Hello, is it still available?",
    });

    expect(result.message.body).toBe("Hello, is it still available?");
    expect(result.message.senderId).toBe("buyer-1");
    expect(result.message.conversationId).toBe("conv-1");
    expect(result.listing).not.toBeNull();
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
      text: "Hello",
    });

    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      event: "MessageSent",
      conversationId: "conv-1",
      messageId: result.message.id,
      senderId: "buyer-1",
      recipientId: "seller-1",
      clientMessageId: null,
    });
  });

  it("sends a valid text message as seller", async () => {
    seedConversation(repo);
    seedListing(listings);
    const uc = makeUseCase(repo, listings);

    const result = await uc.execute({
      senderId: "seller-1",
      conversationId: "conv-1",
      text: "Yes, it is available",
    });

    expect(result.message.senderId).toBe("seller-1");
    expect(repo.messages).toHaveLength(1);
  });

  it("trims leading and trailing whitespace", async () => {
    seedConversation(repo);
    seedListing(listings);
    const uc = makeUseCase(repo, listings);

    const result = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      text: "  Hello world  ",
    });

    expect(result.message.body).toBe("Hello world");
  });

  it("preserves internal line breaks", async () => {
    seedConversation(repo);
    seedListing(listings);
    const uc = makeUseCase(repo, listings);

    const text = "line one\nline two";
    const result = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      text,
    });

    expect(result.message.body).toBe(text);
  });

  it("rejects non-existent conversation", async () => {
    const uc = makeUseCase(repo, listings);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "missing",
        text: "Hello",
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects non-participant sender", async () => {
    seedConversation(repo);
    seedListing(listings);
    const uc = makeUseCase(repo, listings);

    await expect(
      uc.execute({
        senderId: "random-user",
        conversationId: "conv-1",
        text: "Hello",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects blank text", async () => {
    seedConversation(repo);
    seedListing(listings);
    const uc = makeUseCase(repo, listings);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        text: "   ",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects empty text", async () => {
    seedConversation(repo);
    seedListing(listings);
    const uc = makeUseCase(repo, listings);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        text: "",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects text longer than 1000 chars after trim", async () => {
    seedConversation(repo);
    seedListing(listings);
    const uc = makeUseCase(repo, listings);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        text: "a".repeat(1001),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("accepts text at exactly 1000 chars", async () => {
    seedConversation(repo);
    seedListing(listings);
    const uc = makeUseCase(repo, listings);

    const result = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      text: "a".repeat(1000),
    });

    expect(result.message.body).toBe("a".repeat(1000));
  });

  it.each(["sold", "archived"] as const)(
    "accepts sends from either participant when listing is %s",
    async (status) => {
      seedConversation(repo);
      seedListing(listings, { status });
      const uc = makeUseCase(repo, listings);

      const fromBuyer = await uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        text: "Hello",
      });
      const fromSeller = await uc.execute({
        senderId: "seller-1",
        conversationId: "conv-1",
        text: "Hi",
      });

      expect(fromBuyer.message.body).toBe("Hello");
      expect(fromSeller.message.body).toBe("Hi");
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
        text: "Hello",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("blocks sends when listing is unavailable (deleted)", async () => {
    seedConversation(repo);
    // Do not seed listing → getListingSummary returns null
    const uc = makeUseCase(repo, listings);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        text: "Hello",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("blocks sends when listing has allowChat = false", async () => {
    seedConversation(repo);
    seedListing(listings, { allowChat: false });
    const uc = makeUseCase(repo, listings);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
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
        text: "Hello",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("blocks sends when other participant is suspended", async () => {
    seedConversation(repo);
    seedListing(listings);
    const identity = new FakeIdentityCheckPort();
    identity.suspend("seller-1");
    const uc = makeUseCase(repo, listings, identity);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
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
        text: "Hello",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("blocks sends when sender has blocked recipient", async () => {
    seedConversation(repo);
    seedListing(listings);
    const identityRead = new FakeIdentityReadPort();
    identityRead.block("buyer-1", "seller-1");
    const uc = makeUseCase(repo, listings, undefined, identityRead);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        text: "Hello",
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
