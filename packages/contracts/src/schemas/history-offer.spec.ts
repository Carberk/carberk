import { expect, it } from "vitest";

import { HistoryOfferMutationSchema, HistoryOperatorOfferMutationSchema } from "./history-offer";

it("requires a separate explicit format and UTC delivery window, rejecting payment and provider-result inputs", () => {
  const base = { kind: "propose", expectedVersion: 1, expectedAssignmentVersion: 1,
    deliveryFrom: "2026-11-21T06:00:00.000Z", deliveryBy: "2026-11-21T07:00:00.000Z" };
  expect(HistoryOperatorOfferMutationSchema.safeParse(base).success).toBe(false);
  for (const format of ["pdf", "link", "both"]) {
    expect(HistoryOperatorOfferMutationSchema.safeParse({ ...base, format }).success).toBe(true);
  }
  expect(HistoryOperatorOfferMutationSchema.safeParse({ ...base, format: "pdf", payment: true }).success).toBe(false);
  expect(HistoryOperatorOfferMutationSchema.safeParse({ ...base, format: "pdf", deliveryBy: base.deliveryFrom }).success).toBe(false);
  expect(HistoryOfferMutationSchema.safeParse({ kind: "check", expectedVersion: 0, vin: "DEMA0000000000001" }).success).toBe(false);
});
