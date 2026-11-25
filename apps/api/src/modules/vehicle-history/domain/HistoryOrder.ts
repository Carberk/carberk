import type { HistoryOfferSchemas as O, HistoryOrderSchemas as H, HistoryPaymentSchemas as P } from "@auto-tm/contracts";
import type { HistoryRefundEvent } from "./HistoryRefund";
import type { HistoryReportStore } from "./HistoryReportArtifact";
import { HistoryRequestError } from "./HistoryRequestError";

export type AvailableHistoryReports = Extract<NonNullable<O.HistoryOffer["preflight"]>, { status: "available" }>;
export type HistoryProvider = AvailableHistoryReports["providers"][number]["name"];
export type HistoryPaidProviderPriority = { confirmedBefore: string | null };
export type HistoryProviderUsageOptions = { excludeCurrent?: boolean; unreserved?: "all" | "none" | HistoryPaidProviderPriority };
export type StoredHistoryOrder = H.HistoryAcceptedOrder & { wallet: string; reservedProvider?: HistoryProvider;
  agreement?: H.HistoryCorrectionState; originalOffer?: H.HistoryAcceptedOrder["acceptedOffer"];
  replacement?: { state: H.HistoryReplacementState; current: boolean } };
export interface HistoryReplacementWrite {
  input: H.HistoryReplacementMutation; state: H.HistoryReplacementState; actorId: string;
  acceptedRevision: number; recordedAt: string; booking?: { day: string; provider: HistoryProvider };
}
export type HistoryAgreementInput = H.HistoryCorrectionMutation | H.HistoryOperatorCorrectionMutation | { kind: "handoff"; expectedRevision: number };
export interface HistoryAgreementWrite {
  input: HistoryAgreementInput; state: H.HistoryCorrectionState; provider: HistoryProvider | null;
  actorId: string; assignmentVersion: number; recordedAt: string;
}
export interface HistoryFulfilmentWrite {
  input: H.HistoryFulfilmentMutation | { kind: "recovery_format"; attemptKey: string; format: H.HistoryFulfilmentView["accepted"]["format"] };
  state: H.HistoryFulfilmentIntent; actorId: string; assignmentVersion: number;
  recoveryQuotaProvider?: HistoryProvider | null;
}
export type HistoryRecoveryCommand = H.HistoryOperatorRecovery | H.HistoryRecoveryDecision;

export interface HistoryOrderStore {
  readonly assignmentVersion: number;
  reportArtifacts: HistoryReportStore;
  read(): Promise<StoredHistoryOrder | null>;
  serialize<T>(operation: () => Promise<T>): Promise<T>;
  capacity(day: string, from: Date, by: Date, now: Date, excludeCurrent?: boolean): Promise<{ total: number; morning: number; overlapping: number }>;
  providerUsage(provider: HistoryProvider, periodStart: Date, periodEnd: Date, now: Date, options?: HistoryProviderUsageOptions): Promise<number>;
  earlierPaidOrdersForSecondReport(provider: HistoryProvider, periodStart: Date, periodEnd: Date, confirmedAt: string, now: Date): Promise<number>;
  create(order: Omit<StoredHistoryOrder, "reservedProvider">, provider: HistoryProvider): Promise<void>;
  paymentChecks(): Promise<P.HistoryPaymentCheck[]>;
  savePaymentCheck(check: P.HistoryPaymentCheck): Promise<void>;
  replacementAttempt(key: string): Promise<H.HistoryReplacementMutation | null>;
  saveReplacement(write: HistoryReplacementWrite): Promise<void>;
  submittedProofIds(): Promise<string[]>;
  agreementAttempt(key: string): Promise<HistoryAgreementInput | null>;
  saveAgreement(write: HistoryAgreementWrite): Promise<void>;
  fulfilment(): Promise<H.HistoryFulfilmentIntent | null>;
  fulfilmentAttempt(key: string): Promise<H.HistoryFulfilmentMutation | null>;
  hasEarlierPaidWork(confirmedAt: string | null, now: Date, stage?: "fulfilment" | "delivery"): Promise<boolean>;
  saveFulfilment(write: HistoryFulfilmentWrite): Promise<void>;
  refundEvents(): Promise<HistoryRefundEvent[]>;
  appendRefund(event: HistoryRefundEvent, paymentVersion: number): Promise<void>;
  recovery(): Promise<H.HistoryRecoveryState | null>;
  recoveryAttempt(key: string): Promise<{ input: HistoryRecoveryCommand; actorId: string } | null>;
  saveRecovery(state: H.HistoryRecoveryState, now: Date, command?: { input: HistoryRecoveryCommand; actorId: string; assignmentVersion: number }): Promise<void>;
}

