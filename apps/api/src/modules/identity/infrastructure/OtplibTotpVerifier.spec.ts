import { describe, it, expect } from "vitest";
import { generateSecret, generateSync, verifySync } from "otplib";
import { OtplibTotpVerifier } from "./OtplibTotpVerifier";

describe("OtplibTotpVerifier", () => {
  const verifier = new OtplibTotpVerifier();

  it("generates a secret", () => {
    const secret = verifier.generateSecret();
    expect(secret).toBeTruthy();
    expect(secret.length).toBeGreaterThan(10);
  });

  it("generates a valid otpauth URI", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const uri = verifier.generateAuthUri({
      secret,
      userId: "admin-1",
      issuer: "Carberk Admin",
    });
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("Carberk%20Admin");
    expect(uri).toContain(secret);
  });

  it("verifies a valid TOTP code", () => {
    const secret = generateSecret();
    const code = generateSync({ secret, strategy: "totp", period: 30 });

    expect(verifier.verify(secret, code)).toBe(true);
  });

  it("rejects an invalid TOTP code", () => {
    const secret = generateSecret();
    expect(verifier.verify(secret, "000000")).toBe(false);
  });

  it.each(["0123456789abcdef", "12345", "1234567", "abcdef", ""])("returns false for a non-TOTP token %j so backup-code handling can continue", (code) => {
    expect(verifier.verify("JBSWY3DPEHPK3PXP", code)).toBe(false);
  });

  it("accepts adjacent-step skew", () => {
    const secret = generateSecret();
    const now = Math.floor(Date.now() / 1000);

    // Generate a code for the previous step
    const prevCode = generateSync({ secret, strategy: "totp", period: 30, epoch: now - 30 });

    // Direct otplib verification without epochTolerance should fail for prev step
    const strictResult = verifySync({ token: prevCode, secret, strategy: "totp", period: 30 });
    expect(strictResult.valid).toBe(false);

    // The verifier with epochTolerance=period should accept it
    expect(verifier.verify(secret, prevCode)).toBe(true);
  });
});
