import { describe, expect, it, vi } from "vitest";

import type { IdentityCheckPort, IdentityReadPort } from "../../identity/identity.public";
import type {
  ListingSummary,
  ListingsReadPort,
} from "../../listings/domain/ports/ListingsReadPort";
import { Conversation } from "../domain/Conversation";
import { Message } from "../domain/Message";
import {
  MessageAlreadySavedError,
  type ConversationRepository,
} from "../domain/ports/ConversationRepository";
import type { MessageEventPublisher } from "../domain/ports/MessageEventPublisher";

import { ConversationAccessPolicy } from "./ConversationAccessPolicy";
import { ConversationMessageCommitter } from "./ConversationMessageCommitter";
import { ConversationSendPolicy } from "./ConversationSendPolicy";
import { SendConversationMessage } from "./SendConversationMessage";

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

function textMessage(clientMessageId = "client-1") {
  return Message.createText({
    id: "message-1",
    conversationId: conversation.id,
    senderId: conversation.buyerId,
    clientMessageId,
    text: "Hello",
  });
}

function buildUseCase(overrides: {
  existing?: Message | null;
  saveMessage?: (message: Message) => Promise<void>;
  senderDeletionScheduled?: boolean;
} = {}) {
  const calls: string[] = [];
  const repository = {
    findById: vi.fn().mockResolvedValue(conversation),
    findMessageByClientMessageId: vi
      .fn()
      .mockResolvedValue(overrides.existing ?? null),
    saveMessage:
      overrides.saveMessage ??
      vi.fn(async () => {
        calls.push("save");
      }),
  } as unknown as ConversationRepository;
  const listings = {
    getListingSummary: vi.fn().mockResolvedValue(listing),
  } as unknown as ListingsReadPort;
  const identityCheck = {
    isSuspended: vi.fn().mockResolvedValue(false),
    isDeletionScheduled: vi
      .fn()
      .mockResolvedValue(overrides.senderDeletionScheduled ?? false),
  } as unknown as IdentityCheckPort;
  const identityRead = {
    isUserBlockedBy: vi.fn().mockResolvedValue(false),
  } as unknown as IdentityReadPort;
  const messageEvents = {
    emitMessageSent: vi.fn(async () => {
      calls.push("publish");
    }),
  } as unknown as MessageEventPublisher;

  return {
    calls,
    repository,
    messageEvents,
    useCase: new SendConversationMessage(
      repository,
      new ConversationSendPolicy(
        repository,
        listings,
        new ConversationAccessPolicy(identityCheck, identityRead),
      ),
      new ConversationMessageCommitter(repository, messageEvents),
    ),
  };
}

describe("SendConversationMessage", () => {
  it("saves a new message before publishing MessageSent", async () => {
    const { calls, useCase } = buildUseCase();

    const result = await useCase.execute({
      senderId: conversation.buyerId,
      conversationId: conversation.id,
      clientMessageId: "client-1",
      createMessage: () => textMessage(),
    });

    expect(result.created).toBe(true);
    expect(calls).toEqual(["save", "publish"]);
  });

  it("returns a sequential duplicate without creating, saving, or publishing", async () => {
    const existing = textMessage();
    const { repository, messageEvents, useCase } = buildUseCase({ existing });
    const createMessage = vi.fn(() => textMessage());

    const result = await useCase.execute({
      senderId: conversation.buyerId,
      conversationId: conversation.id,
      clientMessageId: "client-1",
      createMessage,
    });

    expect(result).toMatchObject({ message: existing, created: false });
    expect(createMessage).not.toHaveBeenCalled();
    expect(repository.saveMessage).not.toHaveBeenCalled();
    expect(messageEvents.emitMessageSent).not.toHaveBeenCalled();
  });

  it("returns the winning message when a concurrent duplicate wins the save race", async () => {
    const winner = textMessage();
    const { messageEvents, useCase } = buildUseCase({
      saveMessage: vi.fn(async () => {
        throw new MessageAlreadySavedError(winner);
      }),
    });

    const result = await useCase.execute({
      senderId: conversation.buyerId,
      conversationId: conversation.id,
      clientMessageId: "client-1",
      createMessage: () => textMessage(),
    });

    expect(result).toMatchObject({ message: winner, created: false });
    expect(messageEvents.emitMessageSent).not.toHaveBeenCalled();
  });

  it("refuses a sender whose account deletion is scheduled, before saving or publishing", async () => {
    const { repository, messageEvents, useCase } = buildUseCase({
      senderDeletionScheduled: true,
    });
    const createMessage = vi.fn(() => textMessage());

    await expect(
      useCase.execute({
        senderId: conversation.buyerId,
        conversationId: conversation.id,
        clientMessageId: "client-1",
        createMessage,
      }),
    ).rejects.toMatchObject({
      response: {
        code: "FORBIDDEN",
        details: { reason: "ACCOUNT_DELETION_PENDING" },
      },
    });

    expect(createMessage).not.toHaveBeenCalled();
    expect(repository.saveMessage).not.toHaveBeenCalled();
    expect(messageEvents.emitMessageSent).not.toHaveBeenCalled();
  });
});
