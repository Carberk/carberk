export interface HistoryRequest {
  id: string;
  sourceListingId: string | null;
  createdAt: Date;
  assignedOperatorId: string | null;
  assignmentVersion: number;
}
export interface HistoryRequestRepository {
  create(input: { requesterId: string; sessionId: string; attemptKey: string; sourceListingId: string | null }): Promise<HistoryRequest>;
  list(requesterId: string, cursor?: string): Promise<{ items: HistoryRequest[]; nextCursor: string | null }>;
  find(requesterId: string, id: string): Promise<HistoryRequest | null>;
}
export const HISTORY_REQUEST_REPOSITORY = Symbol("HistoryRequestRepository");
