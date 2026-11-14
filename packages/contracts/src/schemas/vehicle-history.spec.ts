import { describe, expect, it } from "vitest";

import { ClaimHistoryRequestSchema, HistoryQueueQuerySchema, HistoryRequestSchema,
  HistoryQueueResponseSchema, OperatorHistoryRequestSchema, HistoryInboxActionSchema,
  SendHistoryTextSchema, SendOperatorHistoryTextSchema, ReadHistoryMessagesSchema,
  ReadOperatorHistoryMessagesSchema, HistoryMessageSchema,
  ReadHistoryReminderSchema, ReadOperatorHistoryReminderSchema, StopHistoryRemindersSchema, HistoryReminderSchema } from "./vehicle-history";

describe("History assignment HTTP contracts", () => {
  it("keeps public operator context separate from customer contracts and rejects private fields", () => {
    const item = { id: "10000000-0000-4000-8000-000000001231", createdAt: "2026-11-15T00:00:00.000Z", status: "enquiry",
      mine: false, assignmentVersion: 0, requester: { displayName: null, nameNumber: 4837, deleted: true }, assignedOperator: null };
    expect(HistoryQueueResponseSchema.parse({ items: [item], nextCursor: null })).toEqual({ items: [item], nextCursor: null });
    expect(OperatorHistoryRequestSchema.parse({ ...item, sourceListingId: null })).toEqual({ ...item, sourceListingId: null });
    for (const extra of [{ requesterId: item.id }, { phone: "private" }, { role: "admin" }, { grants: [] }]) {
      expect(OperatorHistoryRequestSchema.safeParse({ ...item, sourceListingId: null, ...extra }).success).toBe(false);
      expect(HistoryQueueResponseSchema.safeParse({ items: [{ ...item, requester: { ...item.requester, ...extra } }], nextCursor: null }).success).toBe(false);
    }
    const selection = { kind: "claim", id: item.id, scope: "a".repeat(64), expectedAssignmentVersion: 0 };
    expect(HistoryInboxActionSchema.parse(selection)).toEqual(selection);
    for (const input of [{ ...selection, scope: "token" }, { ...selection, expectedAssignmentVersion: "0" },
      { ...selection, scope: undefined }, { ...selection, kind: "receipts" }, { ...selection, actorId: item.id }]) {
      expect(HistoryInboxActionSchema.safeParse(input).success).toBe(false);
    }
  });
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

describe("History reminder HTTP contracts", () => {
  it("accepts only bounded versions and refuses caller clocks, identity, outcome and policy facts", () => {
    expect(ReadHistoryReminderSchema.parse({})).toEqual({});
    expect(ReadOperatorHistoryReminderSchema.parse({ expectedAssignmentVersion: "2147483647" })).toEqual({ expectedAssignmentVersion: 2147483647 });
    expect(StopHistoryRemindersSchema.parse({ expectedWaitingVersion: 0 })).toEqual({ expectedWaitingVersion: 0 });
    for (const version of [-1, 0.5, 2147483648, "0", null, Infinity]) {
      expect(StopHistoryRemindersSchema.safeParse({ expectedWaitingVersion: version }).success).toBe(false);
    }
    for (const expectedAssignmentVersion of [undefined, "", "01", "-1", "1.5", "2147483648", 1, ["1", "1"]]) {
      expect(ReadOperatorHistoryReminderSchema.safeParse({ expectedAssignmentVersion }).success).toBe(false);
    }
    for (const extra of [{ now: "2030-01-01" }, { actorId: "private" }, { grant: "vehicle-history" }, { sourceVersion: 1 },
      { outcome: "forged" }, { text: "forged" }, { stopped: false }, { publicMessageOrder: "1" }]) {
      expect(ReadHistoryReminderSchema.safeParse(extra).success).toBe(false);
      expect(ReadOperatorHistoryReminderSchema.safeParse({ expectedAssignmentVersion: "1", ...extra }).success).toBe(false);
      expect(StopHistoryRemindersSchema.safeParse({ expectedWaitingVersion: 0, ...extra }).success).toBe(false);
    }
  });
  it("allows only safe reminder state and the original public message", () => {
    const id = "10000000-0000-4000-8000-000000001250";
    const outcome = { id, clientMessageId: id, kind: "TEXT", text: "  Original\n  ", order: "57", createdAt: "2026-11-14T00:00:00.000Z",
      author: { id, displayName: "Ayna", nameNumber: 1250, kind: "operator" } };
    const state = { reason: null, since: null, version: 58, eligibleAt: null, eligible: false, ineligibleReason: "used",
      declined: false, stopped: false, used: true, outcome };
    expect(HistoryReminderSchema.parse(state)).toEqual(state);
    for (const extra of [{ sourceId: "private" }, { publicMessageId: id }, { requesterId: id }, { notes: [] }, { contacts: [] }]) {
      expect(HistoryReminderSchema.safeParse({ ...state, ...extra }).success).toBe(false);
      expect(HistoryReminderSchema.safeParse({ ...state, outcome: { ...outcome, ...extra } }).success).toBe(false);
    }
    expect(HistoryReminderSchema.safeParse({ ...state, outcome: { ...outcome, author: { ...outcome.author, email: "private" } } }).success).toBe(false);
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
