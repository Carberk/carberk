import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { IdentityCheckPort, IdentityReadPort } from "../../identity/identity.public";
import type {
  ListingSummary,
  ListingsReadPort,
} from "../../listings/domain/ports/ListingsReadPort";
import { Conversation } from "../domain/Conversation";
import { Message } from "../domain/Message";
import type { ConversationRepository } from "../domain/ports/ConversationRepository";
import { CONVERSATION_ERROR_CODES } from "../domain/types";

import { ConversationAccessPolicy } from "./ConversationAccessPolicy";
import { ConversationSendPolicy } from "./ConversationSendPolicy";
import { GetConversation } from "./GetConversation";

const conversation = Conversation.create({
  id: "conv-1",
  listingId: "listing-1",
  buyerId: "buyer-1",
  sellerId: "seller-1",
});

const listing: ListingSummary = {
  id: "listing-1",
  sellerId: "seller-1",
  status: "active",
  brandId: "brand-1",
  modelId: "model-1",
  priceAmount: 100,
  priceCurrency: "TMT",
  displayPriceTmt: 100,
  cityId: "city-1",
  publishedAt: new Date("2026-01-01T00:00:00.000Z"),
  allowChat: true,
};

const lastMessage = Message.createText({
  id: "msg-1",
  conversationId: "conv-1",
  senderId: "seller-1",
  text: "Hello",
});

function build(
  overrides: {
    found?: Conversation | null;
    listing?: ListingSummary | null;
    lastMessage?: Message | null;
    suspended?: string[];
    /** "<blocker>><blocked>" pairs. */
    blocks?: string[];
    users?: Array<{ id: string; displayName: string | null }>;
  } = {},
) {
  const repository = {
    findById: vi
      .fn()
      .mockResolvedValue("found" in overrides ? overrides.found : conversation),
    getParticipantStatesForConversations: vi.fn().mockResolvedValue(
      new Map([
        [
          "conv-1",
          [
            {
              userId: "buyer-1",
              mutedAt: new Date("2026-02-01T00:00:00.000Z"),
              lastReadAt: null,
              lastDeliveredAt: null,
            },
            {
              userId: "seller-1",
              mutedAt: null,
              lastReadAt: new Date("2026-02-02T00:00:00.000Z"),
              lastDeliveredAt: new Date("2026-02-03T00:00:00.000Z"),
            },
          ],
        ],
      ]),
    ),
    countUnreadMessages: vi.fn().mockResolvedValue(4),
    listMessages: vi.fn().mockResolvedValue({
      items: [
        "lastMessage" in overrides ? overrides.lastMessage : lastMessage,
      ].filter((m) => m != null),
      nextCursor: null,
    }),
  } as unknown as ConversationRepository;
  const listings = {
    getListingSummary: vi
      .fn()
      .mockResolvedValue("listing" in overrides ? overrides.listing : listing),
  } as unknown as ListingsReadPort;
  const identityCheck = {
    isSuspended: vi.fn(async (id: string) =>
      (overrides.suspended ?? []).includes(id),
    ),
  } as unknown as IdentityCheckPort;
  const blocks = overrides.blocks ?? [];
  const identityRead = {
    isUserBlockedBy: vi.fn(async (blockerId: string, blockedId: string) =>
      blocks.includes(`${blockerId}>${blockedId}`),
    ),
    findUsersByIds: vi
      .fn()
      .mockResolvedValue(
        overrides.users ?? [{ id: "seller-1", displayName: "Seller One" }],
      ),
    findBlockedUserIds: vi.fn(async (blockerId: string, ids: string[]) =>
      ids.filter((id) => blocks.includes(`${blockerId}>${id}`)),
    ),
  } as unknown as IdentityReadPort;
  const accessPolicy = new ConversationAccessPolicy(identityCheck, identityRead);

  return {
    repository,
    listings,
    useCase: new GetConversation(
      repository,
      listings,
      identityRead,
      accessPolicy,
      new ConversationSendPolicy(repository, listings, accessPolicy),
    ),
  };
}

