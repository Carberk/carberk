import { Inject, Injectable } from "@nestjs/common";
import { HistoryPrivateFileAccess, type HistoryFileActor } from "./HistoryPrivateFileAccess";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { paymentProof, requireActiveHistoryFile, HISTORY_PRIVATE_STORAGE, type HistoryPrivateStorage } from "../domain/HistoryPrivateFile";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";

@Injectable()
export class SubmitHistoryPaymentProof {
  constructor(@Inject(HistoryPrivateFileAccess) private readonly access: HistoryPrivateFileAccess,
    @Inject(HISTORY_PRIVATE_STORAGE) private readonly storage: HistoryPrivateStorage,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock) {}

  execute(actor: HistoryFileActor, id: string, fileId: string, orderId: string) {
    if (actor.kind !== "requester") throw new HistoryRequestError("HISTORY_PROOF_DENIED");
    return this.access.run(actor, id, async (files) => {
      if (await files.orderId() !== orderId) throw new HistoryRequestError("HISTORY_PROOF_CONFLICT");
      const file = await files.find(fileId); requireActiveHistoryFile(file, this.clock.now());
      if (file.orderId !== orderId || !["uploaded", "submitted"].includes(file.status)) throw new HistoryRequestError("HISTORY_PROOF_CONFLICT");
      await this.storage.read(file);
      requireActiveHistoryFile(file, this.clock.now());
      if (file.status !== "submitted") {
        file.status = "submitted"; file.submittedAt = this.clock.now(); await files.save(file);
      }
      return paymentProof(file);
    });
  }

}
