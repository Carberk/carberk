import { describe, expect, it } from "vitest";

import { ClaimHistoryRequestSchema, HistoryQueueQuerySchema, HistoryRequestSchema } from "./vehicle-history";

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
