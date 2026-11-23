import type { HistoryOrderSchemas as H, HistoryPaymentSchemas as P } from "@auto-tm/contracts";
import { HistoryRequestError } from "./HistoryRequestError";

export type StoredHistoryOrder = H.HistoryAcceptedOrder & { wallet: string };
export interface HistoryOrderStore {
  read(): Promise<StoredHistoryOrder | null>;
  serialize<T>(operation: () => Promise<T>): Promise<T>;
  capacity(day: string, from: Date, by: Date, now: Date): Promise<{ total: number; morning: number; overlapping: number }>;
  create(order: StoredHistoryOrder): Promise<void>;
  paymentChecks(): Promise<P.HistoryPaymentCheck[]>;
  savePaymentCheck(check: P.HistoryPaymentCheck): Promise<void>;
  submittedProofIds(): Promise<string[]>;
}

export function historyDeliveryDay(from: Date, by: Date, now: Date) {
  const local = (value: Date) => new Date(value.getTime() + 5 * 3_600_000);
  const day = local(from).toISOString().slice(0, 10);
  const today = local(now).toISOString().slice(0, 10);
  const tomorrow = local(new Date(now.getTime() + 86_400_000)).toISOString().slice(0, 10);
  const last = local(by);
  if (from <= now || by <= from || last.toISOString().slice(0, 10) !== day || ![today, tomorrow].includes(day)
    || local(from).getUTCHours() < 9 || last.getUTCHours() > 20
    || last.getUTCHours() === 20 && (last.getUTCMinutes() !== 0 || last.getUTCSeconds() !== 0 || last.getUTCMilliseconds() !== 0)
    || day === tomorrow && by > new Date(`${day}T10:00:00+05:00`)) throw new HistoryRequestError("HISTORY_ORDER_STALE");
  return day;
}

export function historyOrderState(stored: StoredHistoryOrder | null, now: Date, checks: P.HistoryPaymentCheck[] = [], submitted = false): H.HistoryOrderState {
  if (!stored) return { order: null, status: "enquiry", serverNow: now.toISOString(), wallet: null, collectionEnabled: false };
  const { wallet, ...order } = stored;
  const active = new Date(order.holdExpiresAt) > now;
  const check = checks.at(-1);
  const payment = check ? { outcome: check.input.outcome, amountMinor: check.input.amountMinor,
    receivedAt: check.input.receivedAt, confirmedAt: check.confirmedAt, bookingCommitted: check.bookingCommitted }
    : submitted ? { outcome: "receipt_submitted" as const, amountMinor: 0, receivedAt: null, confirmedAt: null, bookingCommitted: false } : undefined;
  const status = check?.confirmedAt ? check.bookingCommitted ? "payment_confirmed" : "payment_received_no_hold"
    : !active ? "hold_expired" : check ? "payment_review" : submitted ? "receipt_submitted" : "awaiting_synthetic_payment";
  return { order, status, serverNow: now.toISOString(), ...(payment ? { payment } : {}),
    wallet: active && !payment ? wallet : null, collectionEnabled: false };
}
