import { isDeepStrictEqual } from "node:util";
import { Inject, Injectable } from "@nestjs/common";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { IDENTITY_READ_PORT, IDENTITY_CHECK_PORT, type IdentityReadPort, type IdentityCheckPort } from "../../identity/identity.public";
import { applyFulfilmentOutcome, checkFulfilmentVersion, fulfilmentAgreement, fulfilmentSources } from "../domain/HistoryFulfilment";
import { bookedPayment, historyAgreement, type HistoryOrderStore, type HistoryProvider, type StoredHistoryOrder } from "../domain/HistoryOrder";
import { historyDeliveryDeadline, settleHistoryRecovery } from "../domain/HistoryRecovery";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { HistoryCapacity } from "./HistoryCapacity";

export async function readFulfilment(orders: HistoryOrderStore, order: StoredHistoryOrder, intent: H.HistoryFulfilmentIntent | null,
  confirmedAt: string, now: Date, provider: HistoryProvider | undefined, capacity: HistoryCapacity,
  recovery: H.HistoryRecoveryState | null): Promise<H.HistoryFulfilmentView | undefined> {
  const accepted = fulfilmentAgreement(order, provider, recovery?.agreedFormat ?? undefined);
  if (!accepted) return undefined;
  const deadline = historyDeliveryDeadline(order, recovery);
  const gate = !deadline || deadline <= now ? "booking_closed"
    : order.agreement?.pending ? "pending_correction"
      : await orders.hasEarlierPaidWork(confirmedAt, now, intent?.status === "obtained" ? "delivery" : "fulfilment") ? "fifo" : "ready";
  if (order.acceptedOffer.preflight.archiveFormat) return { accepted, gate, sources: ["archive"], intent };
  const sources = fulfilmentSources(accepted);
  if (gate === "ready" && !await capacity.fulfilmentBudget(orders, order, accepted.provider, now, false, recovery?.status === "agreed")) {
    const available = sources.filter((source) => source !== "new_source");
    return { accepted, gate: !intent && available.length === 0 ? "capacity" : gate, sources: available, intent };
  }
  return { accepted, gate, sources, intent };
}

