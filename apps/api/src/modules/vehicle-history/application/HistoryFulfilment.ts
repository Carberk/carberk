import { isDeepStrictEqual } from "node:util";
import { Inject, Injectable } from "@nestjs/common";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { IDENTITY_READ_PORT, IDENTITY_CHECK_PORT, type IdentityReadPort, type IdentityCheckPort } from "../../identity/identity.public";
import { applyFulfilmentOutcome, checkFulfilmentVersion, fulfilmentAgreement, fulfilmentSources } from "../domain/HistoryFulfilment";
import { historyAgreement, type HistoryOrderStore, type StoredHistoryOrder } from "../domain/HistoryOrder";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { HistoryCapacity } from "./HistoryCapacity";

export async function readFulfilment(orders: HistoryOrderStore, order: StoredHistoryOrder, intent: H.HistoryFulfilmentIntent | null,
  operatorId: string, confirmedAt: string, now: Date): Promise<H.HistoryFulfilmentView | undefined> {
  const accepted = fulfilmentAgreement(order);
  if (!accepted) return undefined;
  const gate = order.agreement?.pending ? "pending_correction"
    : new Date(order.acceptedOffer.proposal.deliveryBy) <= now ? "booking_closed"
      : await orders.hasEarlierPaidWork(operatorId, confirmedAt, now) ? "fifo" : "ready";
  return { accepted, gate, sources: fulfilmentSources(accepted), intent };
}

@Injectable()
export class HistoryFulfilment {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly checks: IdentityCheckPort,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock,
    @Inject(HistoryCapacity) private readonly capacity: HistoryCapacity) {}

  execute(actor: HistoryMessageActor, id: string, input: H.HistoryFulfilmentMutation) {
    if (!actor.operator) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    return this.access.run(actor, id, async (requester, actorId, _object, participant, _waiting, _offer, orders) => {
      const [owner, deleting] = await Promise.all([this.identity.findUserById(requester), this.checks.isDeletionScheduled(requester)]);
      if (!owner || owner.deleted || owner.suspendedAt || deleting) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
      const order = await orders.read();
      if (order?.id !== input.orderId) throw new HistoryRequestError("HISTORY_FULFILMENT_CONFLICT");
      const confirmedAt = (await orders.paymentChecks()).find((check) => check.bookingCommitted)?.confirmedAt;
      if (!confirmedAt) throw new HistoryRequestError("HISTORY_ORDER_STALE");
      return orders.serialize(async () => {
        const now = this.clock.now();
        const current = await readFulfilment(orders, order, await orders.fulfilment(), actorId, confirmedAt, now);
        if (!current) throw new HistoryRequestError("HISTORY_ORDER_UNAVAILABLE");
        const replay = await orders.fulfilmentAttempt(input.attemptKey);
        if (replay) {
          if (!isDeepStrictEqual(replay, input)) throw new HistoryRequestError("HISTORY_FULFILMENT_CONFLICT");
          return current;
        }
        checkFulfilmentVersion(current.intent, input.expectedVersion);
        const intent = await this.transition(orders, order, current, input, actorId, participant.assignmentVersion, now);
        await orders.saveFulfilment({ input, state: intent, actorId, assignmentVersion: participant.assignmentVersion });
        return { ...current, intent };
      });
    });
  }

  private async transition(orders: HistoryOrderStore, order: StoredHistoryOrder, current: H.HistoryFulfilmentView,
    input: H.HistoryFulfilmentMutation, actorId: string, assignmentVersion: number, now: Date): Promise<H.HistoryFulfilmentIntent> {
    const { accepted, gate, intent } = current;
    const recordedAt = now.toISOString();
    if (input.kind === "start") {
      if (gate === "pending_correction" || input.acceptedRevision !== accepted.acceptedRevision) {
        throw new HistoryRequestError("HISTORY_CORRECTION_CONFLICT");
      }
      if (intent || input.vin !== accepted.vin || input.provider !== accepted.provider || input.format !== accepted.format
        || !current.sources.includes(input.source)) throw new HistoryRequestError("HISTORY_FULFILMENT_CONFLICT");
      if (gate !== "ready") throw new HistoryRequestError(gate === "fifo" ? "HISTORY_FULFILMENT_FIFO" : "HISTORY_ORDER_STALE");
      const agreement = historyAgreement(order);
      if (agreement.handoff || agreement.version === 2147483647) throw new HistoryRequestError("HISTORY_FULFILMENT_CONFLICT");
      if (input.source === "new_source") await this.capacity.requireFulfilmentBudget(orders, order, accepted.provider, now, false);
      const handoff = { revision: accepted.acceptedRevision, recordedAt };
      await orders.saveAgreement({ input: { kind: "handoff", expectedRevision: accepted.acceptedRevision },
        state: { ...agreement, version: agreement.version + 1, handoff }, provider: accepted.provider, actorId, assignmentVersion, recordedAt });
      return { id: input.attemptKey, accepted, version: 1, attempt: 1, source: input.source, status: "pending",
        funding: agreement.accepted.at(-1)?.cause === "company_error" ? "company" : "order", recordedAt };
    }
    if (!intent) throw new HistoryRequestError("HISTORY_FULFILMENT_CONFLICT");
    if (input.kind === "record" && (intent.status === "pending" || intent.status === "obtained" && input.outcome.kind === "company_error")
      || input.kind === "reconcile" && intent.status === "uncertain" && (input.outcome.kind !== "not_started" || intent.source === "new_source")) {
      return applyFulfilmentOutcome(intent, input.outcome, recordedAt);
    }
    const correction = input.kind === "company_correction";
    if (input.kind === "retry" && intent.status === "retry_ready" || correction && intent.status === "recovery" && intent.reason === "company_error") {
      if (gate === "fifo") throw new HistoryRequestError("HISTORY_FULFILMENT_FIFO");
      if (gate !== "ready") throw new HistoryRequestError("HISTORY_ORDER_STALE");
      if (intent.source === "new_source") await this.capacity.requireFulfilmentBudget(orders, order, accepted.provider, now, correction);
      const { id, version, attempt, source, funding } = intent;
      return { id, version: version + 1, attempt: attempt + 1, source, funding: correction ? "company" : funding,
        accepted: intent.accepted, status: "pending", recordedAt };
    }
    throw new HistoryRequestError("HISTORY_FULFILMENT_CONFLICT");
  }
}
