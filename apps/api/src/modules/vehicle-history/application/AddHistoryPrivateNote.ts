import { Inject, Injectable } from "@nestjs/common";
import type { VehicleHistorySchemas } from "@auto-tm/contracts";
import type { HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { HistoryMessageAccess } from "./HistoryMessageAccess";
import { HistoryPrivateNoteProjection } from "./HistoryPrivateNoteProjection";
import { HISTORY_PRIVATE_NOTE_REPOSITORY, type HistoryPrivateNoteRepository } from "../domain/HistoryPrivateNoteRepository";

@Injectable()
export class AddHistoryPrivateNote {
  constructor(
    @Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(HISTORY_PRIVATE_NOTE_REPOSITORY) private readonly notes: HistoryPrivateNoteRepository,
    @Inject(HistoryPrivateNoteProjection) private readonly projection: HistoryPrivateNoteProjection,
  ) {}

  execute(claims: HistoryRequesterClaims, id: string, input: { clientNoteId: string; text: string;
    expectedAssignmentVersion: number }): Promise<VehicleHistorySchemas.HistoryPrivateNote> {
    return this.access.run({ claims, operator: true, expectedAssignmentVersion: input.expectedAssignmentVersion }, id,
      async (_requesterId, authorId, requestId) => {
        const note = await this.notes.append({ requestId, authorId, assignmentVersion: input.expectedAssignmentVersion,
          clientNoteId: input.clientNoteId, text: input.text });
        const [result] = await this.projection.many([note]);
        if (!result) throw new Error("Private note projection was empty");
        return result;
      });
  }
}
