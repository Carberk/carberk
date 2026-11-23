import { Inject, Injectable } from "@nestjs/common";
import { HistoryPrivateFileAccess, type HistoryFileActor } from "./HistoryPrivateFileAccess";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { paymentProof } from "../domain/HistoryPrivateFile";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";

@Injectable()
export class ListHistoryPaymentProofs {
  constructor(@Inject(HistoryPrivateFileAccess) private readonly access: HistoryPrivateFileAccess,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock) {}

  execute(actor: HistoryFileActor, id: string) {
    if (actor.kind === "historical") throw new HistoryRequestError("HISTORY_PROOF_DENIED");
    return this.access.run(actor, id, async (files) => ({ items: (await files.list())
      .filter((file) => file.status === "submitted" || actor.kind === "requester" && file.expiresAt > this.clock.now()).map(paymentProof) }));
  }

}
