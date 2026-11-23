import { Inject, Injectable } from "@nestjs/common";
import { HistoryPrivateFileAccess, type HistoryFileActor } from "./HistoryPrivateFileAccess";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { paymentProof, requireActiveHistoryFile, HISTORY_PRIVATE_STORAGE, type HistoryPrivateStorage } from "../domain/HistoryPrivateFile";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";

@Injectable()
export class ReadHistoryPaymentProof {
  constructor(@Inject(HistoryPrivateFileAccess) private readonly access: HistoryPrivateFileAccess,
    @Inject(HISTORY_PRIVATE_STORAGE) private readonly storage: HistoryPrivateStorage,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock) {}

  execute(actor: HistoryFileActor, id: string, fileId: string, reason?: string) {
    return this.access.run(actor, id, async (files, userId) => {
      const file = await files.find(fileId); requireActiveHistoryFile(file, this.clock.now());
      if (await files.orderId() !== file.orderId) throw new HistoryRequestError("HISTORY_PROOF_CONFLICT");
      if (actor.kind !== "requester" && file.status !== "submitted" || file.status === "pending") throw new HistoryRequestError("HISTORY_PROOF_DENIED");
      const bytes = await this.storage.read(file);
      if (actor.kind === "historical") {
        if (!reason || reason.trim().length < 10 || reason.length > 500) throw new HistoryRequestError("HISTORY_PROOF_INVALID");
        await files.audit(userId, actor.claims.sid ?? "", file, reason);
      }
      return { file: paymentProof(file), dataBase64: Buffer.from(bytes).toString("base64") };
    });
  }

}
