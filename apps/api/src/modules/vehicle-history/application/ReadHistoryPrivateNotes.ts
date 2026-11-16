import { Inject, Injectable } from "@nestjs/common";
import type { VehicleHistorySchemas } from "@auto-tm/contracts";
import type { HistoryRequesterClaims } from "./CurrentHistoryRequester";
import { HistoryMessageAccess } from "./HistoryMessageAccess";
import { HistoryPrivateNoteProjection } from "./HistoryPrivateNoteProjection";
import { HISTORY_PRIVATE_NOTE_REPOSITORY, type HistoryPrivateNoteRepository } from "../domain/HistoryPrivateNoteRepository";

@Injectable()
export class ReadHistoryPrivateNotes {
  constructor(
    @Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(HISTORY_PRIVATE_NOTE_REPOSITORY) private readonly notes: HistoryPrivateNoteRepository,
    @Inject(HistoryPrivateNoteProjection) private readonly projection: HistoryPrivateNoteProjection,
  ) {}

  execute(claims: HistoryRequesterClaims, id: string, query: { expectedAssignmentVersion: number;
    cursor?: string | undefined; limit: number }): Promise<VehicleHistorySchemas.HistoryPrivateNotesPage> {
    return this.access.run({ claims, operator: true, expectedAssignmentVersion: query.expectedAssignmentVersion }, id,
      async (_requesterId, _authorId, requestId) => {
        const page = await this.notes.page({ requestId, cursor: query.cursor, limit: query.limit });
        return { items: await this.projection.many(page.items), nextCursor: page.nextCursor };
      });
  }
}
