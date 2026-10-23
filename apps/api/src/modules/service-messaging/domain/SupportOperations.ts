import { ServiceDenied } from "./serviceAccess";

export type SupportCategory = "exposure" | "account" | "ordinary";
export interface SupportState { status: "open" | "closed"; closedAt: Date | null; unansweredSince: Date | null; awaitingCustomerSince: Date | null; investigation: boolean; category: SupportCategory; escalatedAt: Date | null }
export type SupportAction = { kind: "customer_message" | "private_note" | "reply" | "request_information" | "close_resolved" | "reopen" | "investigate" | "investigation_done" } | { kind: "notice" | "close_awaiting"; reason: string } | { kind: "category"; category: SupportCategory };
const day = 86400000, hour = 3600000;
/** Asia/Ashgabat is UTC+05:00, with the approved daily 09:00–20:00 shift.
 * Overnight age remains in unansweredSince; this counts staffed time only. */
export function staffedMilliseconds(start: Date, end: Date): number {
 const from = start.getTime(), until = end.getTime();
 if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) return 0;
 const first = Math.floor(from / day), last = Math.floor(until / day);
 const within = (index: number) => Math.max(0, Math.min(until, index * day + 15 * hour) - Math.max(from, index * day + 4 * hour));
 return first === last ? within(first) : within(first) + Math.max(0, last - first - 1) * 11 * hour + within(last);
}
export function transitionSupport(state: SupportState, action: SupportAction, now: Date): SupportState {
 const next = { ...state };
 const reopen = () => { next.status = "open"; next.closedAt = null; };
 switch (action.kind) {
  case "customer_message": reopen(); next.unansweredSince ??= now; next.awaitingCustomerSince = null; break;
  case "private_note": break;
  case "reply": reopen(); next.unansweredSince = null; next.awaitingCustomerSince = null; break;
  case "request_information": reopen(); next.unansweredSince = null; next.awaitingCustomerSince = now; break;
  case "notice": if (!action.reason.trim()) throw new ServiceDenied("INVALID_MESSAGE"); reopen(); break;
  case "reopen": reopen(); break;
  case "investigate": reopen(); next.investigation = true; break;
  case "investigation_done": next.investigation = false; break;
  case "category": next.category = action.category; if (action.category === "exposure") next.escalatedAt ??= now; break;
  case "close_awaiting":
   if (!action.reason.trim() || !state.awaitingCustomerSince || now.getTime() - state.awaitingCustomerSince.getTime() < 14 * day) throw new ServiceDenied("INVALID_MESSAGE");
   if (state.investigation || state.unansweredSince) throw new ServiceDenied("INVALID_MESSAGE"); next.status = "closed"; next.closedAt = now; break;
  case "close_resolved":
   if (state.investigation || state.unansweredSince) throw new ServiceDenied("INVALID_MESSAGE"); next.status = "closed"; next.closedAt = now; break;
 }
 return next;
}
