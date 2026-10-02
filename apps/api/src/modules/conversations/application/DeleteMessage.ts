import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";

import { CONVERSATION_ERROR_CODES } from "../domain/types";
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from "../domain/ports/ConversationRepository";

import { ConversationAccessPolicy } from "./ConversationAccessPolicy";

export interface DeleteMessageInput {
  userId: string;
  conversationId: string;
  messageId: string;
}

export interface DeleteMessageResult {
  messageId: string;
  deletedAt: Date;
}

@Injectable()
export class DeleteMessage {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    @Inject(ConversationAccessPolicy)
    private readonly accessPolicy: ConversationAccessPolicy,
  ) {}

  async execute(input: DeleteMessageInput): Promise<DeleteMessageResult> {
    const conversation = await this.conversations.findById(
      input.conversationId,
    );

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

    await this.accessPolicy.assertAccountNotPendingDeletion(input.userId);

    const message = await this.conversations.findMessageById(input.messageId);

    if (!message || message.conversationId !== input.conversationId) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Message not found",
        details: { reason: CONVERSATION_ERROR_CODES.MESSAGE_NOT_FOUND },
      });
    }

    if (message.senderId !== input.userId) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "You can only delete your own messages",
        details: { reason: CONVERSATION_ERROR_CODES.CANNOT_DELETE_OTHERS_MESSAGE },
      });
    }

    if (message.isDeleted()) {
      return {
        messageId: message.id,
        deletedAt: message.deletedAt ?? new Date(),
      };
    }

    const now = new Date();
    if (!message.canDelete(input.userId, now)) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Message delete window has expired",
        details: { reason: CONVERSATION_ERROR_CODES.DELETE_WINDOW_EXPIRED },
      });
    }

    const deleted = await this.conversations.softDeleteMessage(
      input.messageId,
      input.userId,
      now,
    );

    if (!deleted) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Message not found",
        details: { reason: CONVERSATION_ERROR_CODES.MESSAGE_NOT_FOUND },
      });
    }

    return {
      messageId: deleted.id,
      deletedAt: deleted.deletedAt ?? new Date(),
    };
  }
}
