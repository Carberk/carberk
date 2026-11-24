import { isDeepStrictEqual } from "node:util";
import { Inject, Injectable } from "@nestjs/common";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { IDENTITY_CHECK_PORT, IDENTITY_READ_PORT, type IdentityCheckPort, type IdentityReadPort } from "../../identity/identity.public";
import { HISTORY_ASSIGNMENT_REPOSITORY, type HistoryAssignmentRepository } from "../domain/HistoryAssignmentRepository";
import { historyRefundCase } from "../domain/HistoryRefund";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { CurrentHistoryOperator } from "./CurrentHistoryOperator";
import { CurrentHistoryRequester, type HistoryRequesterClaims } from "./CurrentHistoryRequester";

@Injectable()
export class HistoryRefunds {
  constructor(
    @Inject(CurrentHistoryOperator) private readonly staff: CurrentHistoryOperator,
    @Inject(CurrentHistoryRequester) private readonly requesters: CurrentHistoryRequester,
    @Inject(HISTORY_ASSIGNMENT_REPOSITORY) private readonly assignments: HistoryAssignmentRepository,
    @Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly checks: IdentityCheckPort,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock,
  ) {}

  async execute(claims: HistoryRequesterClaims, id: string, mode: "decision" | "execution", input?: H.HistoryRefundCommand) {
    const purpose = mode === "decision" ? "vehicle-history-refund-decision" : "vehicle-history-refund-execution";
    const authorize = () => this.staff.require(claims, purpose);
    const actor = await authorize();
    return this.assignments.withMessageLock(id, { userId: actor.id, sessionId: claims.sid ?? "", purpose },
      async (request, _waiting, _offer, orders) => {
        await authorize();
        if (!request) throw new HistoryRequestError("HISTORY_REFUND_NOT_FOUND");
        const [owner, deleting] = await Promise.all([
          this.identity.findUserById(request.requesterId), this.checks.isDeletionScheduled(request.requesterId),
        ]);
        if (!this.requesters.admits(request.requesterId) || !owner || owner.deleted || owner.suspendedAt || deleting) {
          throw new HistoryRequestError("HISTORY_REFUND_NOT_FOUND");
        }

        const order = await orders.read();
        const payment = (await orders.paymentChecks()).find((check) => check.confirmedAt);
        const recovery = await orders.recovery();
        const events = await orders.refundEvents();
        const current = order && historyRefundCase(order, payment, recovery, events);
        if (!order || !payment || !current || await orders.reportArtifacts.delivered(order.id)) {
          throw new HistoryRequestError("HISTORY_REFUND_NOT_FOUND");
        }

        if (input) {
          const retry = events.find((event) => event.input.attemptKey === input.attemptKey);
          if (retry) {
            if (retry.actorId !== actor.id || !isDeepStrictEqual(retry.input, input)) this.conflict();
          } else {
            if (input.orderId !== order.id || input.amountMinor !== current.payment.amountMinor
              || (input.kind === "approve" ? current.refund.status !== "pending"
                : current.refund.status !== "approved")) this.conflict();
            const event = { input, actorId: actor.id, recordedAt: this.clock.now().toISOString() };
            await orders.appendRefund(event, payment.version);
            events.push(event);
          }
        }
        await authorize();
        if (!this.requesters.admits(request.requesterId)) throw new HistoryRequestError("HISTORY_REFUND_NOT_FOUND");
        return historyRefundCase(order, payment, recovery, events) ?? current;
      });
  }

  private conflict(): never {
    throw new HistoryRequestError("HISTORY_REFUND_CONFLICT");
  }
}