export function replacementState(order: StoredHistoryOrder, now: Date): H.HistoryReplacementState {
  const replacement = order.replacement;
  if (!replacement) return { status: "awaiting_proposal", version: 0 };
  const { state, current } = replacement;
  if (state.status !== "proposed") return state;
  if (!current) return { ...state, status: "superseded" };
  return new Date(state.window.deliveryFrom) <= now ? { ...state, status: "expired" } : state;
}

export function historyBookingWindow(order: StoredHistoryOrder) {
  const replacement = order.replacement?.state;
  return replacement?.status === "accepted" ? replacement.window : order.acceptedOffer.proposal;
}

export function bookedPayment(order: StoredHistoryOrder, checks: P.HistoryPaymentCheck[]) {
  return checks.find((check) => check.confirmedAt && (check.bookingCommitted || order.replacement?.state.status === "accepted"));
}

const ashgabat = (date: Date) => new Date(date.getTime() + 5 * 3_600_000);
export function historyVerificationResumes(now: Date, holdExpiresAt = now): Date | null {
  const local = ashgabat(now);
  const day = local.toISOString().slice(0, 10);
  const morning = new Date(`${day}T09:00:00+05:00`);
  if (local.getUTCHours() < 9) return morning;
  return holdExpiresAt >= new Date(`${day}T20:00:00+05:00`) ? new Date(morning.getTime() + 86_400_000) : null;
}

export function historyAgreement(order: StoredHistoryOrder): H.HistoryCorrectionState {
  return order.agreement ?? { version: 0, acceptedRevision: 0, pending: null, handoff: null,
    accepted: [{ revision: 0, offer: order.acceptedOffer, acceptedAt: order.acceptedAt, cause: null }] };
}

export function historyDeliveryDay(from: Date, by: Date, now: Date) {
  const day = ashgabat(from).toISOString().slice(0, 10);
  const today = ashgabat(now).toISOString().slice(0, 10);
  const tomorrow = ashgabat(new Date(now.getTime() + 86_400_000)).toISOString().slice(0, 10);
  const last = ashgabat(by);
  if (from <= now || by <= from || last.toISOString().slice(0, 10) !== day || ![today, tomorrow].includes(day)
    || ashgabat(from).getUTCHours() < 9 || last.getUTCHours() > 20
    || last.getUTCHours() === 20 && (last.getUTCMinutes() !== 0 || last.getUTCSeconds() !== 0 || last.getUTCMilliseconds() !== 0)
    || day === tomorrow && by > new Date(`${day}T10:00:00+05:00`)) throw new HistoryRequestError("HISTORY_ORDER_STALE");
  return day;
}

export function historyPaymentDeadline(order: StoredHistoryOrder) {
  const { deliveryBy } = (order.originalOffer ?? order.acceptedOffer).proposal;
  return new Date(Math.min(Date.parse(order.holdExpiresAt), Date.parse(deliveryBy)));
}

export function historyOrderState(stored: StoredHistoryOrder | null, now: Date, checks: P.HistoryPaymentCheck[] = [], submitted = false): H.HistoryOrderState {
  if (!stored) return { order: null, status: "enquiry", serverNow: now.toISOString(), wallet: null, collectionEnabled: false };
  const { wallet, id, acceptedOffer, deliveryDay, acceptedAt, holdExpiresAt } = stored;
  const order = { id, acceptedOffer, deliveryDay, acceptedAt, holdExpiresAt };
  const deadline = historyPaymentDeadline(stored);
  const active = deadline > now;
  const check = checks.at(-1);
  const committed = !!bookedPayment(stored, checks);
  const replacement = check?.confirmedAt && !check.bookingCommitted ? replacementState(stored, now) : undefined;
  const verificationResumes = !check?.confirmedAt && historyVerificationResumes(now, active ? deadline : now);
  const payment = check ? { outcome: check.input.outcome, amountMinor: check.input.amountMinor,
    receivedAt: check.input.receivedAt, confirmedAt: check.confirmedAt, bookingCommitted: committed }
    : submitted ? { outcome: "receipt_submitted" as const, amountMinor: 0, receivedAt: null, confirmedAt: null, bookingCommitted: false } : undefined;
  const status = check?.confirmedAt ? committed ? "payment_confirmed" : "payment_received_no_hold"
    : !active ? "hold_expired" : check ? "payment_review" : submitted ? "receipt_submitted" : "awaiting_synthetic_payment";
  return { order, status, serverNow: now.toISOString(), ...(stored.agreement ? { agreement: stored.agreement } : {}), ...(payment ? { payment } : {}),
    ...(deadline.getTime() < Date.parse(holdExpiresAt) ? { paymentDeadline: deadline.toISOString() } : {}),
    ...(replacement ? { replacement } : {}), ...(verificationResumes ? { verificationResumesAt: verificationResumes.toISOString() } : {}),
    wallet: active && !payment && !stored.agreement?.pending ? wallet : null, collectionEnabled: false };
}
