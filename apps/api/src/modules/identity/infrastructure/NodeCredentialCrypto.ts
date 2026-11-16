import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";

import type { CredentialCryptoPort } from "../domain/ports/CredentialCryptoPort";

@Injectable()
export class NodeCredentialCrypto implements CredentialCryptoPort {
  generateSignInCode(): string {
    return String(randomInt(0, 999999)).padStart(6, "0");
  }

  hashCode(code: string): string {
    return createHash("sha256").update(code).digest("hex");
  }

  generateRefreshToken(): string {
    return randomBytes(32).toString("hex");
  }

  generateBackupCode(): string {
    return randomBytes(8).toString("hex");
  }

  generateRequestId(): string {
    return randomUUID();
  }
}
