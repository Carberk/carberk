import { isDeepStrictEqual } from "node:util";
import { Inject, Injectable } from "@nestjs/common";
import type { HistoryPaymentSchemas as P } from "@auto-tm/contracts";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { historyPaymentDeadline, historyVerificationResumes } from "../domain/HistoryOrder";
import { IDENTITY_READ_PORT, IDENTITY_CHECK_PORT, type IdentityReadPort, type IdentityCheckPort } from "../../identity/identity.public";

@Injectable()
export class HistoryPayments {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock,
    @Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly checks: IdentityCheckPort) {}

  execute(actor: HistoryMessageActor, id: string, input?: P.HistoryPaymentCheckInput) {
    if (!actor.operator) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    return this.access.run(actor, id, async (requesterId, actorId, _object, _participant, _waiting, _offer, orders): Promise<P.HistoryPaymentVerification> => {
      const [requester, deleting] = await Promise.all([this.identity.findUserById(requesterId), this.checks.isDeletionScheduled(requesterId)]);
      if (!requester || requester.deleted || requester.suspendedAt || deleting) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
      const order = await orders.read();
      if (!order || input && order.id !== input.orderId) throw new HistoryRequestError("HISTORY_PAYMENT_CONFLICT");
      const checks = await orders.paymentChecks();
      const state = () => ({ orderId: order.id, version: checks.at(-1)?.version ?? 0, checks });
      if (!input) return state();
      const previous = checks.find((check) => check.input.attemptKey === input.attemptKey);
      if (previous) {
        if (!isDeepStrictEqual(previous.input, input)) throw new HistoryRequestError("HISTORY_PAYMENT_CONFLICT");
        return state();
      }
      if (checks.some((check) => check.confirmedAt) || input.expectedPaymentVersion !== state().version) throw new HistoryRequestError("HISTORY_PAYMENT_CONFLICT");
      if (input.evidenceFileId && !(await orders.submittedProofIds()).includes(input.evidenceFileId)) throw new HistoryRequestError("HISTORY_PAYMENT_INVALID");
      return orders.serialize(async () => {
        const now = this.clock.now();
        if (input.receivedAt && (new Date(input.receivedAt) > now || new Date(input.receivedAt) < new Date(order.acceptedAt))) {
          throw new HistoryRequestError("HISTORY_PAYMENT_INVALID");
        }
        if (historyVerificationResumes(now)) throw new HistoryRequestError("HISTORY_PAYMENT_CLOSED");
        const confirmedAt = input.outcome === "matched" ? now.toISOString() : null;
        const bookingCommitted = !!confirmedAt && historyPaymentDeadline(order) > now;
        const check = { input, actorId, checkedAt: now.toISOString(), confirmedAt, bookingCommitted, version: state().version + 1 };
        await orders.savePaymentCheck(check);
        checks.push(check);
        return state();
      });
    });
  }
}
