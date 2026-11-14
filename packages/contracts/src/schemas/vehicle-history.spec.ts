import { describe, expect, it } from "vitest";

import { ClaimHistoryRequestSchema, HistoryQueueQuerySchema, HistoryRequestSchema,
  SendHistoryTextSchema, SendOperatorHistoryTextSchema, ReadHistoryMessagesSchema,
  ReadOperatorHistoryMessagesSchema, HistoryMessageSchema } from "./vehicle-history";

describe("History assignment HTTP contracts", () => {
  it("keeps the existing unassigned reader valid and accepts only a real public operator summary", () => {
    const request = { id: "10000000-0000-4000-8000-000000000001", sourceListingId: null,
      createdAt: "2026-11-14T08:00:00.000Z", status: "enquiry", assignedOperator: null };
    expect(HistoryRequestSchema.parse(request)).toEqual({ ...request, assignmentVersion: 0 });
    const assignedOperator = { id: "10000000-0000-4000-8000-000000000002", displayName: "Ayna", nameNumber: 1213 };
    expect(HistoryRequestSchema.parse({ ...request, assignedOperator, assignmentVersion: 1 })).toEqual({ ...request, assignedOperator, assignmentVersion: 1 });
    expect(HistoryRequestSchema.safeParse({ ...request, assignedOperator: { name: "Invented" } }).success).toBe(false);
  });
  it("requires a bounded integer version and restricts the queue to enquiry metadata queries", () => {
    expect(ClaimHistoryRequestSchema.parse({ expectedAssignmentVersion: 0 })).toEqual({ expectedAssignmentVersion: 0 });
    for (const expectedAssignmentVersion of [-1, 0.5, 2147483648, "0"]) {
      expect(ClaimHistoryRequestSchema.safeParse({ expectedAssignmentVersion }).success).toBe(false);
    }
    expect(ClaimHistoryRequestSchema.safeParse({ expectedAssignmentVersion: 0, assignedOperatorId: "forged" }).success).toBe(false);
    expect(HistoryQueueQuerySchema.parse({ filter: "mine", search: "  ABC  " })).toEqual({ filter: "mine", search: "ABC" });
    for (const query of [{ filter: "paid" }, { search: "a".repeat(65) }, { requesterId: "forged" }, { cursor: "bad" }]) {
      expect(HistoryQueueQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});

describe("History text HTTP contracts", () => {
  const id = "10000000-0000-4000-8000-000000001214";
  const input = { clientMessageId: id, text: "  Salam\nDünýä  " };
  it("preserves original text and refuses caller-selected identity, stream and private-note fields", () => {
    expect(SendHistoryTextSchema.parse(input)).toEqual(input);
    for (const extra of [{ senderId: id }, { purpose: "vehicle_history" }, { objectId: id }, { role: "operator" }, { kind: "NOTE" }]) {
      expect(SendHistoryTextSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    }
    expect(SendOperatorHistoryTextSchema.safeParse(input).success).toBe(false);
    expect(SendOperatorHistoryTextSchema.parse({ ...input, expectedAssignmentVersion: 1 }).text).toBe("  Salam\nDünýä  ");
  });
  it("bounds query strings and requires an explicit current staff assignment version", () => {
    expect(ReadHistoryMessagesSchema.parse({})).toEqual({ limit: 50 });
    expect(ReadOperatorHistoryMessagesSchema.parse({ expectedAssignmentVersion: "1", limit: "2" }))
      .toEqual({ expectedAssignmentVersion: 1, limit: 2 });
    for (const query of [{ expectedAssignmentVersion: "" }, { expectedAssignmentVersion: "1.5" }, { expectedAssignmentVersion: "2147483648" },
      { expectedAssignmentVersion: "1", limit: "51" }, { expectedAssignmentVersion: "1", senderId: id }]) {
      expect(ReadOperatorHistoryMessagesSchema.safeParse(query).success).toBe(false);
    }
  });
  it("rejects private identity or receipt state in message responses", () => {
    const message = { ...input, id, kind: "TEXT", order: "1", createdAt: "2026-11-14T08:00:00.000Z",
      author: { id, displayName: "Ayna", nameNumber: 1213, kind: "requester" } };
    expect(HistoryMessageSchema.parse(message)).toEqual(message);
    expect(HistoryMessageSchema.safeParse({ ...message, author: { ...message.author, email: "private" } }).success).toBe(false);
    expect(HistoryMessageSchema.safeParse({ ...message, deliveredAt: null }).success).toBe(false);
  });
});
