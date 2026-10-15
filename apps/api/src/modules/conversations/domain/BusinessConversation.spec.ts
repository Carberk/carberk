import { describe, expect, it } from "vitest";
import { Conversation } from "./Conversation";

describe("business enquiry ownership", () => {
  it("retains the owning business independently of the original seller", () => {
    const enquiry = Conversation.create({
      id: "enquiry", listingId: "car", buyerId: "buyer", sellerId: "departed-creator",
      ...{ businessId: "showroom", assigneeId: null, enquiryState: "open", version: 0 },
    });
    expect(enquiry).toMatchObject({ businessId: "showroom", assigneeId: null, enquiryState: "open", version: 0 });
    expect(enquiry.isParticipant("departed-creator")).toBe(false);
    expect(enquiry.isParticipant("buyer")).toBe(true);
  });
});

  it("allows one sales claim and rejects a competing stale claim", () => {
    const enquiry = Conversation.create({
      id: "enquiry", listingId: "car", buyerId: "buyer", sellerId: "creator", businessId: "showroom",
    });
    const claimed = enquiry.changeResponsibility({ actorId: "sales-a", owner: false, expectedVersion: 0, action: "claim" });
    expect(claimed.assigneeId).toBe("sales-a");
    expect(claimed.version).toBe(1);
    expect(() => claimed.changeResponsibility({ actorId: "sales-b", owner: false, expectedVersion: 1, action: "claim" })).toThrow("already assigned");
    expect(() => claimed.changeResponsibility({ actorId: "sales-b", owner: false, expectedVersion: 0, action: "claim" })).toThrow("changed");
  });

  it("restricts reassignment and state changes to owners", () => {
    const enquiry = Conversation.create({
      id: "enquiry", listingId: "car", buyerId: "buyer", sellerId: "creator", businessId: "showroom",
    });
    expect(() => enquiry.changeResponsibility({ actorId: "sales", owner: false, expectedVersion: 0, action: "reassign", assigneeId: "other" })).toThrow("Only Owner");
    expect(() => enquiry.changeResponsibility({ actorId: "sales", owner: false, expectedVersion: 0, action: "close" })).toThrow("Only Owner");
    const closed = enquiry.changeResponsibility({ actorId: "owner", owner: true, expectedVersion: 0, action: "close" });
    expect(closed.enquiryState).toBe("closed");
    expect(closed.changeResponsibility({ actorId: "owner", owner: true, expectedVersion: 1, action: "reopen" }).enquiryState).toBe("open");
  });

  it("keeps personal conversations governed by buyer and seller participants", () => {
    const personal = Conversation.create({ id: "personal", listingId: "car", buyerId: "buyer", sellerId: "seller" });
    expect(personal.isParticipant("seller")).toBe(true);
    expect(personal.participantRoleOf("seller")).toBe("seller");
    expect(() => personal.changeResponsibility({ actorId: "seller", owner: true, expectedVersion: 0, action: "close" })).toThrow("no business assignment");
  });
