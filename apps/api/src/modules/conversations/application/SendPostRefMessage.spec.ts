import { describe, it, expect, beforeEach } from "vitest";
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";

import { Conversation } from "../domain/Conversation";
import { Message } from "../domain/Message";
import type { ConversationRepository } from "../domain/ports/ConversationRepository";
import type { ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import type { IdentityCheckPort, IdentityReadPort } from "../../identity/identity.public";
import type { MessageEventPublisher, MessageSentEvent } from "../domain/ports/MessageEventPublisher";

import { SendPostRefMessage } from "./SendPostRefMessage";
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

  async save(): Promise<void> {}

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
  const effectiveRepo = repo ?? new FakeConversationRepository();
  const effectiveListings = listings ?? new FakeListingsReadPort();
  const effectiveIdentityCheck = identityCheck ?? new FakeIdentityCheckPort();
  const effectiveIdentityRead = identityRead ?? new FakeIdentityReadPort();
  const accessPolicy = new ConversationAccessPolicy(
    effectiveIdentityCheck,
    effectiveIdentityRead,
  );
  const workflow = new SendConversationMessage(
    effectiveRepo,
    new ConversationSendPolicy(effectiveRepo, effectiveListings, accessPolicy),
    new ConversationMessageCommitter(
      effectiveRepo,
      messageEvents ?? new FakeMessageEventPublisher(),
    ),
  );
  return new SendPostRefMessage(
    workflow,
    effectiveListings,
  );
}

function seedConversation(
  repo: FakeConversationRepository,
  overrides?: Partial<Conversation>,
) {
  const c = Conversation.create({
    id: "conv-1",
    listingId: "parent-listing",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    ...overrides,
  });
  repo.conversations.push(c);
  return c;
}

function seedParentListing(
  listings: FakeListingsReadPort,
  overrides?: Partial<FakeListingsReadPort["listings"][number]>,
) {
  const listing = {
    id: "parent-listing",
    sellerId: "seller-1",
    status: "active" as const,
    brandId: "brand-parent",
    modelId: "model-parent",
    year: 2020,
    priceAmount: 100000,
    priceCurrency: "TMT" as const,
    displayPriceTmt: 100000,
    coverMediaKey: "cover-parent.jpg",
    cityId: "city-1",
    publishedAt: new Date("2026-05-01T00:00:00Z"),
    allowChat: true,
    ...overrides,
  };
  listings.listings.push(listing);
  return listing;
}

function seedReferencedListing(
  listings: FakeListingsReadPort,
  overrides?: Partial<FakeListingsReadPort["listings"][number]>,
) {
  const listing = {
    id: "referenced-listing",
    sellerId: "seller-2",
    status: "active" as const,
    brandId: "brand-1",
    modelId: "model-1",
    year: 2021,
    priceAmount: 200000,
    priceCurrency: "TMT" as const,
    displayPriceTmt: 200000,
    coverMediaKey: "cover.jpg",
    cityId: "city-2",
    publishedAt: new Date("2026-05-01T00:00:00Z"),
    allowChat: true,
    ...overrides,
  };
  listings.listings.push(listing);
  return listing;
}

