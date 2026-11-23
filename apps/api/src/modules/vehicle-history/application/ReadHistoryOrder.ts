import { Inject, Injectable } from "@nestjs/common";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { historyOrderState } from "../domain/HistoryOrder";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { IDENTITY_READ_PORT, IDENTITY_CHECK_PORT, type IdentityReadPort, type IdentityCheckPort } from "../../identity/identity.public";

@Injectable()
export class ReadHistoryOrder {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock,
    @Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly checks: IdentityCheckPort) {}

  execute(actor: HistoryMessageActor, id: string) {
    return this.access.run(actor, id, async (requesterId, _sender, _object, _participant, _waiting, _offer, orders) => {
      const [requester, deleting] = await Promise.all([this.identity.findUserById(requesterId), this.checks.isDeletionScheduled(requesterId)]);
      if (!requester || requester.deleted || requester.suspendedAt || deleting) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
      const order = await orders.read(), checks = await orders.paymentChecks(), proofs = await orders.submittedProofIds();
      return historyOrderState(order, this.clock.now(), checks, proofs.length > 0);
    });
  }
}
