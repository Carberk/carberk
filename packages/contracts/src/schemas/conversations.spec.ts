import { describe, it, expect } from "vitest";

import {
  ConversationSummarySchema,
  PostRefMessageMetadataSchema,
  SendPostRefMessageRequestSchema,
  SendMessageRequestSchema,
  PresignChatAttachmentRequestSchema,
  PresignChatAttachmentResponseSchema,
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
      coverMediaKey: "cover.jpg",
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
        metadata: { key: "chat/image.jpg" },
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
      contentType: "image/jpeg",
      sizeBytes: 1024,
    });

    expect(parsed.contentType).toBe("image/jpeg");
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
        contentType: "image/jpeg",
        sizeBytes: 6 * 1024 * 1024,
      }),
    ).toThrow();
  });
});

describe("PresignChatAttachmentResponseSchema", () => {
  it("accepts a valid response", () => {
    const parsed = PresignChatAttachmentResponseSchema.parse({
      uploadUrl: "https://media.auto.tm/presigned/chat-attachments/conv-1/uuid/original.jpg",
      key: "chat-attachments/conv-1/uuid/original.jpg",
      expiresIn: 600,
      maxSizeBytes: 5 * 1024 * 1024,
    });

    expect(parsed.key).toBe("chat-attachments/conv-1/uuid/original.jpg");
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

  it("keeps the other participant's id and display name", () => {
    const parsed = ConversationSummarySchema.parse(baseSummary);

    expect(parsed.peer).toEqual({
      id: "550e8400-e29b-41d4-a716-4466554400b2",
      displayName: "Aman",
    });
  });

  it("accepts a null display name for the other participant", () => {
    const parsed = ConversationSummarySchema.parse({
      ...baseSummary,
      peer: { ...baseSummary.peer, displayName: null },
    });

    expect(parsed.peer.displayName).toBeNull();
  });

  it("requires the peer and the viewer's block state", () => {
    const { peer: _peer, ...withoutPeer } = baseSummary;
    const { blockedByMe: _blocked, ...withoutBlock } = baseSummary;

    expect(ConversationSummarySchema.safeParse(withoutPeer).success).toBe(false);
    expect(ConversationSummarySchema.safeParse(withoutBlock).success).toBe(false);
  });

  it("keeps contact data off the peer even when a server sends it", () => {
    const parsed = ConversationSummarySchema.parse({
      ...baseSummary,
      peer: { ...baseSummary.peer, phone: "+99365000000", email: "a@b.tm" },
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
