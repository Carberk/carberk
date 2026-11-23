import type { HistoryMessageActor } from "./application/HistoryMessageAccess";
import type { HistoryWaiting, HistoryWaitingFacts, HistoryWaitTransition } from "./domain/HistoryWaiting";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";

export const HISTORY_FULFILMENT_AUTHORITY = Symbol("HistoryFulfilmentAuthority");
export interface HistoryFulfilmentAuthority {
  handoff(actor: HistoryMessageActor, id: string, expectedRevision: number): Promise<{
    accepted: H.HistoryCorrectionState["accepted"][number];
    handoff: NonNullable<H.HistoryCorrectionState["handoff"]>;
  }>;
}

export { HISTORY_CLOCK, type HistoryClock, type HistoryWaitTransition } from "./domain/HistoryWaiting";
export type { HistoryMessageActor as HistoryWaitingActor } from "./application/HistoryMessageAccess";
export type HistoryWaitingState = { facts: HistoryWaitingFacts; ineligible: ReturnType<HistoryWaiting["ineligible"]> };
export const HISTORY_WAITING_LIFECYCLE = Symbol("HistoryWaitingLifecycle");

/** Trusted server lifecycle only. Begin/end/decline require the current assignee
 * and assignment version; stop requires the current requester. Revisions are
 * monotonically ordered per request, with stable source identity on retry.
 * Synchronizes committed messages before applying the expected waiting version.
 * Reminder read/send/Stop HTTP consumes this policy under the same fence.
 * This lifecycle seam exposes no quote transport or reminder append.
 */
export interface HistoryWaitingLifecycle {
  change(actor: HistoryMessageActor, id: string, transition: HistoryWaitTransition): Promise<HistoryWaitingState>;
}
