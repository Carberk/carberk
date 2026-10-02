import { describe, it, expect, beforeEach } from "vitest";
import { NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";

import { Conversation } from "../domain/Conversation";
import type { ConversationRepository } from "../domain/ports/ConversationRepository";
import type { MediaStoragePort } from "../../listings/domain/ports/MediaStoragePort";
import type { IdentityCheckPort } from "../../identity/identity.public";

import { PresignChatAttachmentUpload } from "./PresignChatAttachmentUpload";

class FakeConversationRepository implements ConversationRepository {
  conversations: Conversation[] = [];

  async findById(id: string): Promise<Conversation | null> {
    return this.conversations.find((c) => c.id === id) ?? null;
  }

  async findByListingAndBuyer(): Promise<Conversation | null> {
    return null;
  }

  async save(): Promise<void> {}

  async listForUser(): Promise<{
    items: Array<{ conversation: Conversation; lastMessage: import("../domain/Message").Message | null }>;
    nextCursor: string | null;
  }> {
    return { items: [], nextCursor: null };
  }

  async listMessages(): Promise<{
    items: import("../domain/Message").Message[];
    nextCursor: string | null;
  }> {
    return { items: [], nextCursor: null };
  }

  async findMessageById(): Promise<import("../domain/Message").Message | null> {
    return null;
  }

  async findMessageByClientMessageId(): Promise<import("../domain/Message").Message | null> {
    return null;
  }

  async saveMessage(): Promise<void> {}

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

  async softDeleteMessage(): Promise<import("../domain/Message").Message | null> {
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

class FakeMediaStorage implements MediaStoragePort {
  lastCall?: { key: string; contentType: string; sizeBytes: number; expirySeconds?: number };

  async presignUpload(data: {
    key: string;
    contentType: string;
    sizeBytes: number;
    expirySeconds?: number;
  }): Promise<{ url: string; key: string }> {
    this.lastCall = data;
    return { url: `https://media.auto.tm/presigned/${data.key}`, key: data.key };
  }

  resolvePublicUrl(_key: string): string {
    return `https://media.auto.tm/${_key}`;
  }

  async deleteObject(_key: string): Promise<void> {}
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

function makeUseCase(
  repo?: FakeConversationRepository,
  storage?: FakeMediaStorage,
  identityCheck?: FakeIdentityCheckPort,
) {
  return new PresignChatAttachmentUpload(
    repo ?? new FakeConversationRepository(),
    storage ?? new FakeMediaStorage(),
    identityCheck ?? new FakeIdentityCheckPort(),
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

describe("PresignChatAttachmentUpload", () => {
  let repo: FakeConversationRepository;
  let storage: FakeMediaStorage;
  let identityCheck: FakeIdentityCheckPort;

  beforeEach(() => {
    repo = new FakeConversationRepository();
    storage = new FakeMediaStorage();
    identityCheck = new FakeIdentityCheckPort();
  });

  it("returns a presigned URL for a valid image request", async () => {
    seedConversation(repo);
    const uc = makeUseCase(repo, storage, identityCheck);

    const result = await uc.execute({
      userId: "buyer-1",
      conversationId: "conv-1",
      contentType: "image/jpeg",
      sizeBytes: 1024,
    });

    expect(result.uploadUrl).toContain("presigned");
    expect(result.key).toContain("chat-attachments/conv-1/");
    expect(result.key).toMatch(/original\.jpg$/);
    expect(result.expiresIn).toBe(600);
    expect(result.maxSizeBytes).toBe(5 * 1024 * 1024);
  });

  it("returns webp extension for image/webp", async () => {
    seedConversation(repo);
    const uc = makeUseCase(repo, storage, identityCheck);

    const result = await uc.execute({
      userId: "buyer-1",
      conversationId: "conv-1",
      contentType: "image/webp",
      sizeBytes: 1024,
    });

    expect(result.key).toMatch(/original\.webp$/);
  });

  it("passes correct parameters to storage port", async () => {
    seedConversation(repo);
    const uc = makeUseCase(repo, storage, identityCheck);

    await uc.execute({
      userId: "buyer-1",
      conversationId: "conv-1",
      contentType: "image/jpeg",
      sizeBytes: 2048,
    });

    expect(storage.lastCall).toBeDefined();
    expect(storage.lastCall!.contentType).toBe("image/jpeg");
    expect(storage.lastCall!.sizeBytes).toBe(2048);
    expect(storage.lastCall!.expirySeconds).toBe(600);
    expect(storage.lastCall!.key).toContain("chat-attachments/conv-1/");
  });

  it("rejects unknown conversation", async () => {
    const uc = makeUseCase(repo, storage, identityCheck);

    await expect(
      uc.execute({
        userId: "buyer-1",
        conversationId: "conv-missing",
        contentType: "image/jpeg",
        sizeBytes: 1024,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects non-participant", async () => {
    seedConversation(repo);
    const uc = makeUseCase(repo, storage, identityCheck);

    await expect(
      uc.execute({
        userId: "random-user",
        conversationId: "conv-1",
        contentType: "image/jpeg",
        sizeBytes: 1024,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects suspended user", async () => {
    seedConversation(repo);
    identityCheck.suspend("buyer-1");
    const uc = makeUseCase(repo, storage, identityCheck);

    await expect(
      uc.execute({
        userId: "buyer-1",
        conversationId: "conv-1",
        contentType: "image/jpeg",
        sizeBytes: 1024,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects unsupported content type", async () => {
    seedConversation(repo);
    const uc = makeUseCase(repo, storage, identityCheck);

    await expect(
      uc.execute({
        userId: "buyer-1",
        conversationId: "conv-1",
        contentType: "image/png",
        sizeBytes: 1024,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects oversized image", async () => {
    seedConversation(repo);
    const uc = makeUseCase(repo, storage, identityCheck);

    await expect(
      uc.execute({
        userId: "buyer-1",
        conversationId: "conv-1",
        contentType: "image/jpeg",
        sizeBytes: 6 * 1024 * 1024,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects non-positive size", async () => {
    seedConversation(repo);
    const uc = makeUseCase(repo, storage, identityCheck);

    await expect(
      uc.execute({
        userId: "buyer-1",
        conversationId: "conv-1",
        contentType: "image/jpeg",
        sizeBytes: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
