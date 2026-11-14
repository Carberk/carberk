import type { HistoryRequest } from "./HistoryRequestRepository";

export interface HistoryQueueQuery { filter?: "unassigned" | "mine" | undefined; search?: string | undefined; cursor?: string | undefined }
export interface HistoryQueueItem {
  id: string;
  createdAt: Date;
  assignmentVersion: number;
  mine: boolean;
}
export interface HistoryAssignmentRepository {
  list(operatorId: string, query: HistoryQueueQuery): Promise<{ items: HistoryQueueItem[]; nextCursor: string | null }>;
  /** The database arbitrates competing claims; no prior read grants a write. */
  claimUnassigned(operatorId: string, id: string, expectedVersion: number, confirmAuthority: () => Promise<void>): Promise<void>;
  findAssigned(operatorId: string, id: string): Promise<HistoryRequest | null>;
}
export const HISTORY_ASSIGNMENT_REPOSITORY = Symbol("HistoryAssignmentRepository");
