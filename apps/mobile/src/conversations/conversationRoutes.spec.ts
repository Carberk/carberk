import { describe, expect, it } from "vitest";

import { isConversationPath } from "./conversationRoutes";

describe("isConversationPath", () => {
  it("matches the Conversation route, for any or one ID", () => {
    expect(isConversationPath("/conversations/c1")).toBe(true);
    expect(isConversationPath("/conversations/c1", "c1")).toBe(true);
    expect(isConversationPath("/conversations/c1", "c2")).toBe(false);
  });

  it("does not match the Messages screens or the open-listing route", () => {
    expect(isConversationPath("/conversations")).toBe(false);
    expect(isConversationPath("/chat")).toBe(false);
    expect(isConversationPath("/conversations/open-listing")).toBe(false);
  });
});
