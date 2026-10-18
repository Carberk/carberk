const day = 86400000, hour = 3600000;
export class HistoryDenied extends Error {}
export type HistoryPreflightOutcome = "available" | "malformed" | "unsupported" | "no_history" | "mismatch" | "temporary_failure";
export function normalizeVin(input: string): string {
 const vin = input.replace(/\s/g, "").toUpperCase();
 if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) throw new HistoryDenied("MALFORMED_VIN");
 return vin;
}
export function ashgabatDay(now: Date): string { return new Date(now.getTime() + 5 * hour).toISOString().slice(0, 10); }
export function staffed(now: Date): boolean { const t = now.getUTCHours() * hour + now.getUTCMinutes() * 60000 + now.getUTCSeconds() * 1000 + now.getUTCMilliseconds(); return t >= 4 * hour && t < 15 * hour; }
export function validateHistoryWindow(now: Date, start: Date, end: Date, feasible: boolean): void {
 const today = ashgabatDay(now), tomorrow = ashgabatDay(new Date(now.getTime() + day)), selected = ashgabatDay(start);
 if (!feasible || ![now, start, end].every(value => Number.isFinite(value.getTime())) || start < now || end <= start || ![today, tomorrow].includes(selected) || ashgabatDay(end) !== selected || !staffed(start)) throw new HistoryDenied("WINDOW_UNAVAILABLE");
 const close = new Date(`${selected}T15:00:00Z`), morning = new Date(`${selected}T05:00:00Z`);
 if (end > close || (selected === tomorrow && end > morning)) throw new HistoryDenied("WINDOW_UNAVAILABLE");
}
/** One staffed hour may cross close; it never extends the approved shift. */
export function addStaffedHour(now: Date): Date {
 const date = ashgabatDay(now), open = new Date(`${date}T04:00:00Z`), close = new Date(`${date}T15:00:00Z`);
 if (now < open) return new Date(open.getTime() + hour);
 if (now >= close) return new Date(open.getTime() + day + hour);
 const remaining = close.getTime() - now.getTime();
 return remaining >= hour ? new Date(now.getTime() + hour) : new Date(open.getTime() + day + hour - remaining);
}
export function receiptOutcome(hold: { expiresAt: Date; active: boolean }, receipt: { receivedAt: Date; verifiedAt: Date; amount: number; verifiedFunds: boolean }): "paid" | "review" {
 return hold.active && receipt.verifiedFunds && receipt.amount === 100 && receipt.receivedAt <= receipt.verifiedAt && receipt.receivedAt < hold.expiresAt && receipt.verifiedAt < hold.expiresAt && staffed(receipt.verifiedAt) ? "paid" : "review";
}
export function recoveryOutcome(state: { recoveryUsed: boolean; customerAgreed: boolean; deadline: Date | null }, agreedAt: Date): "agreed" | "refund_pending" {
 if (state.recoveryUsed || !state.customerAgreed) return "refund_pending";
 if (!state.deadline || state.deadline.getTime() !== addStaffedHour(agreedAt).getTime()) throw new HistoryDenied("RECOVERY_DEADLINE_INVALID");
 return "agreed";
}
