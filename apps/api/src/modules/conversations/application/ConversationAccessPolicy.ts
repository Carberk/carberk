import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { AdminSchemas } from "@auto-tm/contracts";

import {
  accountDeletionPendingException,
  IDENTITY_CHECK_PORT,
  IDENTITY_READ_PORT,
  type IdentityCheckPort,
  type IdentityReadPort,
} from "../../identity/identity.public";
import type { Conversation } from "../domain/Conversation";
import { CONVERSATION_ERROR_CODES } from "../domain/types";

export interface AssertConversationParticipantAccessInput {
  conversation: Conversation;
  userId: string;
  otherParticipantSuspendedMessage?: string | undefined;
}

@Injectable()
export class ConversationAccessPolicy {
  constructor(
    @Inject(IDENTITY_CHECK_PORT)
    private readonly identityCheck: IdentityCheckPort,
    @Inject(IDENTITY_READ_PORT)
    private readonly identityRead: IdentityReadPort,
  ) {}

  async assertParticipantAccess(
    input: AssertConversationParticipantAccessInput,
  ): Promise<void> {
    const otherParticipantId = this.assertParticipant(
      input.conversation,
      input.userId,
    );

    await this.assertParticipantSafety({
      userId: input.userId,
      otherParticipantId,
      otherParticipantSuspendedMessage:
        input.otherParticipantSuspendedMessage ??
        "Other participant is suspended",
    });
  }

  assertParticipant(
    conversation: Conversation,
    userId: string,
  ): string {
    if (!conversation.isParticipant(userId)) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "You are not a participant in this conversation",
        details: { reason: CONVERSATION_ERROR_CODES.NOT_A_PARTICIPANT },
      });
    }

    return conversation.buyerId === userId
      ? conversation.sellerId
      : conversation.buyerId;
  }

  /**
   * Refuses a User whose account deletion is scheduled. Realtime events do not
   * pass the HTTP guard that enforces this for requests (ADR-0032), so the use
   * cases they reach call this themselves.
   */
  async assertAccountNotPendingDeletion(userId: string): Promise<void> {
    if (await this.identityCheck.isDeletionScheduled(userId)) {
      throw accountDeletionPendingException();
    }
  }

  async assertParticipantSafety(input: {
    userId: string;
    otherParticipantId: string;
    otherParticipantSuspendedMessage: string;
  }): Promise<void> {
    await this.guardSuspended(
      input.userId,
      input.otherParticipantId,
      input.otherParticipantSuspendedMessage,
    );
    await this.guardBlocked(input.userId, input.otherParticipantId);
  }

  private async guardSuspended(
    userId: string,
    otherParticipantId: string,
    otherParticipantSuspendedMessage: string,
  ): Promise<void> {
    const userSuspended = await this.identityCheck.isSuspended(userId);
    if (userSuspended) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "User is suspended",
        details: { reason: AdminSchemas.AdminErrorReason.UserSuspended },
      });
    }

    const otherSuspended = await this.identityCheck.isSuspended(
      otherParticipantId,
    );
    if (otherSuspended) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: otherParticipantSuspendedMessage,
        details: { reason: AdminSchemas.AdminErrorReason.UserSuspended },
      });
    }
  }

  private async guardBlocked(
    userId: string,
    otherParticipantId: string,
  ): Promise<void> {
    const blockedByOther = await this.identityRead.isUserBlockedBy(
      otherParticipantId,
      userId,
    );
    if (blockedByOther) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "You are blocked by this user",
        details: { reason: CONVERSATION_ERROR_CODES.BLOCKED_BY_USER },
      });
    }

    const blockedThem = await this.identityRead.isUserBlockedBy(
      userId,
      otherParticipantId,
    );
    if (blockedThem) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "You have blocked this user",
        details: { reason: CONVERSATION_ERROR_CODES.USER_BLOCKED },
      });
    }
  }
}
