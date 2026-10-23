import type { Conversation } from "../Conversation";

export interface ConversationActor {
  userId: string;
  sessionId?: string | undefined;
  businessId?: string | undefined;
}
export interface EnquiryResponsibilityChange {
  actor: ConversationActor;
  conversationId: string;
  expectedVersion: number;
  action: "claim" | "reassign" | "close" | "reopen";
  assigneeId?: string | null | undefined;
}
export interface BusinessEnquiryAuditEntry {
  version: number;
  actorId: string | null;
  action: string;
  previousAssigneeId: string | null;
  assigneeId: string | null;
  enquiryState: string;
  createdAt: string;
}
export interface BusinessEnquiryRepository {
  list(actor: ConversationActor, cursor?: string): Promise<{ items: Conversation[]; nextCursor: string | null; unanswered: number }>;
  change(input: EnquiryResponsibilityChange): Promise<Conversation>;
  audit(actor: ConversationActor, conversationId: string): Promise<BusinessEnquiryAuditEntry[]>;
  businessName(businessId: string): Promise<string | null>;
  /** Rechecked by fanout/push, never inferred from a saved participant row. */
  recipients(conversationId: string, senderId: string): Promise<string[]>;
}
export const BUSINESS_ENQUIRY_REPOSITORY = Symbol("BusinessEnquiryRepository");
