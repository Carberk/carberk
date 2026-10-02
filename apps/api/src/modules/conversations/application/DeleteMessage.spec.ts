import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";

import { Conversation } from "../domain/Conversation";
import { Message } from "../domain/Message";
import type { ConversationRepository } from "../domain/ports/ConversationRepository";
import type {
  IdentityCheckPort,
  IdentityReadPort,
} from "../../identity/identity.public";

import { ConversationAccessPolicy } from "./ConversationAccessPolicy";
import { DeleteMessage } from "./DeleteMessage";

class FakeConversationRepository implements ConversationRepository {
  conversations: Conversation[] = [];
  messages: Message[] = [];

  async findById(id: string): Promise<Conversation | null> {
    return this.conversations.find((c) => c.id === id) ?? null;
  }

  async findByListingAndBuyer(): Promise<Conversation | null> {
    return null;
  }

  async save(conversation: Conversation): Promise<void> {
    this.conversations.push(conversation);
  }

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

  async findMessageByClientMessageId(): Promise<Message | null> {
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

  async softDeleteMessage(
    messageId: string,
    userId: string,
    deletedAt: Date,
  ): Promise<Message | null> {
    const index = this.messages.findIndex(
      (m) => m.id === messageId && m.senderId === userId && !m.isDeleted(),
    );
    if (index === -1) return null;
    this.messages[index] = this.messages[index]!.markDeleted(deletedAt);
    return this.messages[index];
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

function makeUseCase(
  repo?: FakeConversationRepository,
  options: { deletionScheduledFor?: string } = {},
) {
  const identityCheck = {
    isSuspended: vi.fn().mockResolvedValue(false),
    isDeletionScheduled: vi
      .fn()
      .mockImplementation(
        async (userId: string) => userId === options.deletionScheduledFor,
      ),
  } as unknown as IdentityCheckPort;
  const identityRead = {
    isUserBlockedBy: vi.fn().mockResolvedValue(false),
  } as unknown as IdentityReadPort;
  return new DeleteMessage(
    repo ?? new FakeConversationRepository(),
    new ConversationAccessPolicy(identityCheck, identityRead),
  );
}

function seedConversation(repo: FakeConversationRepository) {
  const c = Conversation.create({
    id: "conv-1",
    listingId: "listing-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
  });
  repo.conversations.push(c);
  return c;
}

function seedTextMessage(
  repo: FakeConversationRepository,
  overrides?: Partial<{ id: string; senderId: string; createdAt: Date }>,
) {
  const msg = Message.createText({
    id: "msg-1",
    conversationId: "conv-1",
    senderId: "buyer-1",
    text: "Hello",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
  repo.messages.push(msg);
  return msg;
}

describe("DeleteMessage", () => {
  let repo: FakeConversationRepository;

  beforeEach(() => {
    repo = new FakeConversationRepository();
  });

  it("deletes own message within 5 minutes", async () => {
    seedConversation(repo);
    seedTextMessage(repo, {
      createdAt: new Date(Date.now() - 60_000),
    });
    const uc = makeUseCase(repo);

    const result = await uc.execute({
      userId: "buyer-1",
      conversationId: "conv-1",
      messageId: "msg-1",
    });

    expect(result.messageId).toBe("msg-1");
    expect(result.deletedAt).toBeInstanceOf(Date);
  });

  it("rejects deleting other user's message", async () => {
    seedConversation(repo);
    seedTextMessage(repo, { senderId: "seller-1" });
    const uc = makeUseCase(repo);

    await expect(
      uc.execute({
        userId: "buyer-1",
        conversationId: "conv-1",
        messageId: "msg-1",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects deleting message after 5 minute window", async () => {
    seedConversation(repo);
    seedTextMessage(repo, {
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    const uc = makeUseCase(repo);

    // The fake does not enforce the window; the use-case does via Message.canDelete,
    // which compares against new Date() by default. We cannot easily freeze time here,
    // so we seed a message far enough in the past.
    const veryOld = Message.createText({
      id: "msg-old",
      conversationId: "conv-1",
      senderId: "buyer-1",
      text: "Old",
      createdAt: new Date("2020-01-01T00:00:00Z"),
    });
    repo.messages = [veryOld];

    await expect(
      uc.execute({
        userId: "buyer-1",
        conversationId: "conv-1",
        messageId: "msg-old",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects deleting message in wrong conversation", async () => {
    seedConversation(repo);
    seedTextMessage(repo);
    const uc = makeUseCase(repo);

    await expect(
      uc.execute({
        userId: "buyer-1",
        conversationId: "conv-other",
        messageId: "msg-1",
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects non-participant user", async () => {
    seedConversation(repo);
    seedTextMessage(repo);
    const uc = makeUseCase(repo);

    await expect(
      uc.execute({
        userId: "random-user",
        conversationId: "conv-1",
        messageId: "msg-1",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("refuses a User whose account deletion is scheduled and leaves the message", async () => {
    seedConversation(repo);
    seedTextMessage(repo, { createdAt: new Date(Date.now() - 60_000) });
    const uc = makeUseCase(repo, { deletionScheduledFor: "buyer-1" });

    await expect(
      uc.execute({
        userId: "buyer-1",
        conversationId: "conv-1",
        messageId: "msg-1",
      }),
    ).rejects.toMatchObject({
      response: {
        code: "FORBIDDEN",
        details: { reason: "ACCOUNT_DELETION_PENDING" },
      },
    });

    expect(repo.messages[0]!.isDeleted()).toBe(false);
  });
});
