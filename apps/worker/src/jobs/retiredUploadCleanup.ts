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

const OWNED_ORIGINAL =
  /^(pending\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/)original\.(jpg|webp)$/;
const VARIANTS = ["thumbnail", "list", "detail", "fullscreen"].flatMap((name) => [`${name}.jpg`, `${name}.webp`]);

/**
 * The one directory this work may delete, or null when it carries no deletion
 * authority. Authority needs all of: the fenced write protocol, an original in
 * image presign's own `pending/<UUID v4>/` directory, and a manifest that is
 * exactly that original and its eight variants. Legacy uploads, chat and
 * made-up prefixes, and any manifest reaching elsewhere authorize nothing. The
 * rule is repeated here, away from the API that wrote the record, on purpose.
 */
export function deletionDirectory(work: CleanupWork): string | null {
  if (work.writeProtocol !== "conditional-v1") return null;
  const directory = OWNED_ORIGINAL.exec(work.key)?.[1];
  if (!directory) return null;
  const expected = new Set([work.key, ...VARIANTS.map((name) => `${directory}${name}`)]);
  const exact = work.objectKeys.length === expected.size &&
    new Set(work.objectKeys).size === expected.size &&
    work.objectKeys.every((key) => expected.has(key));
  return exact ? directory : null;
}
