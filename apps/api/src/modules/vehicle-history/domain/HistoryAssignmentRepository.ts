import type { HistoryOfferStore } from "./HistoryOffer";
import type { HistoryRequest } from "./HistoryRequestRepository";
import type { HistoryWaitingFacts } from "./HistoryWaiting";

/** Valid only inside the existing request-lock callback; all work must be awaited. */
export interface HistoryWaitingStore {
  read(): Promise<HistoryWaitingFacts>;
  save(facts: HistoryWaitingFacts): Promise<void>;
}

export interface HistoryQueueQuery { filter?: "unassigned" | "mine" | undefined; search?: string | undefined; cursor?: string | undefined }
export interface HistoryQueueItem {
  id: string;
  createdAt: Date;
  assignmentVersion: number;
  requesterId: string;
  assignedOperatorId: string | null;
}
export interface HistoryMessageRequest {
  id: string; requesterId: string; assignedOperatorId: string | null; assignmentVersion: number;
}
export interface HistoryMessageAuthority { userId: string; sessionId: string; purpose: "vehicle-history" | null }
export interface HistoryHandoverAuthority { userId: string; sessionId: string; purpose: "vehicle-history"; recipientId: string }
export interface HistoryAssignmentRepository {
  /** Retain request and public Identity fences through the same-connection commit.
   * The callback must revalidate authority after both lock waits. */
  withMessageLock<T>(id: string, authority: HistoryMessageAuthority,
    operation: (request: HistoryMessageRequest | null, waiting: HistoryWaitingStore, offer: HistoryOfferStore) => Promise<T>): Promise<T>;
  list(operatorId: string, query: HistoryQueueQuery): Promise<{ items: HistoryQueueItem[]; nextCursor: string | null; anchor: HistoryQueueItem | null }>;
  confirmQueue(operatorId: string, query: HistoryQueueQuery, items: HistoryQueueItem[]): Promise<void>;
  /** The database arbitrates competing claims; no prior read grants a write. */
  claimUnassigned(operatorId: string, id: string, expectedVersion: number, confirmAuthority: () => Promise<void>): Promise<void>;
  handover(authority: HistoryHandoverAuthority, id: string, expectedVersion: number,
    confirmAuthority: () => Promise<void>): Promise<void>;
  findAssigned(operatorId: string, id: string): Promise<(HistoryRequest & { requesterId: string }) | null>;
}
export const HISTORY_ASSIGNMENT_REPOSITORY = Symbol("HistoryAssignmentRepository");
