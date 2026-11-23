import { expect, it } from "vitest";

import { AcceptHistoryQuoteSchema, HistoryCorrectionMutationSchema, HistoryOperatorCorrectionMutationSchema } from "./history-order";

it("requires exact correction revisions and keeps staff responsibility separate from customer input", () => {
  const input = { kind: "request", attemptKey: "11860000-0000-4000-8000-000000000001", expectedVersion: 0, vin: "DEMA0000000000006" };
  expect(HistoryCorrectionMutationSchema.safeParse(input).success).toBe(true);
  expect(HistoryCorrectionMutationSchema.safeParse({ ...input, cause: "company_error" }).success).toBe(false);
  expect(HistoryCorrectionMutationSchema.safeParse({ kind: "accept", attemptKey: input.attemptKey, expectedVersion: 2 }).success).toBe(false);
  expect(HistoryOperatorCorrectionMutationSchema.safeParse({ kind: "review", attemptKey: input.attemptKey,
    expectedVersion: 1, expectedAssignmentVersion: 1, cause: "company_error", format: "pdf" }).success).toBe(true);
  expect(HistoryOperatorCorrectionMutationSchema.safeParse({ kind: "review", attemptKey: input.attemptKey,
    expectedVersion: 1, expectedAssignmentVersion: 1, format: "pdf" }).success).toBe(false);
});

it("requires the complete explicitly displayed proposal, including its format and version", () => {
  const offer = { version: 2, vin: "DEMA0000000000001", synthetic: true,
    preflight: { status: "available", providers: [{ name: "Carfax", originalReportDate: "2026-10-14" }] },
    proposal: { format: "both", priceTmt: 100, providerRule: "either_available_both_when_obtainable", terms: "service_failure_review",
      deliveryFrom: "2026-11-21T06:00:00.000Z", deliveryBy: "2026-11-21T07:00:00.000Z" } };
  expect(AcceptHistoryQuoteSchema.safeParse({ offer }).success).toBe(true);
  expect(AcceptHistoryQuoteSchema.safeParse({ expectedVersion: 2 }).success).toBe(false);
  expect(AcceptHistoryQuoteSchema.safeParse({ offer: { ...offer, proposal: { ...offer.proposal, format: undefined } } }).success).toBe(false);
  expect(AcceptHistoryQuoteSchema.safeParse({ offer, wallet: "customer-controlled" }).success).toBe(false);
});
