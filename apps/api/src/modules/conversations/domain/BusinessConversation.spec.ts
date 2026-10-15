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
