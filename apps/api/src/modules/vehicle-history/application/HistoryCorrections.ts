import { isDeepStrictEqual } from "node:util";
import { Inject, Injectable } from "@nestjs/common";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { HistoryCapacity } from "./HistoryCapacity";
import { HISTORY_PREFLIGHT, normalizeHistoryVin, type HistoryPreflightPort } from "../domain/HistoryOffer";
import { historyAgreement } from "../domain/HistoryOrder";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { IDENTITY_READ_PORT, IDENTITY_CHECK_PORT, type IdentityReadPort, type IdentityCheckPort } from "../../identity/identity.public";

@Injectable()
export class HistoryCorrections {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(HISTORY_PREFLIGHT) private readonly preflight: HistoryPreflightPort,
    @Inject(HistoryCapacity) private readonly capacity: HistoryCapacity,
    @Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly checks: IdentityCheckPort,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock) {}

  execute(actor: HistoryMessageActor, id: string, mutation?: H.HistoryCorrectionMutation | H.HistoryOperatorCorrectionMutation) {
    return this.access.run(actor, id, async (requester, actorId, _object, participant, _waiting, _offer, orders) => {
      const [owner, deleting] = await Promise.all([this.identity.findUserById(requester), this.checks.isDeletionScheduled(requester)]);
      if (!owner || owner.deleted || owner.suspendedAt || deleting) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
      const order = await orders.read();
      if (!order) throw new HistoryRequestError("HISTORY_ORDER_CONFLICT");
      const previous = historyAgreement(order);
      if (!mutation) return previous;
      if (actor.operator !== (mutation.kind === "review")) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
      const input = mutation.kind === "request" ? { ...mutation, vin: normalizeHistoryVin(mutation.vin) } : mutation;
      const retry = await orders.agreementAttempt(input.attemptKey);
      if (retry) {
        if (!isDeepStrictEqual(retry, input)) throw new HistoryRequestError("HISTORY_CORRECTION_CONFLICT");
        return previous;
      }
      if (previous.handoff) throw new HistoryRequestError("HISTORY_CORRECTION_CLOSED");
      if (previous.version !== input.expectedVersion || previous.version === 2147483647) throw new HistoryRequestError("HISTORY_CORRECTION_CONFLICT");
      return orders.serialize(async () => {
        const now = this.clock.now(), at = now.toISOString(), version = previous.version + 1;
        let state: H.HistoryCorrectionState = { ...previous, version };
        let provider = order.reservedProvider;
        if (input.kind === "request") {
          if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(input.vin) || input.vin === order.acceptedOffer.vin) throw new HistoryRequestError("HISTORY_CORRECTION_INVALID");
          state = { ...state, pending: { vin: input.vin, requestedAt: at, review: null } };
        } else if (input.kind === "review") {
          if (!previous.pending) throw new HistoryRequestError("HISTORY_CORRECTION_CONFLICT");
          const preflight = await this.preflight.check(previous.pending.vin);
          if (preflight?.status === "available") await this.capacity.correctionProvider(orders, order, preflight, now);
          const offer = { version, vin: previous.pending.vin, preflight, synthetic: true as const,
            proposal: preflight?.status === "available" ? { ...order.acceptedOffer.proposal, format: input.format } : null };
          state = { ...state, pending: { ...previous.pending, review: { offer, cause: input.cause } } };
        } else {
          const review = previous.pending?.review;
          if (!review || !isDeepStrictEqual(review.offer, input.offer)) throw new HistoryRequestError("HISTORY_CORRECTION_CONFLICT");
          provider = await this.capacity.correctionProvider(orders, order, input.offer.preflight, now);
          state = { ...state, pending: null, acceptedRevision: version,
            accepted: [...previous.accepted, { revision: version, offer: input.offer, acceptedAt: at, cause: review.cause }] };
        }
        provider ??= await this.capacity.existingProvider(orders, order, now);
        if (!provider) throw new HistoryRequestError("HISTORY_ORDER_CAPACITY");
        await orders.saveAgreement({ input, state, provider, actorId, assignmentVersion: participant.assignmentVersion, recordedAt: at });
        return state;
      });
    });
  }
}
