import type { HistoryPaymentProofSchemas as P } from "@auto-tm/contracts";
import { HistoryRequestError } from "./HistoryRequestError";
import type { HistoryMessageRequest } from "./HistoryAssignmentRepository";

export type HistoryPrivateFile = Omit<P.PaymentProof, "createdAt" | "expiresAt" | "submittedAt"> & {
  requestId: string; attemptKey: string; sha256: string | null; policy: "synthetic_payment_evidence_only";
  createdAt: Date; expiresAt: Date; submittedAt: Date | null;
};
export interface HistoryPrivateFileStore {
  orderId(): Promise<string | null>;
  attempt(key: string): Promise<HistoryPrivateFile | null>;
  find(id: string): Promise<HistoryPrivateFile | null>;
  list(): Promise<HistoryPrivateFile[]>;
  create(input: P.StagePaymentProof, now: Date): Promise<HistoryPrivateFile>;
  save(file: HistoryPrivateFile): Promise<void>;
  audit(actorId: string, sessionId: string, file: HistoryPrivateFile, reason: string): Promise<void>;
}
export interface HistoryFileAuthority { userId: string; sessionId: string; purpose: "vehicle-history" | "vehicle-history-payment-evidence" | null }
export interface HistoryPrivateFileRepository {
  run<T>(requestId: string, authority: HistoryFileAuthority | null,
    work: (request: HistoryMessageRequest | null, files: HistoryPrivateFileStore) => Promise<T>): Promise<T>;
  expired(now: Date): Promise<{ requestId: string; id: string }[]>;
}
export const HISTORY_PRIVATE_FILES = Symbol("HistoryPrivateFileRepository");
export interface HistoryPrivateStorage {
  put(file: HistoryPrivateFile, bytes: Uint8Array): Promise<string>;
  read(file: HistoryPrivateFile): Promise<Uint8Array>;
  delete(file: HistoryPrivateFile): Promise<void>;
}
export const HISTORY_PRIVATE_STORAGE = Symbol("HistoryPrivateStorage");
export function paymentProof(file: HistoryPrivateFile): P.PaymentProof {
  return { id: file.id, orderId: file.orderId, purpose: file.purpose, contentType: file.contentType, sizeBytes: file.sizeBytes,
    status: file.status, createdAt: file.createdAt.toISOString(), expiresAt: file.expiresAt.toISOString(), submittedAt: file.submittedAt?.toISOString() ?? null };
}

export function requireActiveHistoryFile(file: HistoryPrivateFile | null, now: Date): asserts file is HistoryPrivateFile {
  if (!file || file.purpose !== "payment_evidence" || file.policy !== "synthetic_payment_evidence_only") throw new HistoryRequestError("HISTORY_PROOF_DENIED");
  if (file.status === "deleted") throw new HistoryRequestError("HISTORY_PROOF_CONFLICT");
  if (file.status !== "submitted" && file.expiresAt <= now) throw new HistoryRequestError("HISTORY_PROOF_EXPIRED");
}
