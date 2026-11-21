import { Inject, Injectable } from "@nestjs/common";
import { CurrentHistoryOperator } from "./CurrentHistoryOperator";
import type { HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { HISTORY_ASSIGNMENT_REPOSITORY, type HistoryAssignmentRepository } from "../domain/HistoryAssignmentRepository";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class HandoverHistoryRequest {
  constructor(
    @Inject(CurrentHistoryOperator) private readonly operator: CurrentHistoryOperator,
    @Inject(HISTORY_ASSIGNMENT_REPOSITORY) private readonly assignments: HistoryAssignmentRepository,
  ) {}

  async execute(claims: HistoryRequesterClaims, id: string, targetId: string, expectedVersion: number) {
    const actor = await this.operator.require(claims);
    if (actor.id === targetId || expectedVersion === 2147483647) {
      throw new HistoryRequestError("HISTORY_REQUEST_INVALID");
    }
    const target = await this.operator.requireAssignable(targetId);
    await this.assignments.handover({ userId: actor.id, sessionId: claims.sid ?? "", purpose: "vehicle-history",
      recipientId: target.id }, id, expectedVersion, async () => {
      await this.operator.require(claims);
      await this.operator.requireAssignable(target.id);
    });
    return { id, assignmentVersion: expectedVersion + 1, assignedOperator: target };
  }
}
