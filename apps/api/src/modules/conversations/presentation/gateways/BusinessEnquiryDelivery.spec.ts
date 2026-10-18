import "reflect-metadata";
import { describe, expect, it } from "vitest";
import type { Server, Socket } from "socket.io";
import { BusinessAuthorityDenied, type BusinessAuthorityPort } from "../../../identity/identity.public";
import { Conversation } from "../../domain/Conversation";
import type { ConversationRepository } from "../../domain/ports/ConversationRepository";
import type { BusinessEnquiryRepository } from "../../domain/ports/BusinessEnquiryRepository";
import type { MessageSentEvent } from "../../domain/ports/MessageEventPublisher";
import { BusinessEnquiryAccess } from "../../application/BusinessEnquiryAccess";
import { ConversationAccessPolicy } from "../../application/ConversationAccessPolicy";
import { ValidateConversationAccess } from "../../application/ValidateConversationAccess";
import { ConversationGateway } from "./ConversationGateway";

const id = "550e8400-e29b-41d4-a716-446655440001";
function fixture() {
  const conversation = Conversation.create({ id, listingId: "listing", buyerId: "buyer", sellerId: "departed", businessId: "business" });
  const repository = { findById: async () => conversation } as unknown as ConversationRepository;
  let recipients = ["sales", "owner"];
  const business = { recipients: async () => recipients } as unknown as BusinessEnquiryRepository;
  const liveSessions = new Set(["buyer-session", "sales-session", "owner-session"]);
  const authority: BusinessAuthorityPort = {
    resolve: async input => {
      if (!liveSessions.has(input.sessionId)) throw new BusinessAuthorityDenied("SESSION_REQUIRED");
      return { kind: "personal", userId: input.userId };
    },
    authorize: async input => {
      if (!liveSessions.has(input.sessionId) || !recipients.includes(input.userId)) throw new BusinessAuthorityDenied("MEMBERSHIP_REQUIRED");
      return { kind: "business", userId: input.userId, businessId: "business", membershipId: input.userId, role: "sales", status: "active" };
    },
  };
  const access = new ValidateConversationAccess(repository, new ConversationAccessPolicy({} as never, {} as never), new BusinessEnquiryAccess(authority));
  const gateway = new ConversationGateway(access, {} as never, {} as never, {} as never, {} as never, business, repository);
  const received: Record<string, string[]> = {};
  const sockets = ["buyer", "sales", "owner", "departed", "revoked"].map(userId => ({
    id: `${userId}-socket`, data: { user: { sub: userId, sid: `${userId}-session` } },
    emit: (event: string) => { (received[userId] ??= []).push(event); },
    join: async () => { throw new Error("business delivery must not join sticky rooms"); },
  }));
  gateway.server = {
    in: () => ({ fetchSockets: async () => sockets }),
    to: () => ({ to() { return this; }, emit: () => { throw new Error("business content reached sticky room"); } }),
  } as unknown as Server;
  const event = (recipientId: string, echoSender: boolean): MessageSentEvent => ({
    event: "MessageSent", conversationId: id, messageId: "message", senderId: "buyer", recipientId,
    sentAt: "2026-10-17T12:00:00Z", messageKind: "text", messageBody: "private content",
    messageMetadata: null, messageDeletedAt: null, clientMessageId: null,
    businessId: "business", echoSender,
  });
  return { gateway, received, sockets, event, revoke: () => liveSessions.delete("sales-session"), reassign: () => { recipients = ["owner"]; } };
}

describe("business realtime delivery checks current sockets", () => {
  it("delivers one sender echo and no content to departed or revoked sockets", async () => {
    const f = fixture(); f.revoke();
    await f.gateway.handleMessageSent(f.event("sales", true));
    await f.gateway.handleMessageSent(f.event("owner", false));
    expect(f.received).toEqual({ buyer: ["message:new"], owner: ["message:new"] });
  });
  it("does not deliver an earlier event after reassignment", async () => {
    const f = fixture(); f.reassign();
    await f.gateway.handleMessageSent(f.event("sales", false));
    expect(f.received).toEqual({});
  });
  it("authorizes join without adding a stale business conversation room", async () => {
    const f = fixture();
    expect(await f.gateway.handleJoin({ conversationId: id }, f.sockets[0] as unknown as Socket)).toMatchObject({ ok: true });
  });
  it("typing rechecks each receiving socket instead of broadcasting to historical members", async () => {
    const f = fixture(); f.revoke();
    expect(await f.gateway.handleTypingStart({ conversationId: id }, f.sockets[0] as unknown as Socket)).toMatchObject({ ok: true });
    expect(f.received).toEqual({ owner: ["typing:peer"] });
  });
});
