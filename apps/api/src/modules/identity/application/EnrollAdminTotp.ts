import { Inject, Injectable } from "@nestjs/common";
import type { TotpEnrollmentRepository } from "../domain/ports/TotpEnrollmentRepository";
import type { TotpSecretCipherPort } from "../domain/ports/TotpSecretCipherPort";
import type { TotpVerifierPort } from "../domain/ports/TotpVerifierPort";
import { IDENTITY_TOKENS } from "../identity.tokens";

export interface EnrollAdminTotpInput {
  userId: string;
}

export interface EnrollAdminTotpResult {
  qrCodeUrl: string;
  secret: string;
}

@Injectable()
export class EnrollAdminTotp {
  constructor(
    @Inject(IDENTITY_TOKENS.TotpEnrollmentRepository)
    private readonly totpRepo: TotpEnrollmentRepository,
    @Inject(IDENTITY_TOKENS.TotpSecretCipherPort)
    private readonly cipher: TotpSecretCipherPort,
    @Inject(IDENTITY_TOKENS.TotpVerifierPort)
    private readonly verifier: TotpVerifierPort,
  ) {}

  async execute(input: EnrollAdminTotpInput): Promise<EnrollAdminTotpResult> {
    const existing = await this.totpRepo.findByUserId(input.userId);

    if (existing?.verifiedAt != null) {
      const err = new Error("TOTP_ALREADY_ENROLLED");
      err.name = "ConflictError";
      throw err;
    }

    if (existing != null) {
      // Pending setup is idempotent: admins may scan the QR, leave before
      // verification, then return with the same authenticator entry.
      const secret = this.cipher.decrypt(existing.encryptedSecret);
      const qrCodeUrl = this.verifier.generateAuthUri({
        secret,
        userId: input.userId,
        issuer: "Carberk Admin",
      });

      return { qrCodeUrl, secret };
    }

    const generatedSecret = this.verifier.generateSecret();
    const encryptedSecret = this.cipher.encrypt(generatedSecret);

    const created = await this.totpRepo.createPending(
      input.userId,
      encryptedSecret,
    );

    // Use the stored secret rather than the locally generated one. If two
    // concurrent calls race on the unique `userId` index, the loser receives
    // the winner's row from createPending and must return that secret to stay
    // idempotent instead of returning its own never-stored value.
    const secret = this.cipher.decrypt(created.encryptedSecret);

    const qrCodeUrl = this.verifier.generateAuthUri({
      secret,
      userId: input.userId,
      issuer: "Carberk Admin",
    });

    return { qrCodeUrl, secret };
  }
}
