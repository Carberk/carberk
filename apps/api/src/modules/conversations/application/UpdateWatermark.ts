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

export interface UpdateWatermarkInput {
  userId: string;
  conversationId: string;
  lastReadAt?: string;
  lastDeliveredAt?: string;
}

export interface UpdateWatermarkResult {
  conversationId: string;
  lastReadAt: Date | null;
  lastDeliveredAt: Date | null;
}

@Injectable()
export class UpdateWatermark {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    @Inject(ConversationAccessPolicy)
    private readonly accessPolicy: ConversationAccessPolicy,
  ) {}

  async execute(input: UpdateWatermarkInput): Promise<UpdateWatermarkResult> {
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

    const updates: { lastReadAt?: Date; lastDeliveredAt?: Date } = {};

    if (input.lastReadAt !== undefined) {
      updates.lastReadAt = this.parseTimestamp(input.lastReadAt);
    }
    if (input.lastDeliveredAt !== undefined) {
      updates.lastDeliveredAt = this.parseTimestamp(input.lastDeliveredAt);
    }

    const current = await this.conversations.getParticipantState(
      input.userId,
      input.conversationId,
    );

    this.guardMonotonic(current, updates);

    const state = await this.conversations.updateWatermark(
      input.userId,
      input.conversationId,
      updates,
    );

    return {
      conversationId: input.conversationId,
      lastReadAt: state.lastReadAt,
      lastDeliveredAt: state.lastDeliveredAt,
    };
  }

  private parseTimestamp(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "Invalid timestamp",
      });
    }
    return date;
  }

  private guardMonotonic(
    current: { lastReadAt: Date | null; lastDeliveredAt: Date | null } | null,
    updates: { lastReadAt?: Date; lastDeliveredAt?: Date },
  ): void {
    if (updates.lastReadAt && current?.lastReadAt) {
      if (updates.lastReadAt.getTime() < current.lastReadAt.getTime()) {
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: "lastReadAt cannot move backwards",
          details: { reason: CONVERSATION_ERROR_CODES.WATERMARK_NOT_MONOTONIC },
        });
      }
    }
    if (updates.lastDeliveredAt && current?.lastDeliveredAt) {
      if (
        updates.lastDeliveredAt.getTime() < current.lastDeliveredAt.getTime()
      ) {
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: "lastDeliveredAt cannot move backwards",
          details: { reason: CONVERSATION_ERROR_CODES.WATERMARK_NOT_MONOTONIC },
        });
      }
    }
  }
}
