import { Inject, Injectable } from "@nestjs/common";
import { HistoryPrivateFileAccess, type HistoryFileActor } from "./HistoryPrivateFileAccess";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { paymentProof, requireActiveHistoryFile, HISTORY_PRIVATE_STORAGE, type HistoryPrivateStorage } from "../domain/HistoryPrivateFile";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";

@Injectable()
export class UploadHistoryPaymentProof {
  constructor(@Inject(HistoryPrivateFileAccess) private readonly access: HistoryPrivateFileAccess,
    @Inject(HISTORY_PRIVATE_STORAGE) private readonly storage: HistoryPrivateStorage,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock) {}

  execute(actor: HistoryFileActor, id: string, fileId: string, bytes: Uint8Array, contentType: string) {
    if (actor.kind !== "requester") throw new HistoryRequestError("HISTORY_PROOF_DENIED");
    return this.access.run(actor, id, async (files) => {
      const file = await files.find(fileId); requireActiveHistoryFile(file, this.clock.now());
      if (await files.orderId() !== file.orderId) throw new HistoryRequestError("HISTORY_PROOF_CONFLICT");
      if (file.contentType !== contentType) throw new HistoryRequestError("HISTORY_PROOF_INVALID");
      file.sha256 = await this.storage.put(file, bytes);
      requireActiveHistoryFile(file, this.clock.now());
      if (file.status !== "submitted") file.status = "uploaded";
      await files.save(file);
      return paymentProof(file);
    });
  }

}
