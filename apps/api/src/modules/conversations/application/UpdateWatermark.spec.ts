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
import { UpdateWatermark } from "./UpdateWatermark";

class FakeConversationRepository implements ConversationRepository {
  conversations: Conversation[] = [];
  watermarks: Record<
    string,
    { mutedAt: Date | null; lastReadAt: Date | null; lastDeliveredAt: Date | null }
  > = {};

  private key(userId: string, conversationId: string) {
    return `${userId}:${conversationId}`;
  }

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

  async findMessageById(): Promise<null> {
    return null;
  }

  async findMessageByClientMessageId(): Promise<null> {
    return null;
  }

  async saveMessage(): Promise<void> {}

  async updateWatermark(
    userId: string,
    conversationId: string,
    data: { lastReadAt?: Date; lastDeliveredAt?: Date },
  ): Promise<{
    mutedAt: Date | null;
    lastReadAt: Date | null;
    lastDeliveredAt: Date | null;
  }> {
    const key = this.key(userId, conversationId);
    const existing = this.watermarks[key] ?? {
      mutedAt: null,
      lastReadAt: null,
      lastDeliveredAt: null,
    };
    const updated = {
      ...existing,
      ...(data.lastReadAt !== undefined ? { lastReadAt: data.lastReadAt } : {}),
      ...(data.lastDeliveredAt !== undefined
        ? { lastDeliveredAt: data.lastDeliveredAt }
        : {}),
    };
    this.watermarks[key] = updated;
    return updated;
  }

  async getParticipantState(
    userId: string,
    conversationId: string,
  ): Promise<{
    mutedAt: Date | null;
    lastReadAt: Date | null;
    lastDeliveredAt: Date | null;
  } | null> {
    return this.watermarks[this.key(userId, conversationId)] ?? null;
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
      const entries = Object.entries(this.watermarks)
        .filter(([key]) => key.endsWith(`:${conversationId}`))
        .map(([key, state]) => {
          const userId = key.replace(`:${conversationId}`, "");
          return { userId, ...state };
        });
      if (entries.length > 0) {
        map.set(conversationId, entries);
      }
    }
    return map;
  }

  async muteConversation(): Promise<{
    mutedAt: Date | null;
    lastReadAt: Date | null;
    lastDeliveredAt: Date | null;
  }> {
    return { mutedAt: null, lastReadAt: null, lastDeliveredAt: null };
  }

  async softDeleteMessage(): Promise<Message | null> {
    return null;
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
  return new UpdateWatermark(
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
  repo.watermarks["buyer-1:conv-1"] = {
    mutedAt: null,
    lastReadAt: null,
    lastDeliveredAt: null,
  };
  return c;
}

describe("UpdateWatermark", () => {
  let repo: FakeConversationRepository;

  beforeEach(() => {
    repo = new FakeConversationRepository();
  });

  it("updates lastReadAt for a participant", async () => {
    seedConversation(repo);
    const uc = makeUseCase(repo);

    const result = await uc.execute({
      userId: "buyer-1",
      conversationId: "conv-1",
      lastReadAt: "2026-01-01T00:00:00Z",
    });

    expect(result.lastReadAt).toEqual(new Date("2026-01-01T00:00:00Z"));
  });

  it("updates lastDeliveredAt for a participant", async () => {
    seedConversation(repo);
    const uc = makeUseCase(repo);

    const result = await uc.execute({
      userId: "buyer-1",
      conversationId: "conv-1",
      lastDeliveredAt: "2026-01-01T00:00:00Z",
    });

    expect(result.lastDeliveredAt).toEqual(new Date("2026-01-01T00:00:00Z"));
  });

  it("rejects non-existent conversation", async () => {
    const uc = makeUseCase(repo);

    await expect(
      uc.execute({
        userId: "buyer-1",
        conversationId: "missing",
        lastReadAt: "2026-01-01T00:00:00Z",
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects non-participant user", async () => {
    seedConversation(repo);
    const uc = makeUseCase(repo);

    await expect(
      uc.execute({
        userId: "random-user",
        conversationId: "conv-1",
        lastReadAt: "2026-01-01T00:00:00Z",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects moving lastReadAt backwards", async () => {
    seedConversation(repo);
    repo.watermarks["buyer-1:conv-1"]!.lastReadAt = new Date(
      "2026-01-02T00:00:00Z",
    );
    const uc = makeUseCase(repo);

    await expect(
      uc.execute({
        userId: "buyer-1",
        conversationId: "conv-1",
        lastReadAt: "2026-01-01T00:00:00Z",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("refuses a User whose account deletion is scheduled and keeps the watermark", async () => {
    seedConversation(repo);
    const uc = makeUseCase(repo, { deletionScheduledFor: "buyer-1" });

    await expect(
      uc.execute({
        userId: "buyer-1",
        conversationId: "conv-1",
        lastReadAt: "2026-01-01T00:00:00Z",
      }),
    ).rejects.toMatchObject({
      response: {
        code: "FORBIDDEN",
        details: { reason: "ACCOUNT_DELETION_PENDING" },
      },
    });

    expect(repo.watermarks["buyer-1:conv-1"]!.lastReadAt).toBeNull();
  });
});
