import { Inject, Injectable } from "@nestjs/common";
import { CurrentHistoryOperator } from "./CurrentHistoryOperator";
import type { HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { HistoryQueueProjection } from "./HistoryQueueProjection";
import { HISTORY_ASSIGNMENT_REPOSITORY, type HistoryAssignmentRepository } from "../domain/HistoryAssignmentRepository";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class GetOperatorHistoryRequest {
  constructor(
    @Inject(CurrentHistoryOperator) private readonly operator: CurrentHistoryOperator,
    @Inject(HISTORY_ASSIGNMENT_REPOSITORY) private readonly assignments: HistoryAssignmentRepository,
    @Inject(HistoryQueueProjection) private readonly projection: HistoryQueueProjection,
  ) {}
  async execute(claims: HistoryRequesterClaims, id: string) {
    const actor = await this.operator.require(claims);
    const request = await this.assignments.findAssigned(actor.id, id);
    if (!request) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    const result = await this.projection.one(request, actor.id);
    const final = await this.assignments.findAssigned(actor.id, id);
    await this.operator.require(claims);
    if (!final || final.assignmentVersion !== request.assignmentVersion) throw new HistoryRequestError("HISTORY_ASSIGNMENT_CONFLICT");
    return result;
  }
}
