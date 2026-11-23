import { isDeepStrictEqual } from "node:util";
import { Inject, Injectable } from "@nestjs/common";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { IDENTITY_CHECK_PORT, IDENTITY_READ_PORT, type IdentityCheckPort, type IdentityReadPort } from "../../identity/identity.public";
import { historyDeliveryDay, replacementState, type HistoryReplacementWrite } from "../domain/HistoryOrder";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { HistoryCapacity } from "./HistoryCapacity";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";

@Injectable()
export class HistoryReplacementBooking {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(HistoryCapacity) private readonly capacity: HistoryCapacity,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock,
    @Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly checks: IdentityCheckPort) {}

  execute(actor: HistoryMessageActor, id: string, input: H.HistoryReplacementMutation) {
    if (actor.operator !== ("expectedAssignmentVersion" in input)) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
    return this.access.run(actor, id, async (requester, actorId, _object, _participant, _waiting, _offer, orders) => {
      const [owner, deleting] = await Promise.all([this.identity.findUserById(requester), this.checks.isDeletionScheduled(requester)]);
      if (!owner || owner.deleted || owner.suspendedAt || deleting) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
      const order = await orders.read();
      const check = (await orders.paymentChecks()).at(-1);
      if (!order || order.id !== input.orderId || !check?.confirmedAt || check.bookingCommitted) {
        throw new HistoryRequestError("HISTORY_REPLACEMENT_CONFLICT");
      }
      return orders.serialize(async (): Promise<H.HistoryReplacementState> => {
        const now = this.clock.now();
        const previous = replacementState(order, now);
        const retry = await orders.replacementAttempt(input.attemptKey);
        if (retry) {
          if (!isDeepStrictEqual(retry, input)) throw new HistoryRequestError("HISTORY_REPLACEMENT_CONFLICT");
          return previous;
        }
        if (previous.version !== input.expectedVersion || previous.version === 2147483647
          || previous.status === "accepted" || previous.status === "refund_decision_pending") {
          throw new HistoryRequestError("HISTORY_REPLACEMENT_CONFLICT");
        }
        const version = previous.version + 1;
        const recordedAt = now.toISOString();
        let state: H.HistoryReplacementState;
        let booking: HistoryReplacementWrite["booking"];
        if (input.kind === "no_window" || input.kind === "decline") {
          if (input.kind === "decline" && previous.status !== "proposed" && previous.status !== "expired") {
            throw new HistoryRequestError("HISTORY_REPLACEMENT_CONFLICT");
          }
          state = { status: "refund_decision_pending", version, reason: input.kind === "decline" ? "declined" : "no_window", requestedAt: recordedAt };
        } else {
          let window;
          if (input.kind === "propose") {
            window = { deliveryFrom: input.deliveryFrom, deliveryBy: input.deliveryBy };
          } else {
            if (previous.status !== "proposed") throw new HistoryRequestError("HISTORY_REPLACEMENT_CONFLICT");
            window = previous.window;
          }
          const from = new Date(window.deliveryFrom), by = new Date(window.deliveryBy);
          try {
            const plan = await this.capacity.plan(orders, order.acceptedOffer.preflight, from, by, now, true);
            historyDeliveryDay(from, by, this.clock.now());
            if (input.kind === "accept") booking = plan;
          } catch (error) {
            if (error instanceof HistoryRequestError && error.code === "HISTORY_ORDER_CAPACITY") throw new HistoryRequestError("HISTORY_REPLACEMENT_CAPACITY");
            if (error instanceof HistoryRequestError && error.code === "HISTORY_ORDER_STALE") throw new HistoryRequestError("HISTORY_REPLACEMENT_CONFLICT");
            throw error;
          }
          state = input.kind === "propose" ? { status: "proposed", version, window }
            : { status: "accepted", version, window, acceptedAt: recordedAt };
        }
        await orders.saveReplacement({ input, state, actorId, acceptedRevision: order.agreement?.acceptedRevision ?? 0,
          recordedAt, ...(booking ? { booking } : {}) });
        return state;
      });
    });
  }
}
