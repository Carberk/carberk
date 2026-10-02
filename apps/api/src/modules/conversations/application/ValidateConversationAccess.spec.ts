import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
import { AdminSchemas } from "@auto-tm/contracts";

import { Conversation } from "../domain/Conversation";
import type { ConversationRepository } from "../domain/ports/ConversationRepository";
import type { IdentityCheckPort, IdentityReadPort } from "../../identity/identity.public";
import type { Message } from "../domain/Message";

import { ValidateConversationAccess } from "./ValidateConversationAccess";
import { ConversationAccessPolicy } from "./ConversationAccessPolicy";

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

  async softDeleteMessage(): Promise<Message | null> {
    return null;
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

class FakeIdentityCheckPort implements IdentityCheckPort {
  suspendedUsers = new Set<string>();

  async isAdmin(): Promise<boolean> {
    return false;
  }

  async isInDealership(): Promise<boolean> {
    return false;
  }

  async isSuspended(userId: string): Promise<boolean> {
    return this.suspendedUsers.has(userId);
  }

  async isDeletionScheduled(): Promise<boolean> {
    return false;
  }

  suspend(userId: string) {
    this.suspendedUsers.add(userId);
  }
}

class FakeIdentityReadPort implements IdentityReadPort {
  blockedPairs = new Set<string>();

  async findUserById(): Promise<null> {
    return null;
  }

  async findUsersByIds(): Promise<[]> {
    return [];
  }

  async findBlockedUserIds(): Promise<string[]> {
    return [];
  }

  async isUserBlockedBy(blockerId: string, blockedId: string): Promise<boolean> {
    return this.blockedPairs.has(`${blockerId}:${blockedId}`);
  }

  block(blockerId: string, blockedId: string) {
    this.blockedPairs.add(`${blockerId}:${blockedId}`);
  }
}

function makeUseCase(
  repo?: FakeConversationRepository,
  identityCheck?: FakeIdentityCheckPort,
  identityRead?: FakeIdentityReadPort,
) {
  const effectiveIdentityCheck = identityCheck ?? new FakeIdentityCheckPort();
  const effectiveIdentityRead = identityRead ?? new FakeIdentityReadPort();
  const accessPolicy = new ConversationAccessPolicy(
    effectiveIdentityCheck,
    effectiveIdentityRead,
  );
  return new ValidateConversationAccess(
    repo ?? new FakeConversationRepository(),
    accessPolicy,
  );
}

function seedConversation(
  repo: FakeConversationRepository,
  overrides?: Partial<Conversation>,
) {
  const c = Conversation.create({
    id: "conv-1",
    listingId: "listing-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    ...overrides,
  });
  repo.conversations.push(c);
  return c;
}

describe("ValidateConversationAccess", () => {
  let repo: FakeConversationRepository;

  beforeEach(() => {
    repo = new FakeConversationRepository();
  });

  it("allows a participant to access the conversation", async () => {
    const conversation = seedConversation(repo);
    const uc = makeUseCase(repo);

    const result = await uc.execute({
      userId: "buyer-1",
      conversationId: "conv-1",
    });

    expect(result.id).toBe(conversation.id);
  });

  it("rejects when the conversation does not exist", async () => {
    const uc = makeUseCase(repo);

    await expect(
      uc.execute({ userId: "buyer-1", conversationId: "conv-missing" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects a non-participant", async () => {
    seedConversation(repo);
    const uc = makeUseCase(repo);

    await expect(
      uc.execute({ userId: "random-user", conversationId: "conv-1" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects when the user is suspended", async () => {
    seedConversation(repo);
    const identityCheck = new FakeIdentityCheckPort();
    identityCheck.suspend("buyer-1");
    const uc = makeUseCase(repo, identityCheck);

    await expect(
      uc.execute({ userId: "buyer-1", conversationId: "conv-1" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects when the other participant is suspended", async () => {
    seedConversation(repo);
    const identityCheck = new FakeIdentityCheckPort();
    identityCheck.suspend("seller-1");
    const uc = makeUseCase(repo, identityCheck);

    await expect(
      uc.execute({ userId: "buyer-1", conversationId: "conv-1" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects when the user has blocked the other participant", async () => {
    seedConversation(repo);
    const identityRead = new FakeIdentityReadPort();
    identityRead.block("buyer-1", "seller-1");
    const uc = makeUseCase(repo, undefined, identityRead);

    await expect(
      uc.execute({ userId: "buyer-1", conversationId: "conv-1" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects when the user is blocked by the other participant", async () => {
    seedConversation(repo);
    const identityRead = new FakeIdentityReadPort();
    identityRead.block("seller-1", "buyer-1");
    const uc = makeUseCase(repo, undefined, identityRead);

    await expect(
      uc.execute({ userId: "buyer-1", conversationId: "conv-1" }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("returns the same conversation instance", async () => {
    seedConversation(repo);
    const uc = makeUseCase(repo);

    const result = await uc.execute({
      userId: "seller-1",
      conversationId: "conv-1",
    });

    expect(result.isParticipant("seller-1")).toBe(true);
    expect(result.isParticipant("buyer-1")).toBe(true);
  });

  it("surfaces USER_SUSPENDED reason via admin error constants", async () => {
    seedConversation(repo);
    const identityCheck = new FakeIdentityCheckPort();
    identityCheck.suspend("buyer-1");
    const uc = makeUseCase(repo, identityCheck);

    await expect(
      uc.execute({ userId: "buyer-1", conversationId: "conv-1" }),
    ).rejects.toMatchObject({
      response: {
        details: { reason: AdminSchemas.AdminErrorReason.UserSuspended },
      },
    });
  });
});