describe("GetConversation", () => {
  it("returns the list-item summary for a participant", async () => {
    const { useCase } = build();

    const result = await useCase.execute({
      userId: "buyer-1",
      conversationId: "conv-1",
    });

    expect(result).toEqual({
      conversation,
      listing,
      lastMessage,
      unreadCount: 4,
      peerLastReadAt: new Date("2026-02-02T00:00:00.000Z"),
      peerLastDeliveredAt: new Date("2026-02-03T00:00:00.000Z"),
      mutedAt: new Date("2026-02-01T00:00:00.000Z"),
      peer: { id: "seller-1", displayName: "Seller One" },
      blockedByMe: false,
      sendRestriction: null,
    });
  });

  it("shows the seller their own watermarks and the buyer as peer", async () => {
    const { useCase } = build({
      users: [{ id: "buyer-1", displayName: "Buyer One" }],
    });

    const result = await useCase.execute({
      userId: "seller-1",
      conversationId: "conv-1",
    });

    expect(result.peer).toEqual({ id: "buyer-1", displayName: "Buyer One" });
    expect(result.mutedAt).toBeNull();
    expect(result.peerLastReadAt).toBeNull();
  });

  it("answers an unknown Conversation with not found", async () => {
    const { useCase } = build({ found: null });

    await expect(
      useCase.execute({ userId: "buyer-1", conversationId: "conv-1" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a User who is not a participant with NOT_A_PARTICIPANT", async () => {
    const { useCase, listings } = build();

    const error = await useCase
      .execute({ userId: "stranger-1", conversationId: "conv-1" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      details: { reason: CONVERSATION_ERROR_CODES.NOT_A_PARTICIPANT },
    });
    expect(listings.getListingSummary).not.toHaveBeenCalled();
  });

  it("returns a null Listing card, not an error, when the Listing is banned or deleted", async () => {
    const { useCase } = build({ listing: null });

    const result = await useCase.execute({
      userId: "buyer-1",
      conversationId: "conv-1",
    });

    expect(result.listing).toBeNull();
    expect(result.sendRestriction).toBe("listing_unavailable");
  });

  it("returns a null last Message for a Conversation with none", async () => {
    const { useCase } = build({ lastMessage: null });

    const result = await useCase.execute({
      userId: "buyer-1",
      conversationId: "conv-1",
    });

    expect(result.lastMessage).toBeNull();
  });

  it("keeps a peer with no display name", async () => {
    const { useCase } = build({ users: [] });

    const result = await useCase.execute({
      userId: "buyer-1",
      conversationId: "conv-1",
    });

    expect(result.peer).toEqual({ id: "seller-1", displayName: null });
  });

  it.each([
    ["the viewer blocked the peer", { blocks: ["buyer-1>seller-1"] }, "blocked_by_me"],
    ["the Listing is banned", { listing: { ...listing, status: "banned" as const } }, "listing_unavailable"],
    ["chat is off", { listing: { ...listing, allowChat: false } }, "chat_disabled"],
    ["the peer is suspended", { suspended: ["seller-1"] }, "participant_unavailable"],
    ["the peer blocked the viewer", { blocks: ["seller-1>buyer-1"] }, "participant_unavailable"],
  ] as const)(
    "reads the Conversation and reports a restriction when %s",
    async (_name, overrides, expected) => {
      const { useCase } = build(overrides as never);

      const result = await useCase.execute({
        userId: "buyer-1",
        conversationId: "conv-1",
      });

      expect(result.sendRestriction).toBe(expected);
      expect(result.conversation).toBe(conversation);
      expect(result.lastMessage).toBe(lastMessage);
    },
  );

  it.each(["sold", "archived"] as const)(
    "reports no restriction when the Listing is %s, so the composer stays on",
    async (status) => {
      const { useCase } = build({ listing: { ...listing, status } });

      const result = await useCase.execute({
        userId: "buyer-1",
        conversationId: "conv-1",
      });

      expect(result.sendRestriction).toBeNull();
      expect(result.listing).toMatchObject({ status });
    },
  );

  it("exposes block state only from the viewer's side", async () => {
    const { useCase } = build({ blocks: ["seller-1>buyer-1"] });

    const result = await useCase.execute({
      userId: "buyer-1",
      conversationId: "conv-1",
    });

    expect(result.blockedByMe).toBe(false);
    expect(result.sendRestriction).toBe("participant_unavailable");
  });

  it("reports blocked_by_me first when the viewer blocked and was blocked", async () => {
    const { useCase } = build({
      blocks: ["buyer-1>seller-1", "seller-1>buyer-1"],
      suspended: ["seller-1"],
    });

    const result = await useCase.execute({
      userId: "buyer-1",
      conversationId: "conv-1",
    });

    expect(result.blockedByMe).toBe(true);
    expect(result.sendRestriction).toBe("blocked_by_me");
  });
});
