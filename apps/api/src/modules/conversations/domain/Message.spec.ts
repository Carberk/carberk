import { describe, it, expect } from "vitest";
import { Message } from "./Message";
import { CONVERSATION_ERROR_CODES, DELETE_WINDOW_MS } from "./types";

function makeTextMessage(
  overrides: Partial<{
    id: string;
    conversationId: string;
    senderId: string;
    text: string;
    createdAt: Date;
  }> = {},
): Message {
  return Message.createText({
    id: "msg-1",
    conversationId: "conv-1",
    senderId: "sender-1",
    text: "Hello",
    ...overrides,
  });
}

describe("Message", () => {
  describe("text validation", () => {
    it("rejects blank-after-trim text", () => {
      expect(() => makeTextMessage({ text: "   " })).toThrowError(
        CONVERSATION_ERROR_CODES.MESSAGE_TEXT_BLANK,
      );
    });

    it("rejects empty text", () => {
      expect(() => makeTextMessage({ text: "" })).toThrowError(
        CONVERSATION_ERROR_CODES.MESSAGE_TEXT_BLANK,
      );
    });

    it("rejects text longer than 1000 chars after trim", () => {
      expect(() => makeTextMessage({ text: "a".repeat(1001) })).toThrowError(
        CONVERSATION_ERROR_CODES.MESSAGE_TEXT_TOO_LONG,
      );
    });

    it("accepts text at exactly 1000 chars after trim", () => {
      const msg = makeTextMessage({ text: "a".repeat(1000) });
      expect(msg.body).toBe("a".repeat(1000));
    });

    it("trims leading and trailing whitespace", () => {
      const msg = makeTextMessage({ text: "  hello world  " });
      expect(msg.body).toBe("hello world");
    });

    it("preserves internal line breaks", () => {
      const text = "line one\nline two\nline three";
      const msg = makeTextMessage({ text });
      expect(msg.body).toBe(text);
    });

    it("accepts text at exactly 1000 chars after trimming whitespace", () => {
      const msg = makeTextMessage({ text: "  " + "a".repeat(1000) + "  " });
      expect(msg.body).toBe("a".repeat(1000));
    });

    it("rejects text that is blank after trimming mixed whitespace", () => {
      expect(() => makeTextMessage({ text: "\n\t \r" })).toThrowError(
        CONVERSATION_ERROR_CODES.MESSAGE_TEXT_BLANK,
      );
    });
  });

  describe("image creation", () => {
    it("creates an image message with metadata", () => {
      const msg = Message.createImage({
        id: "msg-img",
        conversationId: "conv-1",
        senderId: "sender-1",
        metadata: { key: "chat/image.webp", width: 800, height: 600 },
      });
      expect(msg.kind).toBe("image");
      expect(msg.metadata).toEqual({
        key: "chat/image.webp",
        width: 800,
        height: 600,
      });
    });

    it("rejects an image message without a key", () => {
      expect(() =>
        Message.createImage({
          id: "msg-img",
          conversationId: "conv-1",
          senderId: "sender-1",
          metadata: { key: "" },
        }),
      ).toThrowError(CONVERSATION_ERROR_CODES.MESSAGE_KIND_NOT_SUPPORTED);
    });
  });

  function makePostRefMetadata(
    overrides: Partial<{
      listingId: string;
      brandId: string;
      modelId: string;
      displayPriceTmt: number;
      priceCurrency: "TMT" | "USD" | "AED";
      status: "active" | "sold" | "archived" | "banned";
    }> = {},
  ) {
    return {
      listingId: "listing-1",
      brandId: "brand-1",
      modelId: "model-1",
      displayPriceTmt: 100000,
      priceCurrency: "TMT" as const,
      status: "active" as const,
      ...overrides,
    };
  }

  describe("post_ref creation", () => {
    it("creates a post_ref message with a full snapshot", () => {
      const msg = Message.createPostRef({
        id: "msg-ref",
        conversationId: "conv-1",
        senderId: "sender-1",
        metadata: makePostRefMetadata(),
      });
      expect(msg.kind).toBe("post_ref");
      expect(msg.metadata).toEqual(makePostRefMetadata());
    });

    it("rejects a post_ref message without a listingId", () => {
      expect(() =>
        Message.createPostRef({
          id: "msg-ref",
          conversationId: "conv-1",
          senderId: "sender-1",
          metadata: makePostRefMetadata({ listingId: "" }),
        }),
      ).toThrowError(CONVERSATION_ERROR_CODES.MESSAGE_KIND_NOT_SUPPORTED);
    });

    it("rejects a post_ref message with a negative price", () => {
      expect(() =>
        Message.createPostRef({
          id: "msg-ref",
          conversationId: "conv-1",
          senderId: "sender-1",
          metadata: makePostRefMetadata({ displayPriceTmt: -1 }),
        }),
      ).toThrowError(CONVERSATION_ERROR_CODES.MESSAGE_KIND_NOT_SUPPORTED);
    });

    it("rejects a post_ref message with an invalid currency", () => {
      expect(() =>
        Message.createPostRef({
          id: "msg-ref",
          conversationId: "conv-1",
          senderId: "sender-1",
          metadata: makePostRefMetadata({
            priceCurrency: "EUR" as "TMT",
          }),
        }),
      ).toThrowError(CONVERSATION_ERROR_CODES.MESSAGE_KIND_NOT_SUPPORTED);
    });
  });

  describe("soft delete", () => {
    it("marks a message as deleted", () => {
      const msg = makeTextMessage();
      const deleted = msg.markDeleted(new Date("2026-01-01T00:00:00Z"));
      expect(deleted.isDeleted()).toBe(true);
      expect(deleted.deletedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    });

    it("redacts body and metadata", () => {
      const msg = makeTextMessage();
      const redacted = msg.redacted();
      expect(redacted.body).toBeNull();
      expect(redacted.metadata).toBeNull();
    });

    it("allows deletion within 5 minutes", () => {
      const now = new Date("2026-01-01T00:05:00Z");
      const msg = makeTextMessage({ createdAt: new Date("2026-01-01T00:00:01Z") });
      expect(msg.canDelete("sender-1", now)).toBe(true);
    });

    it("rejects deletion after 5 minutes", () => {
      const now = new Date("2026-01-01T00:05:01Z");
      const msg = makeTextMessage({ createdAt: new Date("2026-01-01T00:00:00Z") });
      expect(msg.canDelete("sender-1", now)).toBe(false);
    });

    it("rejects deletion by non-sender", () => {
      const msg = makeTextMessage();
      expect(msg.canDelete("other-user")).toBe(false);
    });

    it("rejects deletion of already deleted message", () => {
      const msg = makeTextMessage().markDeleted();
      expect(msg.canDelete("sender-1")).toBe(false);
    });
  });

  describe("fromExisting", () => {
    it("reconstructs a deleted message", () => {
      const msg = Message.fromExisting({
        id: "msg-1",
        conversationId: "conv-1",
        senderId: "sender-1",
        kind: "text",
        body: "Hello",
        metadata: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        deletedAt: new Date("2026-01-01T00:01:00Z"),
        clientMessageId: "client-1",
      });
      expect(msg.isDeleted()).toBe(true);
      expect(msg.clientMessageId).toBe("client-1");
    });
  });
});
