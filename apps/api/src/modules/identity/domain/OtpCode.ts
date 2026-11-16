const CODE_RE = /^\d{6}$/;

export class OtpCode {
  private constructor(readonly value: string) {}

  static create(raw: string): OtpCode {
    if (!CODE_RE.test(raw)) {
      throw new Error("OTP code must be exactly six digits");
    }
    return new OtpCode(raw);
  }

  equals(other: OtpCode): boolean {
    return this.value === other.value;
  }
}
