import { Inject, Injectable } from "@nestjs/common";
import { CurrentHistoryOperator } from "./CurrentHistoryOperator";
import type { HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { HISTORY_ASSIGNMENT_REPOSITORY, type HistoryAssignmentRepository, type HistoryQueueQuery } from "../domain/HistoryAssignmentRepository";

@Injectable()
export class ListOperatorHistoryRequests {
  constructor(
    @Inject(CurrentHistoryOperator) private readonly operator: CurrentHistoryOperator,
    @Inject(HISTORY_ASSIGNMENT_REPOSITORY) private readonly assignments: HistoryAssignmentRepository,
  ) {}
  async execute(claims: HistoryRequesterClaims, query: HistoryQueueQuery) {
    const actor = await this.operator.require(claims);
    return this.assignments.list(actor.id, query);
  }
}
