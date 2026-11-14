import type { HistoryMessageActor } from "./application/HistoryMessageAccess";
import type { HistoryWaiting, HistoryWaitingFacts, HistoryWaitTransition } from "./domain/HistoryWaiting";

export { HISTORY_CLOCK, type HistoryClock, type HistoryWaitTransition } from "./domain/HistoryWaiting";
export type { HistoryMessageActor as HistoryWaitingActor } from "./application/HistoryMessageAccess";
export type HistoryWaitingState = { facts: HistoryWaitingFacts; ineligible: ReturnType<HistoryWaiting["ineligible"]> };
export const HISTORY_WAITING_LIFECYCLE = Symbol("HistoryWaitingLifecycle");

/** Trusted server lifecycle only. Begin/end/decline require the current assignee
 * and assignment version; stop requires the current requester. Revisions are
 * monotonically ordered per request, with stable source identity on retry.
 * Synchronizes committed messages before applying the expected waiting version.
 * Reminder read/Stop HTTP consumes this policy; manual send remains #1218.
 * This lifecycle seam exposes no quote transport or reminder append.
 */
export interface HistoryWaitingLifecycle {
  change(actor: HistoryMessageActor, id: string, transition: HistoryWaitTransition): Promise<HistoryWaitingState>;
}
