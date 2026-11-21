import { Inject, Injectable } from "@nestjs/common";
import type { HistoryOfferSchemas as O } from "@auto-tm/contracts";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { HISTORY_PREFLIGHT, normalizeHistoryVin, type HistoryPreflightPort } from "../domain/HistoryOffer";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class HistoryOffers {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(HISTORY_PREFLIGHT) private readonly preflight: HistoryPreflightPort,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock) {}

  read(actor: HistoryMessageActor, id: string) {
    return this.access.run(actor, id, async (_requester, _sender, _object, _participant, _waiting, offer) => offer.read());
  }

  change(actor: HistoryMessageActor, id: string, input: O.HistoryOperatorOfferMutation | { kind: "vin"; vin: string; expectedVersion: number }) {
    return this.access.run(actor, id, async (_requester, _sender, _object, _participant, _waiting, store, orders) => {
      if (await orders.read()) throw new HistoryRequestError("HISTORY_ORDER_CONFLICT");
      const previous = await store.read();
      if (previous.version !== input.expectedVersion || previous.version === 2147483647) throw new HistoryRequestError("HISTORY_OFFER_CONFLICT");
      let next: O.HistoryOffer;
      if (input.kind === "propose") {
        if (!actor.operator || previous.preflight?.status !== "available" || !previous.vin) throw new HistoryRequestError("HISTORY_OFFER_INVALID");
        const from = new Date(input.deliveryFrom), by = new Date(input.deliveryBy), now = this.clock.now();
        const local = (date: Date) => new Date(date.getTime() + 5 * 3_600_000);
        const first = local(from), last = local(by), today = local(now).toISOString().slice(0, 10);
        const tomorrow = local(new Date(now.getTime() + 86_400_000)).toISOString().slice(0, 10);
        const day = first.toISOString().slice(0, 10);
        if (from <= now || by <= from || last.toISOString().slice(0, 10) !== day || ![today, tomorrow].includes(day)
          || first.getUTCHours() < 9 || last.getUTCHours() > 20
          || last.getUTCHours() === 20 && (last.getUTCMinutes() !== 0 || last.getUTCSeconds() !== 0 || last.getUTCMilliseconds() !== 0)) {
          throw new HistoryRequestError("HISTORY_OFFER_INVALID");
        }
        next = { ...previous, version: previous.version + 1, proposal: { format: input.format,
          deliveryFrom: from.toISOString(), deliveryBy: by.toISOString(), priceTmt: 100,
          providerRule: "either_available_both_when_obtainable", terms: "service_failure_review" } };
      } else {
        if (input.kind === "check" && !actor.operator) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
        const vin = normalizeHistoryVin(input.vin);
        next = { version: previous.version + 1, vin,
          preflight: input.kind === "check" ? await this.preflight.check(vin) : null, proposal: null, synthetic: true };
      }
      await store.save(next);
      return next;
    });
  }
}
