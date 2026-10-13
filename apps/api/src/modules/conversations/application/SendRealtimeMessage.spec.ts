import { describe, expect, it, vi } from "vitest";

import { Message } from "../domain/Message";

import type { SendConversationMessage } from "./SendConversationMessage";
import { SendRealtimeMessage } from "./SendRealtimeMessage";
import { FakeChatAttachmentCleaner } from "./testing/FakeChatAttachmentCleaner";

describe("SendRealtimeMessage", () => {
  it("returns whether the writer created the message", async () => {
    const message = Message.createText({
      id: "message-1",
      conversationId: "conversation-1",
      senderId: "buyer-1",
      clientMessageId: "client-1",
      text: "Hello",
    });
    const sender = {
      execute: vi.fn().mockResolvedValue({
        message,
        listing: null,
        created: false,
      }),
    } as unknown as SendConversationMessage;
    const useCase = new SendRealtimeMessage(sender, new FakeChatAttachmentCleaner());

    const result = await useCase.execute({
      senderId: "buyer-1",
      conversationId: "conversation-1",
      kind: "text",
      text: "Hello",
      clientMessageId: "client-1",
    });

    expect(result).toEqual({ message, created: false });
  });

  it("removes an image's metadata before the socket message is created", async () => {
    const key =
      "chat-attachments/conversation-1/0b9f3c1e-2d4a-4c6b-8e1f-3a5b7c9d1e2f/original.webp";
    const sender = {
      execute: vi.fn(async (input: Parameters<SendConversationMessage["execute"]>[0]) => ({
        message: await input.createMessage({
          id: "message-2",
          conversationId: input.conversationId,
          senderId: input.senderId,
        }),
        listing: null,
        created: true,
      })),
    } as unknown as SendConversationMessage;
    const cleaner = new FakeChatAttachmentCleaner();
    const useCase = new SendRealtimeMessage(sender, cleaner);

    const result = await useCase.execute({
      senderId: "buyer-1",
      conversationId: "conversation-1",
      kind: "image",
      metadata: { key },
    });

    expect(cleaner.cleaned).toEqual([key]);
    expect(result.message.kind).toBe("image");
  });
});
