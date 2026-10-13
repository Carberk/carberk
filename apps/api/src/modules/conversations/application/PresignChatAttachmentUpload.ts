import { Inject, Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type { MediaStoragePort } from "../../listings/domain/ports/MediaStoragePort";
import { MEDIA_STORAGE_PORT } from "../../listings/domain/ports/MediaStoragePort";
import { IDENTITY_CHECK_PORT, type IdentityCheckPort } from "../../identity/identity.public";
import { AdminSchemas } from "@auto-tm/contracts";

import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from "../domain/ports/ConversationRepository";
import {
  CHAT_ATTACHMENT_MAX_SIZE_BYTES,
  chatAttachmentKey,
} from "../domain/ChatAttachment";
import { CONVERSATION_ERROR_CODES } from "../domain/types";

export interface PresignChatAttachmentUploadInput {
  userId: string;
  conversationId: string;
  contentType: string;
  sizeBytes: number;
}

export interface PresignChatAttachmentUploadResult {
  uploadUrl: string;
  key: string;
  expiresIn: number;
  maxSizeBytes: number;
}

const CHAT_ATTACHMENT_CONSTRAINTS = {
  maxSizeBytes: CHAT_ATTACHMENT_MAX_SIZE_BYTES,
  allowedTypes: ["image/webp"] as const,
  presignExpirySeconds: 600,
};

@Injectable()
export class PresignChatAttachmentUpload {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    @Inject(MEDIA_STORAGE_PORT)
    private readonly storage: MediaStoragePort,
    @Inject(IDENTITY_CHECK_PORT)
    private readonly identityCheck: IdentityCheckPort,
  ) {}

  async execute(
    input: PresignChatAttachmentUploadInput,
  ): Promise<PresignChatAttachmentUploadResult> {
    const suspended = await this.identityCheck.isSuspended(input.userId);
    if (suspended) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "User is suspended",
        details: { reason: AdminSchemas.AdminErrorReason.UserSuspended },
      });
    }

    const conversation = await this.conversations.findById(input.conversationId);

    if (!conversation) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Conversation not found",
      });
    }

    if (!conversation.isParticipant(input.userId)) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "You are not a participant in this conversation",
        details: { reason: CONVERSATION_ERROR_CODES.NOT_A_PARTICIPANT },
      });
    }

    if (!CHAT_ATTACHMENT_CONSTRAINTS.allowedTypes.some((type) => type === input.contentType)) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: `Invalid content type. Allowed: ${CHAT_ATTACHMENT_CONSTRAINTS.allowedTypes.join(", ")}`,
      });
    }

    if (input.sizeBytes <= 0 || input.sizeBytes > CHAT_ATTACHMENT_CONSTRAINTS.maxSizeBytes) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: `Invalid size. Must be between 1 and ${CHAT_ATTACHMENT_CONSTRAINTS.maxSizeBytes} bytes`,
      });
    }

    const ext = "webp";
    const key = chatAttachmentKey(input.conversationId, randomUUID(), ext);

    const { url } = await this.storage.presignUpload({
      key,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      expirySeconds: CHAT_ATTACHMENT_CONSTRAINTS.presignExpirySeconds,
    });

    return {
      uploadUrl: url,
      key,
      expiresIn: CHAT_ATTACHMENT_CONSTRAINTS.presignExpirySeconds,
      maxSizeBytes: CHAT_ATTACHMENT_CONSTRAINTS.maxSizeBytes,
    };
  }
}
