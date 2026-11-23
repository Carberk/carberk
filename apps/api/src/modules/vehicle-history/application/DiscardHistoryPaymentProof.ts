import { Inject, Injectable } from "@nestjs/common";
import { HistoryPrivateFileAccess, type HistoryFileActor } from "./HistoryPrivateFileAccess";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { paymentProof, HISTORY_PRIVATE_STORAGE, type HistoryPrivateStorage } from "../domain/HistoryPrivateFile";

@Injectable()
export class DiscardHistoryPaymentProof {
  constructor(@Inject(HistoryPrivateFileAccess) private readonly access: HistoryPrivateFileAccess,
    @Inject(HISTORY_PRIVATE_STORAGE) private readonly storage: HistoryPrivateStorage) {}

  execute(actor: HistoryFileActor, id: string, fileId: string) {
    if (actor.kind !== "requester") throw new HistoryRequestError("HISTORY_PROOF_DENIED");
    return this.access.run(actor, id, async (files) => {
      const file = await files.find(fileId);
      if (!file) throw new HistoryRequestError("HISTORY_PROOF_DENIED");
      if (file.status === "submitted") throw new HistoryRequestError("HISTORY_PROOF_CONFLICT");
      await this.storage.delete(file);
      file.status = "deleted"; await files.save(file);
      return paymentProof(file);
    });
  }
}
