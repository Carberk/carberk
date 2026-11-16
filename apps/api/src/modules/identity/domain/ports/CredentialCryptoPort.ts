export interface CredentialCryptoPort {
  generateSignInCode(): string;
  hashCode(code: string): string;
  generateRefreshToken(): string;
  generateBackupCode(): string;
  generateRequestId(): string;
}
