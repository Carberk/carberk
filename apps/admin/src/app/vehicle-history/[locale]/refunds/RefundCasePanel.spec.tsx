// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";

import { RefundCasePanel } from "./RefundCasePanel";

const originalPromiseBy = "2026-11-21T07:00:00.000Z";
const agreedRecoveryDeadline = "2026-11-21T08:00:00.000Z";
const initial: H.HistoryRefundCase = {
  order: { id: "f0000000-0000-4000-8000-000000000123", vin: "DEMA0000000000001", priceMinor: 10000, format: "both",
    window: { deliveryFrom: "2026-11-21T06:00:00.000Z", deliveryBy: originalPromiseBy } },
  payment: { amountMinor: 12550, receivedAt: "2026-11-21T05:00:00.000Z",
    confirmedAt: "2026-11-21T05:30:00.000Z", reference: "SYNTHETIC-PAYMENT" },
  reason: "recovery_missed", failure: null,
  refund: { status: "pending", amountMinor: 12550, originalPromiseBy, agreedRecoveryDeadline },
};

afterEach(cleanup);

it("only offers approval on the decision surface and manual return recording after approval", () => {
  const action = async () => ({ status: "unavailable" as const });
  const route = "/vehicle-history/en/refunds";
  const decision = render(<RefundCasePanel locale="en" mode="decision" href={route} initial={initial} action={action} />);
  expect(decision.getByRole("button", { name: "Approve refund" })).toBeTruthy();
  expect(decision.queryByRole("button", { name: "Record return" })).toBeNull();
  expect(decision.getByText("Original promise").nextElementSibling?.textContent).toContain("12:00");
  expect(decision.getByText("Agreed recovery deadline").nextElementSibling?.textContent).toContain("13:00");
  decision.unmount();

  const approved: H.HistoryRefundCase = { ...initial, refund: { ...initial.refund, status: "approved", approvedAt: agreedRecoveryDeadline } };
  const execution = render(<RefundCasePanel locale="en" mode="execution" href={route} initial={approved} action={action} />);
  expect(execution.getByText("Refund approved · return pending")).toBeTruthy();
  expect(execution.getByLabelText("External return reference").getAttribute("required")).not.toBeNull();
  expect(execution.getByRole("checkbox").getAttribute("required")).not.toBeNull();
  expect(execution.getByRole("button", { name: "Record return" })).toBeTruthy();
  expect(execution.queryByRole("button", { name: "Approve refund" })).toBeNull();
});
