import { Inject, Injectable } from "@nestjs/common";
import type { HistoryOfferSchemas as O } from "@auto-tm/contracts";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { HISTORY_PREFLIGHT, normalizeHistoryVin, type HistoryPreflightPort } from "../domain/HistoryOffer";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryCapacity } from "./HistoryCapacity";
import { checkHistoryArchiveQuote } from "../domain/HistoryReportArtifact";

@Injectable()
export class HistoryOffers {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(HISTORY_PREFLIGHT) private readonly preflight: HistoryPreflightPort,
    @Inject(HistoryCapacity) private readonly capacity: HistoryCapacity,
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
      let archiveId: string | null | undefined;
      if (input.kind === "propose") {
        if (!actor.operator || previous.preflight?.status !== "available" || !previous.vin) throw new HistoryRequestError("HISTORY_OFFER_INVALID");
        await checkHistoryArchiveQuote(orders.reportArtifacts, previous.vin, previous.preflight, input.format);
        const from = new Date(input.deliveryFrom), by = new Date(input.deliveryBy), now = this.clock.now();
        try { await this.capacity.plan(orders, previous.preflight, from, by, now); }
        catch (error) {
          if (error instanceof HistoryRequestError && error.code === "HISTORY_ORDER_STALE") {
            throw new HistoryRequestError("HISTORY_OFFER_INVALID");
          }
          throw error;
        }
        next = { ...previous, version: previous.version + 1, proposal: { format: input.format,
          deliveryFrom: from.toISOString(), deliveryBy: by.toISOString(), priceTmt: 100,
          providerRule: "either_available_both_when_obtainable", terms: "service_failure_review" } };
      } else {
        if (input.kind === "check" && !actor.operator) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
        const vin = normalizeHistoryVin(input.vin);
        archiveId = input.kind === "check" ? input.archiveId ?? null : null;
        let preflight: O.HistoryOffer["preflight"];
        if (archiveId) {
          const original = previous.vin === vin ? await orders.reportArtifacts.archiveOriginal(archiveId, vin) : null;
          if (!original) throw new HistoryRequestError("HISTORY_OFFER_CONFLICT");
          const { provider, originalReportDate } = original.artifact.report;
          preflight = { status: "available", archiveFormat: original.availableFormat, providers: [{ name: provider, originalReportDate }] };
        } else preflight = input.kind === "check" ? await this.preflight.check(vin) : null;
        next = { version: previous.version + 1, vin, preflight, proposal: null, synthetic: true };
      }
      await store.save(next, archiveId);
      return next;
    });
  }
}
