import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { HistoryRequestError } from "./HistoryRequestError";

export type StoredHistoryOrder = H.HistoryAcceptedOrder & { wallet: string };
export interface HistoryOrderStore {
  read(): Promise<StoredHistoryOrder | null>;
  serialize<T>(operation: () => Promise<T>): Promise<T>;
  capacity(day: string, from: Date, by: Date, now: Date): Promise<{ total: number; morning: number; overlapping: number }>;
  create(order: StoredHistoryOrder): Promise<void>;
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

export function historyOrderState(stored: StoredHistoryOrder | null, now: Date): H.HistoryOrderState {
  if (!stored) return { order: null, status: "enquiry", serverNow: now.toISOString(), wallet: null, collectionEnabled: false };
  const { wallet, ...order } = stored;
  const active = new Date(order.holdExpiresAt) > now;
  return { order, status: active ? "awaiting_synthetic_payment" : "hold_expired", serverNow: now.toISOString(),
    wallet: active ? wallet : null, collectionEnabled: false };
}
