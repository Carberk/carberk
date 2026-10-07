/** Durable deletion work recorded when an upload was retired (ADR-0088). */
export interface CleanupWork {
  uploadId: string;
  /** The upload's original key. */
  key: string;
  /** The exact manifest recorded at retirement. */
  objectKeys: string[];
  writeProtocol: string;
  attempts: number;
}

/** The Postgres side of cleanup: leases, references and outcomes. */
export interface RetiredUploadLedger {
  /** Retires preparations whose deadline passed and records their work. Returns how many. */
  retireExpiredPreparations(now: Date, limit: number): Promise<number>;
  /**
   * Takes up to `limit` due pieces of work. Before returning, each one's attempt
   * count and next attempt time are already saved, so a crash or restart leaves
   * the work waiting for its backoff instead of losing it.
   */
  lease(now: Date, limit: number): Promise<CleanupWork[]>;
  /** Why deletion must wait: a live adopter or a retained key under the directory. Null when free. */
  blockingReference(work: CleanupWork, directory: string): Promise<string | null>;
  complete(uploadId: string, now: Date): Promise<void>;
  recordFailure(uploadId: string, reason: string): Promise<void>;
}

/** The storage side: resolves only when every key is proven absent. */
export interface RetiredObjectStore {
  deleteAndVerify(keys: string[]): Promise<void>;
}

export const RETIRED_UPLOAD_LEDGER = Symbol("RetiredUploadLedger");
export const RETIRED_OBJECT_STORE = Symbol("RetiredObjectStore");

/**
 * The one directory this work may delete, or null when it carries no deletion
 * authority. Scaffold for #721: authority is not implemented yet.
 */
export function deletionDirectory(_work: CleanupWork): string | null {
  return null;
}
