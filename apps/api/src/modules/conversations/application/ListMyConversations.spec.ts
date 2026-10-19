import { describe, it, expect, beforeEach } from "vitest";

import { Conversation } from "../domain/Conversation";
import { Message } from "../domain/Message";
import type { ConversationRepository } from "../domain/ports/ConversationRepository";
import type { ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import type {
  IdentityReadPort,
  IdentityUserSummary,
} from "../../identity/identity.public";

import { ListMyConversations } from "./ListMyConversations";

class FakeConversationRepository implements ConversationRepository {
  conversations: Conversation[] = [];
  messages: Message[] = [];
  mutedByUser: Map<string, Date> = new Map();

  async findById(id: string): Promise<Conversation | null> {
    return this.conversations.find((c) => c.id === id) ?? null;
  }

  async findByListingAndBuyer(
    listingId: string,
    buyerId: string,
  ): Promise<Conversation | null> {
    return (
      this.conversations.find(
        (c) => c.listingId === listingId && c.buyerId === buyerId,
      ) ?? null
    );
  }

  async save(conversation: Conversation): Promise<void> {
    this.conversations.push(conversation);
  }

  async listForUser(
    userId: string,
    query: { cursor?: string; limit?: number },
  ): Promise<{
    items: Array<{ conversation: Conversation; lastMessage: Message | null }>;
    nextCursor: string | null;
  }> {
    const userConversations = this.conversations
      .filter((c) => c.buyerId === userId || c.sellerId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const limit = query.limit ?? 20;
    let startIndex = 0;

    if (query.cursor) {
      const cursorIndex = userConversations.findIndex(
        (c) => c.id === query.cursor,
      );
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      }
    }

    const items = userConversations.slice(startIndex, startIndex + limit);
    const hasMore = userConversations.length > startIndex + limit;
    const last = items[items.length - 1];

    const lastMessageMap = new Map<string, Message | null>();
    for (const conv of items) {
      const lastMsg = this.messages
        .filter((m) => m.conversationId === conv.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      lastMessageMap.set(conv.id, lastMsg ?? null);
    }

    return {
      items: items.map((c) => ({
        conversation: c,
        lastMessage: lastMessageMap.get(c.id) ?? null,
      })),
      nextCursor: hasMore && last ? last.id : null,
    };
  }

  async listMessages(): Promise<{
    items: import("../domain/Message").Message[];
    nextCursor: string | null;
  }> {
    return { items: [], nextCursor: null };
  }

  async findMessageById(): Promise<null> {
    return null;
  }

  async findMessageByClientMessageId(): Promise<null> {
    return null;
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

  async softDeleteMessage(): Promise<null> {
    return null;
  }

  async countUnreadMessages(): Promise<number> {
    return 0;
  }

  async getParticipantStatesForConversations(
    conversationIds: string[],
  ): Promise<
    Map<string, Array<{ userId: string; mutedAt: Date | null; lastReadAt: Date | null; lastDeliveredAt: Date | null }>>
  > {
    const map = new Map<
      string,
      Array<{ userId: string; mutedAt: Date | null; lastReadAt: Date | null; lastDeliveredAt: Date | null }>
    >();
    for (const conversationId of conversationIds) {
      const conversation = this.conversations.find((c) => c.id === conversationId);
      if (conversation) {
        map.set(conversationId, [
          {
            userId: conversation.buyerId,
            mutedAt: this.mutedByUser.get(conversation.buyerId) ?? null,
            lastReadAt: new Date("2026-06-01T10:00:00.000Z"),
            lastDeliveredAt: new Date("2026-06-01T09:00:00.000Z"),
          },
          {
            userId: conversation.sellerId,
            mutedAt: this.mutedByUser.get(conversation.sellerId) ?? null,
            lastReadAt: new Date("2026-06-01T11:00:00.000Z"),
            lastDeliveredAt: new Date("2026-06-01T09:30:00.000Z"),
          },
        ]);
      }
    }
    return map;
  }
}

class FakeListingsReadPort implements ListingsReadPort {
  listings: Array<{
    id: string;
    sellerId: string;
    status: "active" | "sold" | "archived";
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
    return this.listings.find((l) => l.id === id) ?? null;
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

class FakeIdentityReadPort implements IdentityReadPort {
  users = new Map<string, IdentityUserSummary>();
  blocks = new Set<string>();
  calls = {
    findUserById: 0,
    findUsersByIds: [] as string[][],
    findBlockedUserIds: [] as Array<{ blockerId: string; blockedIds: string[] }>,
    isUserBlockedBy: 0,
  };

  addUser(id: string, displayName: string | null) {
    this.users.set(id, {
      id,
      displayName,
      role: "user",
      suspendedAt: null,
      suspendedById: null,
      suspensionReason: null,
    });
  }

  block(blockerId: string, blockedId: string) {
    this.blocks.add(`${blockerId}:${blockedId}`);
  }

  async findUserById(id: string): Promise<IdentityUserSummary | null> {
    this.calls.findUserById += 1;
    return this.users.get(id) ?? null;
  }

  async findUsersByIds(ids: string[]): Promise<IdentityUserSummary[]> {
    this.calls.findUsersByIds.push(ids);
    return ids.flatMap((id) => {
      const user = this.users.get(id);
      return user ? [user] : [];
    });
  }

  async findBlockedUserIds(
    blockerId: string,
    blockedIds: string[],
  ): Promise<string[]> {
    this.calls.findBlockedUserIds.push({ blockerId, blockedIds });
    return blockedIds.filter((id) => this.blocks.has(`${blockerId}:${id}`));
  }

  async isUserBlockedBy(blockerId: string, blockedId: string): Promise<boolean> {
    this.calls.isUserBlockedBy += 1;
    return this.blocks.has(`${blockerId}:${blockedId}`);
  }
}

function makeUseCase(
  repo?: FakeConversationRepository,
  listings?: FakeListingsReadPort,
  identityRead?: FakeIdentityReadPort,
) {
  return new ListMyConversations(
    repo ?? new FakeConversationRepository(),
    listings ?? new FakeListingsReadPort(),
    identityRead ?? new FakeIdentityReadPort(),
  );
}

describe("ListMyConversations", () => {
  let repo: FakeConversationRepository;
  let listings: FakeListingsReadPort;
  let identity: FakeIdentityReadPort;

  beforeEach(() => {
    repo = new FakeConversationRepository();
    listings = new FakeListingsReadPort();
    identity = new FakeIdentityReadPort();
  });

  function seedConversation(overrides?: Partial<Conversation>) {
    const c = Conversation.create({
      id: `conv-${repo.conversations.length + 1}`,
      listingId: "listing-1",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      ...overrides,
    });
    repo.conversations.push(c);
    return c;
  }

  function seedListing(
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

  it("lists only the current user's conversations as buyer", async () => {
    seedListing();
    seedConversation({ buyerId: "buyer-1", sellerId: "seller-1" });
    seedConversation({ buyerId: "buyer-2", sellerId: "seller-1" });

    const uc = makeUseCase(repo, listings);
    const result = await uc.execute({ userId: "buyer-1" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.conversation.buyerId).toBe("buyer-1");
  });

  it("lists only the current user's conversations as seller", async () => {
    seedListing();
    seedConversation({ buyerId: "buyer-1", sellerId: "seller-1" });
    seedConversation({ buyerId: "buyer-2", sellerId: "seller-1" });

    const uc = makeUseCase(repo, listings);
    const result = await uc.execute({ userId: "seller-1" });

    expect(result.items).toHaveLength(2);
  });

  it("sorts conversations by updatedAt descending", async () => {
    seedListing();
    const older = seedConversation({
      id: "conv-older",
      buyerId: "buyer-1",
      sellerId: "seller-1",
    });
    const newer = seedConversation({
      id: "conv-newer",
      buyerId: "buyer-1",
      sellerId: "seller-1",
    });

    // Override updatedAt manually (private field, so we replace in array)
    repo.conversations = repo.conversations.map((c) => {
      if (c.id === "conv-older") {
        return Conversation.create({
          ...c,
          createdAt: c.createdAt,
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        });
      }
      if (c.id === "conv-newer") {
        return Conversation.create({
          ...c,
          createdAt: c.createdAt,
          updatedAt: new Date("2026-06-01T00:00:00Z"),
        });
      }
      return c;
    });

    const uc = makeUseCase(repo, listings);
    const result = await uc.execute({ userId: "buyer-1" });

    expect(result.items[0]!.conversation.id).toBe("conv-newer");
    expect(result.items[1]!.conversation.id).toBe("conv-older");
  });

  it("includes listing summary for each conversation", async () => {
    seedListing({ id: "listing-1", brandId: "brand-a", modelId: "model-a" });
    seedConversation({ listingId: "listing-1" });

    const uc = makeUseCase(repo, listings);
    const result = await uc.execute({ userId: "buyer-1" });

    expect(result.items[0]!.listing).not.toBeNull();
    expect(result.items[0]!.listing!.brandId).toBe("brand-a");
    expect(result.items[0]!.listing!.modelId).toBe("model-a");
  });

  it("returns null listing when listing summary is missing", async () => {
    seedConversation({ listingId: "listing-missing" });

    const uc = makeUseCase(repo, listings);
    const result = await uc.execute({ userId: "buyer-1" });

    expect(result.items[0]!.listing).toBeNull();
  });

  it("returns empty array when user has no conversations", async () => {
    const uc = makeUseCase(repo, listings);
    const result = await uc.execute({ userId: "nobody" });

    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("respects limit and cursor", async () => {
    seedListing();
    for (let i = 0; i < 3; i++) {
      seedConversation({
        id: `conv-${i + 1}`,
        buyerId: "buyer-1",
        sellerId: "seller-1",
      });
    }

    // Manually set updatedAt descending: conv-3 newest, conv-2, conv-1 oldest
    repo.conversations = repo.conversations.map((c) => {
      const num = parseInt(c.id.replace("conv-", ""), 10);
      return Conversation.create({
        ...c,
        createdAt: c.createdAt,
        updatedAt: new Date(2026, 0, num),
      });
    });

    const uc = makeUseCase(repo, listings);
    const first = await uc.execute({ userId: "buyer-1", limit: 1 });

    expect(first.items).toHaveLength(1);
    expect(first.items[0]!.conversation.id).toBe("conv-3");
    expect(first.nextCursor).toBe("conv-3");

    const second = await uc.execute({
      userId: "buyer-1",
      limit: 1,
      cursor: first.nextCursor!,
    });

    expect(second.items).toHaveLength(1);
    expect(second.items[0]!.conversation.id).toBe("conv-2");
    expect(second.nextCursor).toBe("conv-2");
  });

  it("includes last message for each conversation", async () => {
    seedListing();
    seedConversation({ id: "conv-1" });
    const msg = Message.createText({
      id: "msg-1",
      conversationId: "conv-1",
      senderId: "buyer-1",
      text: "Hello",
    });
    repo.saveMessage(msg);

    const uc = makeUseCase(repo, listings);
    const result = await uc.execute({ userId: "buyer-1" });

    expect(result.items[0]!.lastMessage).not.toBeNull();
    expect(result.items[0]!.lastMessage!.id).toBe("msg-1");
  });

  it("includes peer watermark timestamps", async () => {
    seedListing();
    seedConversation({ id: "conv-1", buyerId: "buyer-1", sellerId: "seller-1" });

    const uc = makeUseCase(repo, listings);
    const result = await uc.execute({ userId: "buyer-1" });

    expect(result.items[0]!.peerLastReadAt).toEqual(
      new Date("2026-06-01T11:00:00.000Z"),
    );
    expect(result.items[0]!.peerLastDeliveredAt).toEqual(
      new Date("2026-06-01T09:30:00.000Z"),
    );
  });

  it("includes the viewer's own mutedAt when the conversation is muted", async () => {
    seedListing();
    seedConversation({ id: "conv-1", buyerId: "buyer-1", sellerId: "seller-1" });
    repo.mutedByUser.set("buyer-1", new Date("2026-06-05T12:00:00.000Z"));

    const uc = makeUseCase(repo, listings);
    const result = await uc.execute({ userId: "buyer-1" });

    expect(result.items[0]!.mutedAt).toEqual(
      new Date("2026-06-05T12:00:00.000Z"),
    );
  });

  it("returns null mutedAt when the viewer has not muted the conversation", async () => {
    seedListing();
    seedConversation({ id: "conv-1", buyerId: "buyer-1", sellerId: "seller-1" });
    repo.mutedByUser.set("seller-1", new Date("2026-06-05T12:00:00.000Z"));

    const uc = makeUseCase(repo, listings);
    const result = await uc.execute({ userId: "buyer-1" });

    expect(result.items[0]!.mutedAt).toBeNull();
  });

  describe("other participant and block state", () => {
    it("shows the seller as the peer to a buyer", async () => {
      seedListing();
      seedConversation({ buyerId: "buyer-1", sellerId: "seller-1" });
      identity.addUser("buyer-1", "Buyer One");
      identity.addUser("seller-1", "Seller One");

      const result = await makeUseCase(repo, listings, identity).execute({
        userId: "buyer-1",
      });

      expect(result.items[0]!.peer).toEqual({
        id: "seller-1",
        displayName: "Seller One",
      });
    });

    it("shows the buyer as the peer to a seller", async () => {
      seedListing();
      seedConversation({ buyerId: "buyer-1", sellerId: "seller-1" });
      identity.addUser("buyer-1", "Buyer One");
      identity.addUser("seller-1", "Seller One");

      const result = await makeUseCase(repo, listings, identity).execute({
        userId: "seller-1",
      });

      expect(result.items[0]!.peer).toEqual({
        id: "buyer-1",
        displayName: "Buyer One",
      });
    });

    it("returns only the id and display name, no other identity data", async () => {
      seedListing();
      seedConversation();
      identity.addUser("seller-1", "Seller One");

      const result = await makeUseCase(repo, listings, identity).execute({
        userId: "buyer-1",
      });

      expect(Object.keys(result.items[0]!.peer).sort()).toEqual([
        "displayName",
        "id",
      ]);
    });

    it("keeps a null display name when the peer has none", async () => {
      seedListing();
      seedConversation();
      identity.addUser("seller-1", null);

      const result = await makeUseCase(repo, listings, identity).execute({
        userId: "buyer-1",
      });

      expect(result.items[0]!.peer).toEqual({
        id: "seller-1",
        displayName: null,
      });
    });

    it("still returns a summary whose peer no longer exists", async () => {
      seedListing();
      seedConversation();

      const result = await makeUseCase(repo, listings, identity).execute({
        userId: "buyer-1",
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.peer).toEqual({
        id: "seller-1",
        displayName: null,
      });
      expect(result.items[0]!.blockedByMe).toBe(false);
    });

    it("marks blockedByMe when the viewer blocked the peer", async () => {
      seedListing();
      seedConversation();
      identity.addUser("seller-1", "Seller One");
      identity.block("buyer-1", "seller-1");

      const result = await makeUseCase(repo, listings, identity).execute({
        userId: "buyer-1",
      });

      expect(result.items[0]!.blockedByMe).toBe(true);
    });

    it("leaves blockedByMe false for an unblocked peer", async () => {
      seedListing();
      seedConversation();
      identity.addUser("seller-1", "Seller One");

      const result = await makeUseCase(repo, listings, identity).execute({
        userId: "buyer-1",
      });

      expect(result.items[0]!.blockedByMe).toBe(false);
    });

    it("does not expose that the peer blocked the viewer", async () => {
      seedListing();
      seedConversation();
      identity.addUser("seller-1", "Seller One");
      identity.block("seller-1", "buyer-1");

      const result = await makeUseCase(repo, listings, identity).execute({
        userId: "buyer-1",
      });

      expect(result.items[0]!.blockedByMe).toBe(false);
    });

    it("reads names and block states for a whole page in one call each", async () => {
      seedListing();
      for (let i = 1; i <= 3; i++) {
        seedConversation({
          id: `conv-${i}`,
          buyerId: "buyer-1",
          sellerId: `seller-${i}`,
        });
        identity.addUser(`seller-${i}`, `Seller ${i}`);
      }
      identity.block("buyer-1", "seller-2");

      const result = await makeUseCase(repo, listings, identity).execute({
        userId: "buyer-1",
      });

      expect(result.items.map((i) => i.blockedByMe).sort()).toEqual([
        false,
        false,
        true,
      ]);
      expect(identity.calls.findUsersByIds).toHaveLength(1);
      expect([...identity.calls.findUsersByIds[0]!].sort()).toEqual([
        "seller-1",
        "seller-2",
        "seller-3",
      ]);
      expect(identity.calls.findBlockedUserIds).toHaveLength(1);
      expect(identity.calls.findBlockedUserIds[0]!.blockerId).toBe("buyer-1");
      expect(identity.calls.findUserById).toBe(0);
      expect(identity.calls.isUserBlockedBy).toBe(0);
    });

    it("asks identity once for a peer shared by several conversations", async () => {
      seedListing();
      seedConversation({ id: "conv-1", buyerId: "buyer-1", sellerId: "seller-1" });
      seedConversation({ id: "conv-2", buyerId: "buyer-2", sellerId: "seller-1" });
      identity.addUser("buyer-1", "Buyer One");
      identity.addUser("buyer-2", "Buyer Two");

      const result = await makeUseCase(repo, listings, identity).execute({
        userId: "seller-1",
      });

      expect(result.items).toHaveLength(2);
      expect(identity.calls.findUsersByIds).toHaveLength(1);
      expect([...identity.calls.findUsersByIds[0]!].sort()).toEqual([
        "buyer-1",
        "buyer-2",
      ]);
    });

    it("makes no identity call for an empty page", async () => {
      await makeUseCase(repo, listings, identity).execute({ userId: "nobody" });

      expect(identity.calls.findUsersByIds).toHaveLength(0);
      expect(identity.calls.findBlockedUserIds).toHaveLength(0);
    });
  });
});
