import { describe, expect, it } from "vitest";

import type {
  ChatAttachmentCleaner,
  ChatAttachmentCleanResult,
} from "../domain/ports/ChatAttachmentCleaner";
import { CONVERSATION_ERROR_CODES, ConversationDomainError } from "../domain/types";

import { createCleanRichMessage } from "./RichMessageFactory";
import { FakeChatAttachmentCleaner } from "./testing/FakeChatAttachmentCleaner";

const CONVERSATION_ID = "7d0c1a52-3b64-4e8f-9a17-5c2e8f1b6d90";
const KEY = `chat-attachments/${CONVERSATION_ID}/0b9f3c1e-2d4a-4c6b-8e1f-3a5b7c9d1e2f/original.webp`;

function cleanerReturning(result: ChatAttachmentCleanResult) {
  const cleaner = new FakeChatAttachmentCleaner();
  cleaner.result = result;
  return cleaner;
}

function imageMessage(cleaner: ChatAttachmentCleaner, key: string) {
  return createCleanRichMessage(cleaner, {
    id: "msg-1",
    conversationId: CONVERSATION_ID,
    senderId: "buyer-1",
    input: { kind: "image", metadata: { key, width: 800, height: 600 } },
  });
}

async function rejection(promise: Promise<unknown>): Promise<ConversationDomainError> {
  const error = await promise.then(
    () => null,
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(ConversationDomainError);
  return error as ConversationDomainError;
}

describe("createCleanRichMessage", () => {
  it("cleans the stored image before the image message exists", async () => {
    const cleaner = cleanerReturning("clean");

    const message = await imageMessage(cleaner, KEY);

    expect(cleaner.cleaned).toEqual([KEY]);
    expect(message.kind).toBe("image");
    expect(message.metadata).toEqual({ key: KEY, width: 800, height: 600 });
  });

  it.each<ChatAttachmentCleanResult>(["missing", "invalid"])(
    "refuses an image message whose stored image is %s",
    async (result) => {
      const cleaner = cleanerReturning(result);

      const error = await rejection(imageMessage(cleaner, KEY));

      expect(error.code).toBe(CONVERSATION_ERROR_CODES.IMAGE_ATTACHMENT_NOT_USABLE);
    },
  );

  it.each([
    ["another Conversation's attachment", "chat-attachments/11111111-2222-4333-8444-555555555555/0b9f3c1e-2d4a-4c6b-8e1f-3a5b7c9d1e2f/original.webp"],
    ["a Listing photo", "pending/0b9f3c1e-2d4a-4c6b-8e1f-3a5b7c9d1e2f/original.webp"],
    ["a path that climbs out of the Conversation", `chat-attachments/${CONVERSATION_ID}/../other/original.webp`],
    ["an absolute URL", "https://example.com/original.webp"],
  ])("refuses %s without touching storage", async (_label, key) => {
    const cleaner = cleanerReturning("clean");

    const error = await rejection(imageMessage(cleaner, key));

    expect(error.code).toBe(CONVERSATION_ERROR_CODES.IMAGE_ATTACHMENT_NOT_USABLE);
    expect(cleaner.cleaned).toEqual([]);
  });

  it("creates a text message without touching storage", async () => {
    const cleaner = cleanerReturning("clean");

    const message = await createCleanRichMessage(cleaner, {
      id: "msg-2",
      conversationId: CONVERSATION_ID,
      senderId: "buyer-1",
      input: { kind: "text", text: "Hello" },
    });

    expect(message.kind).toBe("text");
    expect(cleaner.cleaned).toEqual([]);
  });
});
