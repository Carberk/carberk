import { Inject, Injectable } from "@nestjs/common";
import { CurrentHistoryOperator } from "./CurrentHistoryOperator";
import type { HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { HistoryRequestProjection } from "./HistoryRequestProjection";
import { HISTORY_ASSIGNMENT_REPOSITORY, type HistoryAssignmentRepository } from "../domain/HistoryAssignmentRepository";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class ClaimHistoryRequest {
  constructor(
    @Inject(CurrentHistoryOperator) private readonly operator: CurrentHistoryOperator,
    @Inject(HISTORY_ASSIGNMENT_REPOSITORY) private readonly assignments: HistoryAssignmentRepository,
    @Inject(HistoryRequestProjection) private readonly projection: HistoryRequestProjection,
  ) {}
  async execute(claims: HistoryRequesterClaims, id: string, expectedVersion: number) {
    const actor = await this.operator.require(claims);
    await this.assignments.claimUnassigned(actor.id, id, expectedVersion, async () => { await this.operator.require(claims); });
    // A DB wait or uncertain retry never substitutes an earlier authority read.
    await this.operator.require(claims);
    const current = await this.assignments.findAssigned(actor.id, id);
    // Only the initial 0 -> 1 claim can recover its previous version. A later
    // assignment must not turn an old handover version into a claim retry.
    if (!current || (current.assignmentVersion !== expectedVersion && !(expectedVersion === 0 && current.assignmentVersion === 1))) {
      throw new HistoryRequestError("HISTORY_ASSIGNMENT_CONFLICT");
    }
    return this.projection.one(current);
  }
}
