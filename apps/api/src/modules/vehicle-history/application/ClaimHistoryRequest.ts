import { Inject, Injectable } from "@nestjs/common";
import { CurrentHistoryOperator } from "./CurrentHistoryOperator";
import type { HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { HistoryQueueProjection } from "./HistoryQueueProjection";
import { HISTORY_ASSIGNMENT_REPOSITORY, type HistoryAssignmentRepository } from "../domain/HistoryAssignmentRepository";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class ClaimHistoryRequest {
  constructor(
    @Inject(CurrentHistoryOperator) private readonly operator: CurrentHistoryOperator,
    @Inject(HISTORY_ASSIGNMENT_REPOSITORY) private readonly assignments: HistoryAssignmentRepository,
    @Inject(HistoryQueueProjection) private readonly projection: HistoryQueueProjection,
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
    const result = await this.projection.one(current, actor.id);
    const final = await this.assignments.findAssigned(actor.id, id);
    await this.operator.require(claims);
    if (!final || final.assignmentVersion !== current.assignmentVersion) throw new HistoryRequestError("HISTORY_ASSIGNMENT_CONFLICT");
    return result;
  }
}
