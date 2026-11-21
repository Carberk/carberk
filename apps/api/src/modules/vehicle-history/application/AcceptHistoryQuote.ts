import { isDeepStrictEqual } from "node:util";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import type { Env } from "../../../env.schema";
import { SyncHistoryWaiting } from "./SyncHistoryWaiting";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { historyDeliveryDay, historyOrderState } from "../domain/HistoryOrder";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class AcceptHistoryQuote {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(SyncHistoryWaiting) private readonly sync: SyncHistoryWaiting,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}


  execute(actor: HistoryMessageActor, id: string, input: H.AcceptHistoryQuote) {
    if (actor.operator) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
    return this.access.run(actor, id, async (requester, _sender, objectId, _participant, waiting, offer, orders) => {
      const previous = await orders.read();
      if (previous) {
        if (!isDeepStrictEqual(previous.acceptedOffer, input.offer)) throw new HistoryRequestError("HISTORY_ORDER_CONFLICT");
        return historyOrderState(previous, this.clock.now());
      }
      if (!isDeepStrictEqual(await offer.read(), input.offer)) throw new HistoryRequestError("HISTORY_ORDER_STALE");
      const facts = await this.sync.execute(requester, objectId, waiting);
      return orders.serialize(async () => {
        const now = this.clock.now();
        const quote = input.offer.proposal;
        const from = new Date(quote.deliveryFrom), by = new Date(quote.deliveryBy);
        const day = historyDeliveryDay(from, by, now);
        const wallet = this.config.get("VEHICLE_HISTORY_SYNTHETIC_WALLET", { infer: true });
        if (!wallet || !/^SYNTHETIC-[A-Z0-9-]{1,64}$/.test(wallet)) throw new HistoryRequestError("HISTORY_ORDER_UNAVAILABLE");
        const daily = this.config.get("VEHICLE_HISTORY_SYNTHETIC_DAILY_STAFF_SLOTS", { infer: true }) ?? 0;
        const morning = this.config.get("VEHICLE_HISTORY_SYNTHETIC_MORNING_SLOTS", { infer: true }) ?? 0;
        const used = await orders.capacity(day, from, by, now);
        if (used.total >= daily || used.overlapping > 0 || by <= new Date(`${day}T10:00:00+05:00`) && used.morning >= morning) {
          throw new HistoryRequestError("HISTORY_ORDER_CAPACITY");
        }
        const order = { id, acceptedOffer: input.offer, deliveryDay: day, wallet,
          acceptedAt: now.toISOString(), holdExpiresAt: new Date(now.getTime() + 2 * 3_600_000).toISOString() };
        await orders.create(order);
        await waiting.save({ ...facts, reason: null, since: null, version: facts.version + 1 });
        return historyOrderState(order, now);
      });
    });
  }
}
