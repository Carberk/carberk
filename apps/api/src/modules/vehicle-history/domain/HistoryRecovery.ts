import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { coversHistoryFormat } from "./HistoryFulfilment";
import { historyBookingWindow, historyPaymentDeadline, type HistoryOrderStore, type StoredHistoryOrder } from "./HistoryOrder";

type Recovery = H.HistoryRecoveryState;
export const HISTORY_RECOVERY_QUEUE = Symbol("HistoryRecoveryQueue");
export interface HistoryRecoveryQueue {
  due(testers: string[], now: Date, after: string): Promise<string[]>;
  settle(id: string, testers: string[], work: (requesterId: string, orders: HistoryOrderStore) => Promise<void>): Promise<void>;
}
const hour = 3_600_000;
const day = 24 * hour;

function extraStaffedHour(now: Date) {
  const localDay = new Date(now.getTime() + 5 * hour).toISOString().slice(0, 10);
  const opens = Date.parse(localDay + "T09:00:00+05:00");
  const closes = Date.parse(localDay + "T20:00:00+05:00");
  const start = Math.max(opens, now.getTime());
  return new Date(start + hour <= closes ? start + hour : opens + day + hour - Math.max(0, closes - start)).toISOString();
}

function initialRecovery(order: StoredHistoryOrder): Recovery {
  return {
    version: 0, status: "attention", originalPromiseBy: historyBookingWindow(order).deliveryBy,
    paymentHoldExpiresAt: order.holdExpiresAt, paymentDeadline: historyPaymentDeadline(order).toISOString(),
    originalFormat: order.acceptedOffer.proposal.format, failure: null, missedAt: null, offeredDeadline: null,
    agreedDeadline: null, agreedAt: null, proposedFormat: null, agreedFormat: null, pendingReason: null, refundRequestedAt: null,
  };
}

export function refundReview(state: Recovery, reason: NonNullable<Recovery["pendingReason"]>, now: Date): Recovery {
  return { ...state, version: state.version + 1, status: "refund_decision_pending", pendingReason: reason, refundRequestedAt: now.toISOString() };
}

export async function settleHistoryRecovery(orders: HistoryOrderStore, order: StoredHistoryOrder, now: Date,
  delivered: boolean, intent: H.HistoryFulfilmentIntent | null, failure?: NonNullable<Recovery["failure"]>) {
  const saved = await orders.recovery();
  if (delivered || saved?.status === "refund_decision_pending") return saved;
  const current = saved ?? initialRecovery(order);
  const reason = failure ?? (intent?.status === "recovery" ? intent.reason : null);
  const report = intent && "report" in intent ? intent.report : null;
  const proposedFormat = current.proposedFormat && !current.agreedFormat && (!report || !coversHistoryFormat(current.proposedFormat, report.format))
    ? null : current.proposedFormat;
  const observed = { ...current, proposedFormat, failure: reason ?? current.failure };
  let next: Recovery;
  if (current.status === "agreed" && current.agreedDeadline && now >= new Date(current.agreedDeadline)) {
    next = refundReview(observed, "recovery_missed", now);
  } else if (current.status === "offered" && current.offeredDeadline && now >= new Date(current.offeredDeadline)) {
    next = refundReview(observed, "offer_elapsed", now);
  } else if (reason === "no_history") {
    next = refundReview(observed, "no_history", now);
  } else if (current.status === "attention" && now >= new Date(current.originalPromiseBy)) {
    const offerStarts = new Date(Math.ceil(now.getTime() / 1000) * 1000);
    next = { ...observed, version: current.version + 1, status: "offered", missedAt: now.toISOString(), offeredDeadline: extraStaffedHour(offerStarts) };
  } else if (observed.failure !== current.failure || proposedFormat !== current.proposedFormat) {
    next = { ...observed, version: current.version + 1 };
  } else {
    return saved;
  }
  await orders.saveRecovery(next, now);
  return next;
}

export function historyDeliveryDeadline(order: StoredHistoryOrder, recovery: Recovery | null) {
  if (recovery?.status === "offered" || recovery?.status === "refund_decision_pending") return null;
  return new Date(recovery?.agreedDeadline ?? historyBookingWindow(order).deliveryBy);
}