describe("SendPostRefMessage", () => {
  let repo: FakeConversationRepository;
  let listings: FakeListingsReadPort;

  beforeEach(() => {
    repo = new FakeConversationRepository();
    listings = new FakeListingsReadPort();
  });

  it("sends an active listing reference with a stable snapshot", async () => {
    seedConversation(repo);
    seedParentListing(listings);
    const referenced = seedReferencedListing(listings);
    const uc = makeUseCase(repo, listings);

    const result = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      metadata: { listingId: referenced.id },
      clientMessageId: "client-ref-1",
    });

    expect(result.message.kind).toBe("post_ref");
    expect(result.message.metadata).toEqual({
      listingId: referenced.id,
      brandId: referenced.brandId,
      modelId: referenced.modelId,
      year: referenced.year,
      displayPriceTmt: referenced.displayPriceTmt,
      priceCurrency: referenced.priceCurrency,
      coverMediaKey: referenced.coverMediaKey,
      status: referenced.status,
    });
    expect(result.message.clientMessageId).toBe("client-ref-1");
    expect(repo.messages).toHaveLength(1);
  });

  it("emits MessageSent after saving a post reference", async () => {
    seedConversation(repo);
    seedParentListing(listings);
    const referenced = seedReferencedListing(listings);
    const events = new FakeMessageEventPublisher();
    const uc = makeUseCase(repo, listings, undefined, undefined, events);

    const result = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      metadata: { listingId: referenced.id },
    });

    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      event: "MessageSent",
      conversationId: "conv-1",
      messageId: result.message.id,
      senderId: "buyer-1",
      recipientId: "seller-1",
      messageKind: "post_ref",
    });
  });

  it("rejects a hidden/deleted referenced listing", async () => {
    seedConversation(repo);
    seedParentListing(listings);
    const uc = makeUseCase(repo, listings);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        metadata: { listingId: "does-not-exist" },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects a sold referenced listing", async () => {
    seedConversation(repo);
    seedParentListing(listings);
    seedReferencedListing(listings, { status: "sold" });
    const uc = makeUseCase(repo, listings);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        metadata: { listingId: "referenced-listing" },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects a non-participant sender", async () => {
    seedConversation(repo);
    seedParentListing(listings);
    seedReferencedListing(listings);
    const uc = makeUseCase(repo, listings);

    await expect(
      uc.execute({
        senderId: "random-user",
        conversationId: "conv-1",
        metadata: { listingId: "referenced-listing" },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it.each(["sold", "archived"] as const)(
    "sends a Listing reference when the parent conversation listing is %s",
    async (status) => {
      seedConversation(repo);
      seedParentListing(listings, { status });
      seedReferencedListing(listings);
      const events = new FakeMessageEventPublisher();
      const uc = makeUseCase(repo, listings, undefined, undefined, events);

      const result = await uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        metadata: { listingId: "referenced-listing" },
        clientMessageId: "client-ref-closed",
      });

      expect(result.message.kind).toBe("post_ref");
      expect(events.events).toHaveLength(1);
    },
  );

  it("blocks sends when parent conversation listing is banned", async () => {
    seedConversation(repo);
    seedParentListing(listings, { status: "banned" });
    seedReferencedListing(listings);
    const uc = makeUseCase(repo, listings);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        metadata: { listingId: "referenced-listing" },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("returns existing message for duplicate clientMessageId", async () => {
    seedConversation(repo);
    seedParentListing(listings);
    seedReferencedListing(listings);
    const events = new FakeMessageEventPublisher();
    const uc = makeUseCase(repo, listings, undefined, undefined, events);

    const first = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      metadata: { listingId: "referenced-listing" },
      clientMessageId: "client-ref-1",
    });

    const second = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      metadata: { listingId: "referenced-listing" },
      clientMessageId: "client-ref-1",
    });

    expect(second.message.id).toBe(first.message.id);
    expect(repo.messages).toHaveLength(1);
    expect(events.events).toHaveLength(1);
  });

  it("returns an idempotent retry before validating replacement metadata", async () => {
    seedConversation(repo);
    seedParentListing(listings);
    seedReferencedListing(listings);
    const uc = makeUseCase(repo, listings);

    await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      metadata: { listingId: "referenced-listing" },
      clientMessageId: "client-ref-1",
    });

    const retry = await uc.execute({
      senderId: "buyer-1",
      conversationId: "conv-1",
      metadata: { listingId: "missing-listing" },
      clientMessageId: "client-ref-1",
    });

    expect(retry.message.clientMessageId).toBe("client-ref-1");
    expect(repo.messages).toHaveLength(1);
  });

  it("blocks sends when sender is suspended", async () => {
    seedConversation(repo);
    seedParentListing(listings);
    seedReferencedListing(listings);
    const identity = new FakeIdentityCheckPort();
    identity.suspend("buyer-1");
    const uc = makeUseCase(repo, listings, identity);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        metadata: { listingId: "referenced-listing" },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("blocks sends when recipient is blocked by sender", async () => {
    seedConversation(repo);
    seedParentListing(listings);
    seedReferencedListing(listings);
    const identityRead = new FakeIdentityReadPort();
    identityRead.block("buyer-1", "seller-1");
    const uc = makeUseCase(repo, listings, undefined, identityRead);

    await expect(
      uc.execute({
        senderId: "buyer-1",
        conversationId: "conv-1",
        metadata: { listingId: "referenced-listing" },
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
