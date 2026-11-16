import { Inject, Injectable } from "@nestjs/common";
import type { VehicleHistorySchemas } from "@auto-tm/contracts";
import { IDENTITY_READ_PORT, type IdentityReadPort } from "../../identity/identity.public";
import type { HistoryPrivateNoteRecord } from "../domain/HistoryPrivateNoteRepository";
import { HistoryRequestError } from "../domain/HistoryRequestError";

@Injectable()
export class HistoryPrivateNoteProjection {
  constructor(@Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort) {}

  async many(notes: HistoryPrivateNoteRecord[]): Promise<VehicleHistorySchemas.HistoryPrivateNote[]> {
    if (!notes.length) return [];
    const users = await this.identity.findUsersByIds([...new Set(notes.map((note) => note.authorId))]);
    const authors = new Map(users.map((user) => [user.id, user]));
    return notes.map((note) => {
      const author = authors.get(note.authorId);
      if (!author) throw new HistoryRequestError("HISTORY_NOTE_UNAVAILABLE");
      return { id: note.id, clientNoteId: note.clientNoteId, text: note.text,
        createdAt: note.createdAt.toISOString(), author: { id: author.id,
          displayName: author.deleted ? null : author.displayName, nameNumber: author.nameNumber } };
    });
  }
}
