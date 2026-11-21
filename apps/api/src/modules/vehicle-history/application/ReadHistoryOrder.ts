import { Inject, Injectable } from "@nestjs/common";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { historyOrderState } from "../domain/HistoryOrder";

@Injectable()
export class ReadHistoryOrder {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock) {}

  execute(actor: HistoryMessageActor, id: string) {
    return this.access.run(actor, id, async (_requester, _sender, _object, _participant, _waiting, _offer, orders) =>
      historyOrderState(await orders.read(), this.clock.now()));
  }
}
