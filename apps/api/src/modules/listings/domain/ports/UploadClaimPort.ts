/** The one thing an upload may back: a Listing's media row or a User's Profile Photo. */
export interface UploadClaimTarget {
  type: "listing" | "profile";
  id: string;
}

/**
 * `token` claims the upload for this attempt. `joined` is true when this call
 * attached to an attempt already in flight for the same target instead of
 * creating the token; only the creating attempt (`joined: false`) may abandon
 * it. `alreadyAdopted` answers a retry whose earlier attempt committed.
 */
export type UploadReservation = { token: string; joined: boolean } | { alreadyAdopted: true };

export interface UploadFinalization {
  token: string;
  uploadIds: string[];
  target: UploadClaimTarget;
  /** Uploads the write only references, such as a video poster. They must not be retired. */
  referencedUploadIds?: string[];
}

/**
 * The common claim every adopter of an upload goes through (ADR-0088). The lock
 * on the upload record decides who adopts it; refusals are DomainErrors carrying
 * `UPLOAD_ALREADY_ATTACHED` or `UPLOAD_NOT_AVAILABLE`.
 *
 * `tx` is the adapter's own transaction handle. `finalize` and `retire` run in
 * the transaction that writes or releases the association, so both commit or
 * neither does.
 */
export interface UploadClaimPort {
  /** Reserves all of the User's uploads for one target before any bytes are prepared, or none. */
  reserve(input: {
    userId: string;
    businessId?: string | undefined;
    sessionId?: string | undefined;
    uploadIds: string[];
    target: UploadClaimTarget;
  }): Promise<UploadReservation>;
  /** `already` when a joined retry finds the same target adopted; the caller writes nothing. */
  finalize(tx: unknown, input: UploadFinalization): Promise<"adopted" | "already">;
  /** Closes adoption for good and records the deletion work. False when already retired. */
  retire(tx: unknown, uploadId: string): Promise<boolean>;
  /** A failed preparation is terminal: retires whatever this token still holds. */
  abandon(token: string): Promise<void>;
  /**
   * A transiently failed preparation lets go: every upload this token still
   * holds returns to AVAILABLE with the claim cleared, and no deletion work is
   * recorded, so a retry can adopt the same bytes (ADR-0089). Only the attempt
   * that created the token calls it. Uploads already ADOPTED are untouched.
   */
  release(token: string): Promise<void>;
  /**
   * One photo of a publication turned out permanently unusable: retires exactly
   * that upload (with its deletion work) and releases every other upload the
   * token still holds, in one transaction. False when the token no longer holds
   * the upload, e.g. the attempt committed meanwhile; the caller then reports
   * the original error instead of naming a photo.
   */
  settle(token: string, retiredUploadId: string): Promise<boolean>;
  /**
   * Retires only the User's AVAILABLE, unreferenced upload. With its row locked,
   * calls stillInvalid to re-inspect the positive stored-object mismatch; a
   * missing, empty or corrected object authorizes no retirement.
   */
  retireUnclaimed(uploadId: string, userId: string, stillInvalid: () => Promise<boolean>): Promise<boolean>;
}

export const UPLOAD_CLAIM_PORT = Symbol("UploadClaimPort");
