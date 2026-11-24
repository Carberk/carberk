import { Inject, Injectable } from "@nestjs/common";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { historyOrderState } from "../domain/HistoryOrder";
import { historyDeliveryDeadline, settleHistoryRecovery } from "../domain/HistoryRecovery";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { IDENTITY_READ_PORT, IDENTITY_CHECK_PORT, type IdentityReadPort, type IdentityCheckPort } from "../../identity/identity.public";
import { readFulfilment } from "./HistoryFulfilment";
import { HistoryCapacity } from "./HistoryCapacity";

@Injectable()
export class ReadHistoryOrder {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock,
    @Inject(HistoryCapacity) private readonly capacity: HistoryCapacity,
    @Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly checks: IdentityCheckPort) {}

  execute(actor: HistoryMessageActor, id: string) {
    return this.access.run(actor, id, async (requesterId, _sender, _object, _participant, _waiting, _offer, orders) => {
      const [requester, deleting] = await Promise.all([this.identity.findUserById(requesterId), this.checks.isDeletionScheduled(requesterId)]);
      if (!requester || requester.deleted || requester.suspendedAt || deleting) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
      const order = await orders.read(), checks = await orders.paymentChecks(), proofs = await orders.submittedProofIds();
      const now = this.clock.now();
      const state = historyOrderState(order, now, checks, proofs.length > 0);
      const confirmedAt = state.status === "payment_confirmed" ? state.payment?.confirmedAt : null;
      if (!order || !confirmedAt) return state;
      const delivered = await orders.reportArtifacts.delivered(order.id);
      const intent = await orders.fulfilment();
      const recovery = await settleHistoryRecovery(orders, order, now, !!delivered, intent);
      if (recovery) state.recovery = recovery;
      state.preparation = delivered ? "delivered" : !intent ? "queued" : intent.status === "recovery" ? "recovery"
        : intent.status === "uncertain" ? "checking" : "preparing";
      if (actor.operator) {
        const deadline = historyDeliveryDeadline(order, recovery);
        const provider = intent?.accepted.provider ?? (!recovery?.agreedDeadline ? order.reservedProvider : undefined) ?? await orders.serialize(() =>
          this.capacity.existingProvider(orders, order, now, deadline, recovery?.status === "agreed"));
        const view = await readFulfilment(orders, order, intent, confirmedAt, now, provider, this.capacity, recovery);
        if (view) state.fulfilment = view;
        if (!provider) state.fulfilmentUnavailable = !deadline || deadline <= now ? "booking_closed" : "capacity";
        const reportPlan = await this.capacity.paidReportPlan(orders, order, confirmedAt, now);
        if (reportPlan) state.reportPlan = reportPlan;
      }
      return state;
    });
  }
}
