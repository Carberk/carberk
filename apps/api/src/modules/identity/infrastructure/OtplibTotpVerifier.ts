import { Inject, Injectable } from "@nestjs/common";
import {
  generateSecret,
  generateURI,
  verifySync,
} from "otplib";
import type { TotpVerifierPort } from "../domain/ports/TotpVerifierPort";

@Injectable()
export class OtplibTotpVerifier implements TotpVerifierPort {
  constructor(
    @Inject("TOTP_STEP_SECONDS")
    private readonly step: number = 30,
  ) {}

  generateSecret(): string {
    return generateSecret();
  }

  generateAuthUri(params: {
    secret: string;
    userId: string;
    issuer: string;
  }): string {
    return generateURI({
      secret: params.secret,
      label: params.userId,
      issuer: params.issuer,
      strategy: "totp",
    });
  }

  verify(secret: string, code: string): boolean {
    // Backup codes are checked by the application after this returns false.
    // otplib rejects malformed TOTP tokens by throwing before verification.
    if (!/^\d{6}$/.test(code)) return false;
    // epochTolerance = period allows current step + 1 adjacent step for skew
    const result = verifySync({ token: code, secret, strategy: "totp", period: this.step, epochTolerance: this.step });
    return result.valid;
  }
}
