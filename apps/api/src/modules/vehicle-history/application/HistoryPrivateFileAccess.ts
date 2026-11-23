import { Inject, Injectable } from "@nestjs/common";
import { HistoryPaymentProofSchemas as P } from "@auto-tm/contracts";
import { CurrentHistoryRequester, type HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { CurrentHistoryOperator } from "./CurrentHistoryOperator";
import { IDENTITY_READ_PORT, IDENTITY_CHECK_PORT, type IdentityReadPort, type IdentityCheckPort } from "../../identity/identity.public";
import { HISTORY_PRIVATE_FILES, type HistoryPrivateFileRepository, type HistoryPrivateFileStore } from "../domain/HistoryPrivateFile";
import { HistoryRequestError } from "../domain/HistoryRequestError";

export type HistoryFileActor = { claims: HistoryRequesterClaims; kind: "requester" | "operator" | "historical"; expectedAssignmentVersion?: number | undefined };
@Injectable()
export class HistoryPrivateFileAccess {
  constructor(@Inject(CurrentHistoryRequester) private readonly customer: CurrentHistoryRequester,
    @Inject(CurrentHistoryOperator) private readonly operator: CurrentHistoryOperator,
    @Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly checks: IdentityCheckPort,
    @Inject(HISTORY_PRIVATE_FILES) private readonly repository: HistoryPrivateFileRepository) {}

  async run<T>(actor: HistoryFileActor, id: string, work: (files: HistoryPrivateFileStore, userId: string) => Promise<T>) {
    if (!P.HistoricalPaymentEvidenceSchema.shape.requestId.safeParse(id).success) throw new HistoryRequestError("HISTORY_PROOF_INVALID");
    const purpose = actor.kind === "historical" ? "vehicle-history-payment-evidence" : actor.kind === "operator" ? "vehicle-history" : null;
    const authorize = async () => purpose ? (await this.operator.require(actor.claims, purpose)).id : (await this.customer.require(actor.claims)).requesterId;
    const userId = await authorize();
    return this.repository.run(id, { userId, sessionId: actor.claims.sid ?? "", purpose }, async (request, files) => {
      await authorize();
      if (!request || actor.kind === "requester" && request.requesterId !== userId
        || actor.kind === "operator" && request.assignedOperatorId !== userId) throw new HistoryRequestError("HISTORY_PROOF_DENIED");
      if (actor.kind === "operator" && actor.expectedAssignmentVersion !== request.assignmentVersion) throw new HistoryRequestError("HISTORY_ASSIGNMENT_CONFLICT");
      const ownerActive = async () => {
        const [user, deleting] = await Promise.all([this.identity.findUserById(request.requesterId), this.checks.isDeletionScheduled(request.requesterId)]);
        if (!user || user.deleted || user.suspendedAt || deleting) throw new HistoryRequestError("HISTORY_PROOF_DENIED");
      };
      await ownerActive();
      const result = await work(files, userId);
      await authorize(); await ownerActive();
      return result;
    });
  }
}
