import { describe, it, expect } from "vitest";

import {
  ConversationIdParamSchema,
  ConversationSummarySchema,
  GetConversationResponseSchema,
  SendRestrictionSchema,
  PostRefMessageMetadataSchema,
  SendPostRefMessageRequestSchema,
  SendMessageRequestSchema,
  PresignChatAttachmentRequestSchema,
  PresignChatAttachmentResponseSchema,
  UnreadCountResponseSchema,
} from "./conversations";

describe("PostRefMessageMetadataSchema", () => {
  it("accepts a full post_ref snapshot with availability", () => {
    const parsed = PostRefMessageMetadataSchema.parse({
      listingId: "550e8400-e29b-41d4-a716-446655440000",
      brandId: "550e8400-e29b-41d4-a716-446655440001",
      modelId: "550e8400-e29b-41d4-a716-446655440002",
      year: 2021,
      displayPriceTmt: 200000,
      priceCurrency: "TMT",
      coverMediaKey: "cover.webp",
      status: "active",
      available: true,
    });

    expect(parsed.listingId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(parsed.available).toBe(true);
  });

  it("defaults available to true when omitted", () => {
    const parsed = PostRefMessageMetadataSchema.parse({
      listingId: "550e8400-e29b-41d4-a716-446655440000",
      brandId: "550e8400-e29b-41d4-a716-446655440001",
      modelId: "550e8400-e29b-41d4-a716-446655440002",
      displayPriceTmt: 200000,
      priceCurrency: "TMT",
      status: "sold",
    });

    expect(parsed.available).toBe(true);
  });

  it("rejects a snapshot with an invalid currency", () => {
    expect(() =>
      PostRefMessageMetadataSchema.parse({
        listingId: "550e8400-e29b-41d4-a716-446655440000",
        brandId: "550e8400-e29b-41d4-a716-446655440001",
        modelId: "550e8400-e29b-41d4-a716-446655440002",
        displayPriceTmt: 200000,
        priceCurrency: "EUR",
        status: "active",
      }),
    ).toThrow();
  });

  it("rejects a snapshot missing required fields", () => {
    expect(() =>
      PostRefMessageMetadataSchema.parse({
        listingId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).toThrow();
  });
});

describe("SendPostRefMessageRequestSchema", () => {
  it("accepts a listingId reference", () => {
    const parsed = SendPostRefMessageRequestSchema.parse({
      metadata: { listingId: "550e8400-e29b-41d4-a716-446655440000" },
    });

    expect(parsed.metadata.listingId).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("rejects arbitrary snapshot fields from the client", () => {
    expect(() =>
      SendPostRefMessageRequestSchema.parse({
        metadata: {
          listingId: "550e8400-e29b-41d4-a716-446655440000",
          displayPriceTmt: 1,
        },
      }),
    ).toThrow();
  });
});

describe("SendMessageRequestSchema", () => {
  it("accepts text and image kinds", () => {
    expect(() =>
      SendMessageRequestSchema.parse({
        kind: "text",
        text: "Hello",
      }),
    ).not.toThrow();

    expect(() =>
      SendMessageRequestSchema.parse({
        kind: "image",
        metadata: { key: "chat/image.webp" },
      }),
    ).not.toThrow();
  });

  it("does not accept post_ref through the generic rich send route", () => {
    expect(() =>
      SendMessageRequestSchema.parse({
        kind: "post_ref",
        metadata: { listingId: "550e8400-e29b-41d4-a716-446655440000" },
      }),
    ).toThrow();
  });
});

describe("PresignChatAttachmentRequestSchema", () => {
  it("accepts a valid jpeg request", () => {
    const parsed = PresignChatAttachmentRequestSchema.parse({
      contentType: "image/webp",
      sizeBytes: 1024,
    });

    expect(parsed.contentType).toBe("image/webp");
    expect(parsed.sizeBytes).toBe(1024);
  });

  it("accepts webp", () => {
    const parsed = PresignChatAttachmentRequestSchema.parse({
      contentType: "image/webp",
      sizeBytes: 1024,
    });

    expect(parsed.contentType).toBe("image/webp");
  });

  it("rejects unsupported content types", () => {
    expect(() =>
      PresignChatAttachmentRequestSchema.parse({
        contentType: "image/png",
        sizeBytes: 1024,
      }),
    ).toThrow();
  });

  it("rejects oversized requests", () => {
    expect(() =>
      PresignChatAttachmentRequestSchema.parse({
        contentType: "image/webp",
        sizeBytes: 6 * 1024 * 1024,
      }),
    ).toThrow();
  });
});

describe("PresignChatAttachmentResponseSchema", () => {
  it("accepts a valid response", () => {
    const parsed = PresignChatAttachmentResponseSchema.parse({
      uploadUrl: "https://media.auto.tm/presigned/chat-attachments/conv-1/uuid/original.webp",
      key: "chat-attachments/conv-1/uuid/original.webp",
      expiresIn: 600,
      maxSizeBytes: 5 * 1024 * 1024,
    });

    expect(parsed.key).toBe("chat-attachments/conv-1/uuid/original.webp");
    expect(parsed.expiresIn).toBe(600);
  });
});

describe("ConversationSummarySchema", () => {
  const baseSummary = {
    id: "550e8400-e29b-41d4-a716-446655440001",
    listing: null,
    buyerId: "550e8400-e29b-41d4-a716-4466554400b1",
    sellerId: "550e8400-e29b-41d4-a716-4466554400b2",
    myRole: "buyer" as const,
    updatedAt: "2026-07-01T10:00:00.000Z",
    peer: {
      id: "550e8400-e29b-41d4-a716-4466554400b2",
      displayName: "Aman",
      nameNumber: 2057,
      avatarIndex: 3,
      avatarKey: null,
      deleted: false,
    },
    blockedByMe: false,
  };

  it("accepts a summary without mutedAt (pre-#246 servers)", () => {
    const parsed = ConversationSummarySchema.parse(baseSummary);

    expect(parsed.mutedAt).toBeUndefined();
  });

  it("accepts a summary with a null or timestamped mutedAt", () => {
    expect(
      ConversationSummarySchema.parse({ ...baseSummary, mutedAt: null })
        .mutedAt,
    ).toBeNull();
    expect(
      ConversationSummarySchema.parse({
        ...baseSummary,
        mutedAt: "2026-07-10T08:00:00.000Z",
      }).mutedAt,
    ).toBe("2026-07-10T08:00:00.000Z");
  });

  it("keeps the other participant's id and public identity", () => {
    const parsed = ConversationSummarySchema.parse(baseSummary);

    expect(parsed.peer).toEqual({
      id: "550e8400-e29b-41d4-a716-4466554400b2",
      displayName: "Aman",
      nameNumber: 2057,
      avatarIndex: 3,
      avatarKey: null,
      deleted: false,
    });
  });

  it("requires the peer's name number, avatar index, photo key and deleted flag", () => {
    for (const field of ["nameNumber", "avatarIndex", "avatarKey", "deleted"]) {
      expect(
        ConversationSummarySchema.safeParse({
          ...baseSummary,
          peer: { ...baseSummary.peer, [field]: undefined },
        }).success,
        field,
      ).toBe(false);
    }
  });

  it("marks a deleted participant, who keeps a number but no name", () => {
    const parsed = ConversationSummarySchema.parse({
      ...baseSummary,
      peer: { ...baseSummary.peer, displayName: null, deleted: true },
    });

    expect(parsed.peer.deleted).toBe(true);
    expect(parsed.peer.nameNumber).toBe(2057);
  });

  it("accepts a null display name for the other participant", () => {
    const parsed = ConversationSummarySchema.parse({
      ...baseSummary,
      peer: { ...baseSummary.peer, displayName: null },
    });

    expect(parsed.peer.displayName).toBeNull();
  });

  it("requires the peer and the viewer's block state", () => {
    expect(
      ConversationSummarySchema.safeParse({ ...baseSummary, peer: undefined })
        .success,
    ).toBe(false);
    expect(
      ConversationSummarySchema.safeParse({
        ...baseSummary,
        blockedByMe: undefined,
      }).success,
    ).toBe(false);
  });

  it("keeps contact data off the peer even when a server sends it", () => {
    const parsed = ConversationSummarySchema.parse({
      ...baseSummary,
      peer: {
        ...baseSummary.peer,
        phone: "+99365000000",
        email: "a@b.tm",
        role: "seller",
        uploadId: "550e8400-e29b-41d4-a716-446655440009",
      },
    });

    expect(parsed.peer).toEqual(baseSummary.peer);
  });

  it("carries blockedByMe as a boolean", () => {
    expect(
      ConversationSummarySchema.parse({ ...baseSummary, blockedByMe: true })
        .blockedByMe,
    ).toBe(true);
    expect(
      ConversationSummarySchema.safeParse({ ...baseSummary, blockedByMe: "yes" })
        .success,
    ).toBe(false);
  });
});

describe("GetConversationResponseSchema", () => {
  const summary = {
    id: "550e8400-e29b-41d4-a716-446655440001",
    listing: null,
    buyerId: "550e8400-e29b-41d4-a716-4466554400b1",
    sellerId: "550e8400-e29b-41d4-a716-4466554400b2",
    myRole: "buyer" as const,
    updatedAt: "2026-07-01T10:00:00.000Z",
    peer: {
      id: "550e8400-e29b-41d4-a716-4466554400b2",
      displayName: "Aman",
      nameNumber: 2057,
      avatarIndex: 3,
      avatarKey: null,
      deleted: false,
    },
    blockedByMe: false,
  };

  it("is a list summary plus the send restriction", () => {
    const parsed = GetConversationResponseSchema.parse({
      ...summary,
      sendRestriction: null,
    });

    expect(parsed.sendRestriction).toBeNull();
    expect(parsed.peer).toEqual(summary.peer);
    expect(parsed.unreadCount).toBe(0);
  });

  it("requires sendRestriction to be stated, null when a send would be accepted", () => {
    expect(GetConversationResponseSchema.safeParse(summary).success).toBe(
      false,
    );
  });

  it.each([
    "blocked_by_me",
    "listing_unavailable",
    "chat_disabled",
    "participant_unavailable",
  ] as const)("accepts the %s restriction", (sendRestriction) => {
    expect(
      GetConversationResponseSchema.parse({ ...summary, sendRestriction })
        .sendRestriction,
    ).toBe(sendRestriction);
  });

  it("rejects a restriction that names which participant is unavailable", () => {
    expect(SendRestrictionSchema.safeParse("peer_suspended").success).toBe(
      false,
    );
    expect(SendRestrictionSchema.safeParse("blocked_by_peer").success).toBe(
      false,
    );
  });
});

describe("ConversationIdParamSchema", () => {
  it("accepts a UUID and rejects a malformed ID", () => {
    expect(
      ConversationIdParamSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440001",
      }).success,
    ).toBe(true);
    expect(ConversationIdParamSchema.safeParse({ id: "not-a-uuid" }).success).toBe(
      false,
    );
  });
});

describe("UnreadCountResponseSchema", () => {
  it("accepts a whole, non-negative count", () => {
    expect(UnreadCountResponseSchema.parse({ count: 0 })).toEqual({ count: 0 });
    expect(UnreadCountResponseSchema.parse({ count: 120 })).toEqual({
      count: 120,
    });
  });

  it.each([{ count: -1 }, { count: 1.5 }, { count: "3" }, {}])(
    "rejects %j",
    (body) => {
      expect(UnreadCountResponseSchema.safeParse(body).success).toBe(false);
    },
  );
});
