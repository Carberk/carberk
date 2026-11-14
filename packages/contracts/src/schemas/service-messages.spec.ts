import { describe, expect, it } from "vitest";

import { ServiceMessagesSchemas as Messages } from "../index";

const scope = { purpose: "vehicle_history", objectId: "00000000-0000-4000-8000-000000001226" };
const send = { ...scope, senderId: scope.objectId, clientMessageId: scope.objectId, text: "  Salam\nDünýä  " };

describe("service text contracts", () => {
  it("preserves original whitespace and canonicalizes UUID keys only", () => {
    expect(Messages.SendServiceTextSchema.parse(send).text).toBe("  Salam\nDünýä  ");
    expect(Messages.SendServiceTextSchema.parse({ ...send, clientMessageId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }).clientMessageId)
      .toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });
  it.each(["", " \n\t", "a".repeat(4001)])("refuses blank or oversized text", (text) => {
    expect(Messages.SendServiceTextSchema.safeParse({ ...send, text }).success).toBe(false);
  });
  it("accepts the text bound and refuses unrelated input fields and kinds", () => {
    expect(Messages.SendServiceTextSchema.safeParse({ ...send, text: "a".repeat(4000) }).success).toBe(true);
    expect(Messages.SendServiceTextSchema.safeParse({ ...send, kind: "NOTE" }).success).toBe(false);
    expect(Messages.SendServiceTextSchema.safeParse({ ...send, sessionId: scope.objectId }).success).toBe(false);
  });
  it("bounds pages and refuses invalid cursors and purposes", () => {
    expect(Messages.ReadServiceMessagesSchema.parse(scope).limit).toBe(50);
    for (const query of [{ limit: 0 }, { limit: 51 }, { limit: 1.5 }, { cursor: "forged" }, { purpose: "support" }]) {
      expect(Messages.ReadServiceMessagesSchema.safeParse({ ...scope, ...query }).success).toBe(false);
    }
  });
});
