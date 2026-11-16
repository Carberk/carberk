export interface HistoryPrivateNoteRecord {
  id: string;
  requestId: string;
  authorId: string;
  assignmentVersion: number;
  clientNoteId: string;
  text: string;
  sequence: bigint;
  createdAt: Date;
}

export interface HistoryPrivateNoteRepository {
  append(input: { requestId: string; authorId: string; assignmentVersion: number;
    clientNoteId: string; text: string }): Promise<HistoryPrivateNoteRecord>;
  page(input: { requestId: string; cursor?: string | undefined; limit: number }): Promise<{
    items: HistoryPrivateNoteRecord[]; nextCursor: string | null;
  }>;
}

export const HISTORY_PRIVATE_NOTE_REPOSITORY = Symbol("HistoryPrivateNoteRepository");
