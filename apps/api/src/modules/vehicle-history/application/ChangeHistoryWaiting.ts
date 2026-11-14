import { Inject, Injectable } from "@nestjs/common";
import type { HistoryWaitingLifecycle, HistoryWaitingState } from "../vehicle-history.public";
import type { HistoryWaitingStore } from "../domain/HistoryAssignmentRepository";
import { HistoryWaiting, type HistoryWaitTransition } from "../domain/HistoryWaiting";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { SyncHistoryWaiting } from "./SyncHistoryWaiting";

@Injectable()
export class ChangeHistoryWaiting implements HistoryWaitingLifecycle {
  constructor(
    @Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(SyncHistoryWaiting) private readonly sync: SyncHistoryWaiting,
    @Inject(HistoryWaiting) private readonly policy: HistoryWaiting,
  ) {}

  change(actor: HistoryMessageActor, id: string, transition: HistoryWaitTransition) {
    return this.access.run(actor, id, (requesterId, _senderId, objectId, _participant, waiting) =>
      this.whileLocked(actor, requesterId, objectId, waiting, transition));
  }

  /** Same-context callers must already hold HistoryMessageAccess's authorized
   * callback. Use its semantic store, never reacquire the request/Identity locks.
   */
  async whileLocked(actor: HistoryMessageActor, requesterId: string, objectId: string,
    waiting: HistoryWaitingStore, transition: HistoryWaitTransition): Promise<HistoryWaitingState> {
    if (actor.operator === (transition.action === "stop")) {
      throw new HistoryRequestError(actor.operator ? "HISTORY_OPERATOR_DENIED" : "HISTORY_REQUEST_DENIED");
    }
    const facts = await this.sync.execute(requesterId, objectId, waiting);
    let changed;
    try { changed = this.policy.transition(facts, transition); }
    catch { throw new HistoryRequestError("HISTORY_MESSAGE_CONFLICT"); }
    if (changed !== facts) await waiting.save(changed);
    return { facts: changed, ineligible: this.policy.ineligible(changed) };
  }
}
