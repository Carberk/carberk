import { ConversationDomainError, CONVERSATION_ERROR_CODES } from "./types";
import type { ParticipantRole } from "./types";

export class Conversation {
  private constructor(
    readonly id: string,
    readonly listingId: string,
    readonly buyerId: string,
    readonly sellerId: string,
    readonly createdAt: Date,
    readonly updatedAt: Date,
    readonly businessId: string | null = null,
    readonly assigneeId: string | null = null,
    readonly enquiryState: "open" | "closed" = "open",
    readonly version: number = 0,
  ) {
    if (buyerId === sellerId) {
      throw new ConversationDomainError(
        CONVERSATION_ERROR_CODES.SELF_CONTACT_NOT_ALLOWED,
        "Buyer and seller cannot be the same user",
      );
    }
  }

  static create(data: {
    id: string;
    listingId: string;
    buyerId: string;
    sellerId: string;
    createdAt?: Date;
    updatedAt?: Date;
    businessId?: string | null;
    assigneeId?: string | null;
    enquiryState?: "open" | "closed";
    version?: number;
  }): Conversation {
    return new Conversation(
      data.id,
      data.listingId,
      data.buyerId,
      data.sellerId,
      data.createdAt ?? new Date(),
      data.updatedAt ?? new Date(),
      data.businessId ?? null,
      data.assigneeId ?? null,
      data.enquiryState ?? "open",
      data.version ?? 0,
    );
  }

  changeResponsibility(input: { actorId: string; owner: boolean; expectedVersion: number; action: "claim" | "reassign" | "close" | "reopen"; assigneeId?: string | null | undefined }): Conversation {
    if (!this.businessId) throw new ConversationDomainError("NOT_BUSINESS_ENQUIRY", "Personal conversations have no business assignment");
    if (this.version !== input.expectedVersion) throw new ConversationDomainError("ENQUIRY_VERSION_CHANGED", "Enquiry changed. Refresh before trying again");
    if (input.action !== "claim" && !input.owner) throw new ConversationDomainError("OWNER_REQUIRED", "Only Owner can change responsibility or follow-up state");
    let assigneeId = this.assigneeId;
    let state = this.enquiryState;
    if (input.action === "claim") {
      if (state === "closed") throw new ConversationDomainError("ENQUIRY_CLOSED", "Enquiry is closed");
      if (assigneeId && assigneeId !== input.actorId) throw new ConversationDomainError("ENQUIRY_ALREADY_ASSIGNED", "Enquiry is already assigned");
      assigneeId = input.actorId;
    } else if (input.action === "reassign") assigneeId = input.assigneeId ?? null;
    else state = input.action === "close" ? "closed" : "open";
    return Conversation.create({ ...this, assigneeId, enquiryState: state, version: this.version + 1 });
  }

  isParticipant(userId: string): boolean {
    return userId === this.buyerId || (!this.businessId && userId === this.sellerId);
  }

  participantRoleOf(userId: string): ParticipantRole | null {
    if (userId === this.buyerId) return "buyer";
    if (!this.businessId && userId === this.sellerId) return "seller";
    return null;
  }
}
