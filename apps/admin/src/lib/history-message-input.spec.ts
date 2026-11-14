import { describe, expect, it } from "vitest";

import { parseHistoryMessageInput } from "./history-message-input";

const selection = { id: "10000000-0000-4000-8000-000000001256", scope: "a".repeat(64), expectedAssignmentVersion: 1 };
const send = { ...selection, kind: "send", body: { clientMessageId: selection.id, text: "  Salam\nDünýä  " } };
describe("strict operator message envelopes", () => {
  it("preserves exact text and accepts only explicit send, receipt read and Received/Read commands", () => {
    expect(parseHistoryMessageInput(send)).toEqual(send);
    expect(parseHistoryMessageInput({ ...selection, kind: "receipts" })).toEqual({ ...selection, kind: "receipts" });
    for (const kind of ["received", "read"]) {
      const input = { ...selection, kind: "ack", throughOrder: "1", body: { kind, cursor: selection.id } };
      expect(parseHistoryMessageInput(input)).toEqual(input);
    }
  });
  it("refuses unknown authority, malformed identifiers, unbounded text and forged commands", () => {
    for (const input of [null, [], { ...send, kind: "claim" }, { ...send, throughOrder: "1" }, { ...send, id: "bad" }, { ...send, scope: "bearer" },
      { ...send, expectedAssignmentVersion: -1 }, { ...send, expectedAssignmentVersion: 2147483648 },
      { ...send, expectedAssignmentVersion: "1" }, { ...send, expectedAssignmentVersion: undefined },
      ...["actor", "session", "target", "clock", "purpose"].map((key) => ({ ...send, [key]: selection.id })),
      ...[{ text: " " }, { text: "a".repeat(4001) }, { clientMessageId: "bad" }, { senderId: selection.id }]
        .map((body) => ({ ...send, body: { ...send.body, ...body } })),
      { ...selection, kind: "receipts", body: {} }, { ...selection, kind: "ack", throughOrder: "1", body: { kind: "delivered", cursor: selection.id } },
      ...[undefined, "0", "-1", "1.5", "99999999999999999999"].map((throughOrder) =>
        ({ ...selection, kind: "ack", throughOrder, body: { kind: "read", cursor: selection.id } })),
      { ...selection, kind: "ack", throughOrder: "1", body: { kind: "read", cursor: "bad" } },
      { ...selection, kind: "ack", throughOrder: "1", body: { kind: "read", cursor: selection.id, readOrder: "99" } }]) {
      expect(parseHistoryMessageInput(input)).toBeNull();
    }
  });
});
