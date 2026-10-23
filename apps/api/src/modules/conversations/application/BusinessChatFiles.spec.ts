import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { BusinessAuthorityDenied, type BusinessAuthorityPort } from "../../identity/identity.public";
import { Conversation } from "../domain/Conversation";
import type { ConversationRepository } from "../domain/ports/ConversationRepository";
import { BusinessEnquiryAccess } from "./BusinessEnquiryAccess";
import { BusinessChatFiles } from "./BusinessChatFiles";

describe("business attachment delivery", () => {
 it("withholds bytes when current membership is revoked during the storage read", async () => {
  let revoked = false;
  const authority = { authorize: async () => {
   if (revoked) throw new BusinessAuthorityDenied("MEMBERSHIP_REQUIRED");
  } } as unknown as BusinessAuthorityPort;
  const conversation = Conversation.create({ id: "conversation", listingId: "listing", buyerId: "buyer", sellerId: "creator", businessId: "business" });
  const repository = { findById: async () => conversation } as unknown as ConversationRepository;
  let entered!: () => void; let release!: () => void;
  const read = new Promise<void>(resolve => { entered = resolve; });
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const files = new BusinessChatFiles(repository, new BusinessEnquiryAccess(authority), {
   put: async () => {},
   get: async () => { entered(); await barrier; return new Uint8Array([1, 2, 3]); },
  });
  const pending = files.download({ userId: "sales", sessionId: "session", businessId: "business" }, "conversation", "550e8400-e29b-41d4-a716-446655440001");
  const refused = expect(pending).rejects.toMatchObject({ status: 403 });
  await read; revoked = true; release(); await refused;
 });
});
