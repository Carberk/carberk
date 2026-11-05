import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { RefreshTokenHasherPort } from "../domain/ports/RefreshTokenHasherPort";

/**
 * Refresh tokens are 32 bytes from a CSPRNG. A deterministic digest makes
 * that high-entropy bearer token directly indexable; it is not a password hash.
 */
@Injectable()
export class RefreshTokenDigestAdapter implements RefreshTokenHasherPort {
  async hash(plaintext: string): Promise<string> {
    return createHash("sha256").update(plaintext).digest("hex");
  }
}
