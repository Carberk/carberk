import { describe, it, expect } from "vitest";
import { Message } from "../domain/Message";
import { toDomainMessage } from "./MessageMapper";

describe("MessageMapper", () => {
  it("maps a text message row to domain", () => {
    const message = toDomainMessage({
      id: "msg-1",
      conversationId: "conv-1",
      senderId: "sender-1",
      kind: "text",
      body: "Hello",
      metadata: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      deletedAt: null,
      clientMessageId: "client-1",
    });

    expect(message.kind).toBe("text");
    expect(message.body).toBe("Hello");
    expect(message.clientMessageId).toBe("client-1");
    expect(message.isDeleted()).toBe(false);
  });

  it("redacts a deleted message", () => {
    const message = toDomainMessage({
      id: "msg-1",
      conversationId: "conv-1",
      senderId: "sender-1",
      kind: "text",
      body: "Hello",
      metadata: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      deletedAt: new Date("2026-01-01T00:01:00Z"),
      clientMessageId: null,
    });

    expect(message.isDeleted()).toBe(true);
    expect(message.body).toBeNull();
    expect(message.metadata).toBeNull();
  });

  it("maps an image message with metadata", () => {
    const message = toDomainMessage({
      id: "msg-img",
      conversationId: "conv-1",
      senderId: "sender-1",
      kind: "image",
      body: null,
      metadata: { key: "chat/image.webp", width: 800, height: 600 },
      createdAt: new Date("2026-01-01T00:00:00Z"),
      deletedAt: null,
      clientMessageId: null,
    });

    expect(message.kind).toBe("image");
    expect(message.metadata).toEqual({
      key: "chat/image.webp",
      width: 800,
      height: 600,
    });
  });

  it("maps a post_ref message with full snapshot", () => {
    const message = toDomainMessage({
      id: "msg-ref",
      conversationId: "conv-1",
      senderId: "sender-1",
      kind: "post_ref",
      body: null,
      metadata: {
        listingId: "listing-2",
        brandId: "brand-1",
        modelId: "model-1",
        year: 2020,
        displayPriceTmt: 100000,
        priceCurrency: "TMT",
        coverMediaKey: "cover.webp",
        status: "active",
      },
      createdAt: new Date("2026-01-01T00:00:00Z"),
      deletedAt: null,
      clientMessageId: null,
    });

    expect(message.kind).toBe("post_ref");
    expect(message.metadata).toEqual({
      listingId: "listing-2",
      brandId: "brand-1",
      modelId: "model-1",
      year: 2020,
      displayPriceTmt: 100000,
      priceCurrency: "TMT",
      coverMediaKey: "cover.webp",
      status: "active",
    });
  });

  it("falls back to null metadata for legacy post_ref rows missing snapshot fields", () => {
    const message = toDomainMessage({
      id: "msg-ref",
      conversationId: "conv-1",
      senderId: "sender-1",
      kind: "post_ref",
      body: null,
      metadata: { listingId: "listing-2" },
      createdAt: new Date("2026-01-01T00:00:00Z"),
      deletedAt: null,
      clientMessageId: null,
    });

    expect(message.kind).toBe("post_ref");
    expect(message.metadata).toBeNull();
  });

  it("redacts image metadata for a deleted image message", () => {
    const message = toDomainMessage({
      id: "msg-img-del",
      conversationId: "conv-1",
      senderId: "sender-1",
      kind: "image",
      body: null,
      metadata: { key: "chat-attachments/conv-1/uuid/original.webp", width: 800, height: 600 },
      createdAt: new Date("2026-01-01T00:00:00Z"),
      deletedAt: new Date("2026-01-01T00:01:00Z"),
      clientMessageId: null,
    });

    expect(message.isDeleted()).toBe(true);
    expect(message.body).toBeNull();
    expect(message.metadata).toBeNull();
  });
});
