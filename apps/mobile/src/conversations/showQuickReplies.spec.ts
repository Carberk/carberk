import { describe, expect, it } from "vitest";

import { showQuickReplies, type QuickRepliesInput } from "./showQuickReplies";

const BUYER = "buyer-1";
const SELLER = "seller-1";

function input(updates: Partial<QuickRepliesInput> = {}): QuickRepliesInput {
  return {
    conversation: { myRole: "buyer", sellerId: SELLER, sendRestriction: null },
    messages: [],
    hasOlderMessages: false,
    loading: false,
    failed: false,
    blocked: false,
    ...updates,
  };
}

describe("showQuickReplies", () => {
  it("shows them to the buyer of a new Conversation", () => {
    expect(showQuickReplies(input())).toBe(true);
  });

  it("keeps them after the buyer's own Messages", () => {
    expect(
      showQuickReplies(input({ messages: [{ senderId: BUYER }, { senderId: BUYER }] })),
    ).toBe(true);
  });

  it("hides them once the seller has sent a Message", () => {
    expect(
      showQuickReplies(input({ messages: [{ senderId: BUYER }, { senderId: SELLER }] })),
    ).toBe(false);
  });

  it("never shows them to the seller", () => {
    expect(
      showQuickReplies(
        input({ conversation: { myRole: "seller", sellerId: SELLER, sendRestriction: null } }),
      ),
    ).toBe(false);
  });

  it("hides them while the Conversation is not loaded", () => {
    expect(showQuickReplies(input({ conversation: undefined }))).toBe(false);
  });

  it("hides them while the Messages load", () => {
    expect(showQuickReplies(input({ loading: true }))).toBe(false);
  });

  it("hides them in an error state", () => {
    expect(showQuickReplies(input({ failed: true }))).toBe(false);
  });

  it("hides them while the viewer has blocked the other participant", () => {
    expect(showQuickReplies(input({ blocked: true }))).toBe(false);
  });

  it.each(["blocked_by_me", "listing_unavailable", "chat_disabled", "participant_unavailable"] as const)(
    "hides them when the send restriction is %s",
    (sendRestriction) => {
      expect(
        showQuickReplies(input({ conversation: { myRole: "buyer", sellerId: SELLER, sendRestriction } })),
      ).toBe(false);
    },
  );

  it.each(["sold", "archived"] as const)("hides them when the Listing is %s", (status) => {
    expect(
      showQuickReplies(
        input({ conversation: { myRole: "buyer", sellerId: SELLER, sendRestriction: null, listing: { status } } }),
      ),
    ).toBe(false);
  });

  it("shows them while the Listing is active", () => {
    expect(
      showQuickReplies(
        input({ conversation: { myRole: "buyer", sellerId: SELLER, sendRestriction: null, listing: { status: "active" } } }),
      ),
    ).toBe(true);
  });

  it("hides them until the send restriction is known", () => {
    expect(
      showQuickReplies(
        input({ conversation: { myRole: "buyer", sellerId: SELLER, sendRestriction: undefined } }),
      ),
    ).toBe(false);
  });

  it("hides them while older history that could hold a seller Message is not loaded", () => {
    expect(
      showQuickReplies(input({ messages: [{ senderId: BUYER }], hasOlderMessages: true })),
    ).toBe(false);
  });
});
