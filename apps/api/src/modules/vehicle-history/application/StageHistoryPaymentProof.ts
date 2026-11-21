import { Inject, Injectable } from "@nestjs/common";
import { HistoryPrivateFileAccess, type HistoryFileActor } from "./HistoryPrivateFileAccess";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { paymentProof, requireActiveHistoryFile } from "../domain/HistoryPrivateFile";
import type { HistoryPaymentProofSchemas as P } from "@auto-tm/contracts";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";

@Injectable()
export class StageHistoryPaymentProof {
  constructor(@Inject(HistoryPrivateFileAccess) private readonly access: HistoryPrivateFileAccess,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock) {}

  execute(actor: HistoryFileActor, id: string, input: P.StagePaymentProof) {
    if (actor.kind !== "requester") throw new HistoryRequestError("HISTORY_PROOF_DENIED");
    return this.access.run(actor, id, async (files) => {
      if (await files.orderId() !== input.orderId) throw new HistoryRequestError("HISTORY_PROOF_CONFLICT");
      const previous = await files.attempt(input.attemptKey);
      if (previous) {
        if (previous.status === "deleted") throw new HistoryRequestError("HISTORY_PROOF_EXPIRED");
        requireActiveHistoryFile(previous, this.clock.now());
        if (previous.orderId !== input.orderId || previous.contentType !== input.contentType || previous.sizeBytes !== input.sizeBytes) throw new HistoryRequestError("HISTORY_PROOF_CONFLICT");
        return paymentProof(previous);
      }
      const active = (await files.list()).filter((file) => file.status === "submitted" || file.expiresAt > this.clock.now());
      if (active.length >= 10) throw new HistoryRequestError("HISTORY_PROOF_CONFLICT");
      return paymentProof(await files.create(input, this.clock.now()));
    });
  }

}