@Injectable()
export class HistoryFulfilment {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly checks: IdentityCheckPort,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock,
    @Inject(HistoryCapacity) private readonly capacity: HistoryCapacity) {}

  async execute(actor: HistoryMessageActor, id: string, input: H.HistoryFulfilmentMutation) {
    if (!actor.operator) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    const result = await this.access.run(actor, id, async (requester, actorId, _object, participant, _waiting, _offer, orders) => {
      const [owner, deleting] = await Promise.all([this.identity.findUserById(requester), this.checks.isDeletionScheduled(requester)]);
      if (!owner || owner.deleted || owner.suspendedAt || deleting) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
      const order = await orders.read();
      if (order?.id !== input.orderId) throw new HistoryRequestError("HISTORY_FULFILMENT_CONFLICT");
      const confirmedAt = bookedPayment(order, await orders.paymentChecks())?.confirmedAt;
      if (!confirmedAt) throw new HistoryRequestError("HISTORY_ORDER_STALE");
      return orders.serialize(async () => {
        const now = this.clock.now();
        const delivered = !!await orders.reportArtifacts.delivered(order.id);
        const existing = await orders.fulfilment();
        const recovery = await settleHistoryRecovery(orders, order, now, delivered, existing);
        const recovering = recovery?.status === "agreed";
        const deadline = historyDeliveryDeadline(order, recovery);
        const provider = existing?.accepted.provider ?? await this.capacity.existingProvider(orders, order, now, deadline, recovery);
        if (!provider) return new HistoryRequestError(!deadline || deadline <= now ? "HISTORY_ORDER_STALE" : "HISTORY_ORDER_CAPACITY");
        const current = await readFulfilment(orders, order, existing, confirmedAt, now, provider, this.capacity, recovery);
        if (!current) throw new HistoryRequestError("HISTORY_ORDER_UNAVAILABLE");
        const replay = await orders.fulfilmentAttempt(input.attemptKey);
        if (replay) {
          if (!isDeepStrictEqual(replay, input)) throw new HistoryRequestError("HISTORY_FULFILMENT_CONFLICT");
          return current;
        }
        if (delivered || recovery?.status === "refund_decision_pending") throw new HistoryRequestError("HISTORY_FULFILMENT_CONFLICT");
        checkFulfilmentVersion(current.intent, input.expectedVersion);
        const startsAttempt = input.kind === "start" || input.kind === "retry" || input.kind === "company_correction";
        const writingAt = this.clock.now();
        if (startsAttempt && (!deadline || writingAt >= deadline)) {
          await settleHistoryRecovery(orders, order, writingAt, false, existing);
          return new HistoryRequestError("HISTORY_ORDER_STALE");
        }
        const intent = this.transition(current, input, writingAt);
        const quota = startsAttempt && intent.source === "new_source" ? await this.capacity.fulfilmentBudget(
          orders, order, intent.accepted.provider, writingAt, input.kind === "company_correction", recovering,
        ) : { recoveryQuotaProvider: null };
        const admittedAt = this.clock.now();
        if (startsAttempt && deadline && admittedAt >= deadline) {
          await settleHistoryRecovery(orders, order, admittedAt, false, existing);
          return new HistoryRequestError("HISTORY_ORDER_STALE");
        }
        if (!quota) throw new HistoryRequestError("HISTORY_ORDER_CAPACITY");
        if (input.kind === "start") {
          const agreement = historyAgreement(order);
          if (agreement.handoff || agreement.version === 2147483647) throw new HistoryRequestError("HISTORY_FULFILMENT_CONFLICT");
          const handoff = { revision: intent.accepted.acceptedRevision, recordedAt: intent.recordedAt };
          await orders.saveAgreement({ input: { kind: "handoff", expectedRevision: handoff.revision },
            state: { ...agreement, version: agreement.version + 1, handoff },
            provider: recovering ? order.reservedProvider ?? null : intent.accepted.provider,
            actorId, assignmentVersion: participant.assignmentVersion, recordedAt: handoff.recordedAt });
          if (agreement.accepted.at(-1)?.cause === "company_error") intent.funding = "company";
        }
        await orders.saveFulfilment({ input, state: intent, actorId, assignmentVersion: participant.assignmentVersion, ...quota });
        await settleHistoryRecovery(orders, order, this.clock.now(), false, intent);
        return { ...current, intent };
      });
    });
    if (result instanceof HistoryRequestError) throw result;
    return result;
  }

  private transition(current: H.HistoryFulfilmentView, input: H.HistoryFulfilmentMutation, now: Date): H.HistoryFulfilmentIntent {
    const { accepted, gate, intent } = current;
    const recordedAt = now.toISOString();
    if (input.kind === "start") {
      if (gate === "pending_correction" || input.acceptedRevision !== accepted.acceptedRevision) {
        throw new HistoryRequestError("HISTORY_CORRECTION_CONFLICT");
      }
      if (intent || input.vin !== accepted.vin || input.provider !== accepted.provider || input.format !== accepted.format) {
        throw new HistoryRequestError("HISTORY_FULFILMENT_CONFLICT");
      }
      if (gate === "capacity" || gate === "ready" && !current.sources.includes(input.source)) throw new HistoryRequestError("HISTORY_ORDER_CAPACITY");
      if (gate !== "ready") throw new HistoryRequestError(gate === "fifo" ? "HISTORY_FULFILMENT_FIFO" : "HISTORY_ORDER_STALE");
      return { id: input.attemptKey, accepted, version: 1, attempt: 1, source: input.source, status: "pending",
        funding: "order", recordedAt };
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
      const { id, version, attempt, source, funding } = intent;
      return { id, version: version + 1, attempt: attempt + 1, source, funding: correction ? "company" : funding,
        accepted: intent.accepted, status: "pending", recordedAt };
    }
    throw new HistoryRequestError("HISTORY_FULFILMENT_CONFLICT");
  }
}
