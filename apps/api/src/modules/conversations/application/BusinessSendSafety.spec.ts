import { describe, expect, it } from "vitest";
import type { BusinessAuthorityPort, IdentityCheckPort, IdentityReadPort } from "../../identity/identity.public";
import type { ListingSummary, ListingsReadPort } from "../../listings/domain/ports/ListingsReadPort";
import type { ConversationRepository } from "../domain/ports/ConversationRepository";
import { Conversation } from "../domain/Conversation";
import { Message } from "../domain/Message";
import { BusinessEnquiryAccess } from "./BusinessEnquiryAccess";
import { ConversationAccessPolicy } from "./ConversationAccessPolicy";
import { ConversationSendPolicy } from "./ConversationSendPolicy";
import { ConversationMessageCommitter } from "./ConversationMessageCommitter";
import { SendConversationMessage } from "./SendConversationMessage";

function setup(options: { blocked?: boolean; buyerSuspended?: boolean; buyerDeleting?: boolean; status?: ListingSummary["status"] | "draft" } = {}) {
 const conversation = Conversation.create({ id: "conversation", listingId: "listing", buyerId: "buyer", sellerId: "departed-creator", businessId: "business", assigneeId: "sales" });
 const saved: Message[] = [];
 const repository = { findById: async () => conversation, saveMessage: async (message: Message) => { saved.push(message); } } as unknown as ConversationRepository;
 const listings = { getListingSummary: async () => ({ id: "listing", status: options.status ?? "active", allowChat: true }) } as unknown as ListingsReadPort;
 const identityCheck = { isSuspended: async (id: string) => id === "departed-creator" || (id === "buyer" && options.buyerSuspended === true), isDeletionScheduled: async (id: string) => id === "buyer" && options.buyerDeleting === true } as IdentityCheckPort;
 const identityRead = { isUserBlockedBy: async (a: string, b: string) => options.blocked === true && [a, b].includes("buyer") } as IdentityReadPort;
 const authority = { resolve: async () => ({ kind: "personal", userId: "buyer" }), authorize: async () => ({ kind: "business", userId: "sales", businessId: "business" }) } as unknown as BusinessAuthorityPort;
 const useCase = new SendConversationMessage(repository, new ConversationSendPolicy(repository, listings, new ConversationAccessPolicy(identityCheck, identityRead)), new ConversationMessageCommitter(repository, { emitMessageSent: async () => {} }), new BusinessEnquiryAccess(authority), listings);
 const send = (senderId = "sales", actorId = senderId) => useCase.execute({ senderId, conversationId: "conversation", actor: { userId: actorId, sessionId: "session", ...(actorId === "buyer" ? {} : { businessId: "business" }) }, createMessage: ({ id, conversationId, senderId }) => Message.createText({ id, conversationId, senderId, text: "Hello" }) });
 return { send, saved };
}
describe("business enquiry send safety", () => {
 it("binds the attributed sender to the current session actor", async () => {
  const { send, saved } = setup(); await expect(send("buyer", "sales")).rejects.toThrow(); expect(saved).toEqual([]);
 });
 it.each([{ blocked: true }, { buyerSuspended: true }, { buyerDeleting: true }, { status: "draft" as const }])("refuses unsafe buyer contact or an unavailable Listing %j before persistence", async options => {
  const { send, saved } = setup(options); await expect(send()).rejects.toThrow(); expect(saved).toEqual([]);
 });
 it.each(["sold", "archived"] as const)("allows %s follow-up independently of the departed creator suspension", async status => {
  const { send, saved } = setup({ status }); await send(); expect(saved).toHaveLength(1);
 });
});
