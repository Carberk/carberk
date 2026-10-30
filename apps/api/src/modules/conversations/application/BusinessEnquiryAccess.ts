import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { BUSINESS_AUTHORITY_PORT, BusinessAuthorityDenied, type BusinessAuthorityPort } from "../../identity/identity.public";
import type { Conversation } from "../domain/Conversation";
import type { ConversationActor } from "../domain/ports/BusinessEnquiryRepository";

/** Current authority for a shared thread, independent of its original seller. */
@Injectable()
export class BusinessEnquiryAccess {
  constructor(@Inject(BUSINESS_AUTHORITY_PORT) private readonly authority: BusinessAuthorityPort) {}

  async authorize(conversation: Conversation, actor: ConversationActor, options: { send?: boolean; owner?: boolean; transaction?: unknown } = {}): Promise<string> {
    if (!conversation.businessId || !actor.sessionId) this.deny("SESSION_REQUIRED");
    try {
      if (actor.userId === conversation.buyerId) {
        if (actor.businessId || options.owner) this.deny("BUSINESS_CONTEXT_CHANGED");
        await this.authority.resolve({ userId: actor.userId, sessionId: actor.sessionId }, options.transaction);
      } else {
        if (actor.businessId !== conversation.businessId) this.deny("BUSINESS_CONTEXT_CHANGED");
        await this.authority.authorize({ userId: actor.userId, sessionId: actor.sessionId, businessId: conversation.businessId, owner: options.owner ?? false, history: !options.send && !options.owner }, options.transaction);
        if (options.send && conversation.assigneeId !== actor.userId) this.deny("ENQUIRY_NOT_ASSIGNED_TO_YOU");
      }
      if (options.send && conversation.enquiryState === "closed") this.deny("ENQUIRY_CLOSED");
    } catch (error) {
      if (error instanceof BusinessAuthorityDenied) this.deny(error.reason);
      throw error;
    }
    return actor.userId === conversation.buyerId ? conversation.assigneeId ?? conversation.sellerId : conversation.buyerId;
  }

  deny(reason: string): never {
    throw new ForbiddenException({ code: "FORBIDDEN", details: { reason } });
  }
}
