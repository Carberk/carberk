import { Inject, Injectable } from "@nestjs/common";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { historyAgreement } from "../domain/HistoryOrder";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import type { HistoryFulfilmentAuthority } from "../vehicle-history.public";
import { IDENTITY_READ_PORT, IDENTITY_CHECK_PORT, type IdentityReadPort, type IdentityCheckPort } from "../../identity/identity.public";

@Injectable()
export class HistoryFulfilmentGate implements HistoryFulfilmentAuthority {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly checks: IdentityCheckPort,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock) {}

  handoff(actor: HistoryMessageActor, id: string, expectedRevision: number) {
    if (!actor.operator) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    return this.access.run(actor, id, async (requester, actorId, _object, participant, _waiting, _offer, orders) => {
      const [owner, deleting] = await Promise.all([this.identity.findUserById(requester), this.checks.isDeletionScheduled(requester)]);
      if (!owner || owner.deleted || owner.suspendedAt || deleting) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
      const order = await orders.read();
      if (!order) throw new HistoryRequestError("HISTORY_ORDER_CONFLICT");
      const agreement = historyAgreement(order);
      if (!Number.isSafeInteger(expectedRevision) || agreement.pending || agreement.acceptedRevision !== expectedRevision) {
        throw new HistoryRequestError("HISTORY_CORRECTION_CONFLICT");
      }
      const accepted = agreement.accepted.at(-1);
      if (!accepted || !order.reservedProvider || !accepted.offer.preflight.providers.some(({ name }) => name === order.reservedProvider)) {
        throw new HistoryRequestError("HISTORY_ORDER_UNAVAILABLE");
      }
      if (agreement.handoff) return { accepted, handoff: agreement.handoff };
      const now = this.clock.now();
      if (!(await orders.paymentChecks()).some((check) => check.confirmedAt && check.bookingCommitted)
        || new Date(accepted.offer.proposal.deliveryBy) <= now || agreement.version === 2147483647) throw new HistoryRequestError("HISTORY_ORDER_STALE");
      const handoff = { revision: expectedRevision, recordedAt: now.toISOString() };
      await orders.saveAgreement({ input: { kind: "handoff", expectedRevision },
        state: { ...agreement, version: agreement.version + 1, handoff }, provider: order.reservedProvider,
        actorId, assignmentVersion: participant.assignmentVersion, recordedAt: handoff.recordedAt });
      return { accepted, handoff };
    });
  }
}
