import { Inject, Injectable } from "@nestjs/common";
import { CurrentHistoryOperator } from "./CurrentHistoryOperator";
import type { HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { HistoryRequestProjection } from "./HistoryRequestProjection";
import { HISTORY_ASSIGNMENT_REPOSITORY, type HistoryAssignmentRepository } from "../domain/HistoryAssignmentRepository";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class GetOperatorHistoryRequest {
  constructor(
    @Inject(CurrentHistoryOperator) private readonly operator: CurrentHistoryOperator,
    @Inject(HISTORY_ASSIGNMENT_REPOSITORY) private readonly assignments: HistoryAssignmentRepository,
    @Inject(HistoryRequestProjection) private readonly projection: HistoryRequestProjection,
  ) {}
  async execute(claims: HistoryRequesterClaims, id: string) {
    const actor = await this.operator.require(claims);
    const request = await this.assignments.findAssigned(actor.id, id);
    if (!request) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    return this.projection.one(request);
  }
}
