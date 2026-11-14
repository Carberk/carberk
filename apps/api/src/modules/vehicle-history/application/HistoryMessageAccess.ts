import { Inject, Injectable } from "@nestjs/common";
import { ServiceMessagesSchemas } from "@auto-tm/contracts";
import { ServiceMessageError } from "../../business-messaging/business-messaging.public";
import { MESSAGE_AUTHORITY_FENCE_PORT, type MessageAuthorityFencePort } from "../../identity/identity.public";
import { CurrentHistoryRequester, type HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { CurrentHistoryOperator } from "./CurrentHistoryOperator";
import { HISTORY_ASSIGNMENT_REPOSITORY, type HistoryAssignmentRepository } from "../domain/HistoryAssignmentRepository";
import { HistoryRequestError } from "../domain/HistoryRequestError";

export interface HistoryMessageActor { claims: HistoryRequesterClaims; operator: boolean; expectedAssignmentVersion?: number | undefined }
@Injectable()
export class HistoryMessageAccess {
  constructor(
    @Inject(CurrentHistoryRequester) private readonly requester: CurrentHistoryRequester,
    @Inject(CurrentHistoryOperator) private readonly operator: CurrentHistoryOperator,
    @Inject(HISTORY_ASSIGNMENT_REPOSITORY) private readonly assignments: HistoryAssignmentRepository,
    @Inject(MESSAGE_AUTHORITY_FENCE_PORT) private readonly identityFence: MessageAuthorityFencePort,
  ) {}
  async run<T>(actor: HistoryMessageActor, id: string, operation: (requesterId: string, senderId: string, objectId: string) => Promise<T>) {
    const authorize = async () => actor.operator ? (await this.operator.require(actor.claims)).id
      : (await this.requester.require(actor.claims)).requesterId;
    const userId = await authorize();
    const key = ServiceMessagesSchemas.ServiceStreamSchema.shape.objectId.safeParse(id);
    if (!key.success) throw new HistoryRequestError("HISTORY_MESSAGE_INVALID");
    try {
      return await this.assignments.withMessageLock(key.data, (request) => this.identityFence.withSession({
        userId, sessionId: actor.claims.sid ?? "", purpose: actor.operator ? "vehicle-history" : null,
      }, async () => {
        // Authority is current after any DB wait, before intent/cursor lookup.
        const senderId = await authorize();
        if (!request || (actor.operator ? request.assignedOperatorId !== senderId : request.requesterId !== senderId)) {
          throw new HistoryRequestError(actor.operator ? "HISTORY_OPERATOR_DENIED" : "HISTORY_REQUEST_DENIED");
        }
        if (actor.operator && request.assignmentVersion !== actor.expectedAssignmentVersion) {
          throw new HistoryRequestError("HISTORY_ASSIGNMENT_CONFLICT");
        }
        return operation(request.requesterId, senderId, request.id);
      }));
    } catch (error) {
      if (error instanceof HistoryRequestError) throw error;
      const code = error instanceof ServiceMessageError ? error.code : "SERVICE_MESSAGE_UNAVAILABLE";
      throw new HistoryRequestError(code === "SERVICE_MESSAGE_INTENT_CONFLICT" ? "HISTORY_MESSAGE_CONFLICT"
        : code === "SERVICE_MESSAGE_INVALID_CURSOR" ? "HISTORY_MESSAGE_CURSOR"
          : code === "SERVICE_MESSAGE_INVALID_INPUT" ? "HISTORY_MESSAGE_INVALID" : "HISTORY_MESSAGE_UNAVAILABLE");
    }
  }
}
