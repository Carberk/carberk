import type { HistoryOrderSchemas as H, HistoryPaymentSchemas as P } from "@auto-tm/contracts";
import { historyBookingWindow, type StoredHistoryOrder } from "./HistoryOrder";

export interface HistoryRefundEvent {
  input: H.HistoryRefundCommand;
  actorId: string;
  recordedAt: string;
}

export function historyRefundReason(order: StoredHistoryOrder, recovery: H.HistoryRecoveryState | null) {
  const replacement = order.replacement?.state;
  if (recovery?.pendingReason) return recovery.pendingReason;
  if (replacement?.status === "refund_decision_pending") {
    return replacement.reason === "declined" ? "replacement_declined" : "no_window";
  }
  return null;
}

export function historyRefundCase(order: StoredHistoryOrder, payment: P.HistoryPaymentCheck | undefined,
  recovery: H.HistoryRecoveryState | null, events: HistoryRefundEvent[]): H.HistoryRefundCase | null {
  if (payment?.input.outcome !== "matched" || !payment.confirmedAt || !payment.input.receivedAt) return null;
  const reason = historyRefundReason(order, recovery);
  if (!reason) return null;

  const { format, priceTmt } = order.acceptedOffer.proposal;
  const { deliveryFrom, deliveryBy } = historyBookingWindow(order);
  const facts = { amountMinor: payment.input.amountMinor, originalPromiseBy: recovery?.originalPromiseBy ?? deliveryBy,
    agreedRecoveryDeadline: recovery?.agreedDeadline ?? null };
  const decision = events.find(({ input }) => input.kind === "approve");
  const execution = events.find(({ input }) => input.kind === "execute");
  const refund: H.HistoryRefundState = decision
    ? execution?.input.kind === "execute"
      ? { ...facts, status: "completed", approvedAt: decision.recordedAt, recordedAt: execution.recordedAt, externalReference: execution.input.externalReference }
      : { ...facts, status: "approved", approvedAt: decision.recordedAt }
    : { ...facts, status: "pending" };
  return {
    order: { id: order.id, vin: order.acceptedOffer.vin, priceMinor: priceTmt * 100, format, window: { deliveryFrom, deliveryBy } },
    payment: { amountMinor: facts.amountMinor, receivedAt: payment.input.receivedAt, confirmedAt: payment.confirmedAt, reference: payment.input.reference },
    reason, failure: recovery?.failure ?? null, refund,
  };
}
