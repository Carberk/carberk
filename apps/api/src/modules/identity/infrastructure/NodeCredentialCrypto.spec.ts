import { describe, expect, it } from "vitest";

import { OtpCode } from "../domain/OtpCode";
import { NodeCredentialCrypto } from "./NodeCredentialCrypto";

describe("NodeCredentialCrypto", () => {
  const crypto = new NodeCredentialCrypto();

  it("keeps the stored SHA-256 code digest compatible with existing requests and backup codes", () => {
    expect(crypto.hashCode("123456")).toBe(
      "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92",
    );
    expect(crypto.hashCode("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("issues valid six-digit Sign-in Codes with fresh draws", () => {
    const codes = Array.from({ length: 10 }, () => crypto.generateSignInCode());
    for (const code of codes) expect(OtpCode.create(code).value).toMatch(/^\d{6}$/);
    expect(new Set(codes).size).toBeGreaterThan(1);
  });

  it("issues 32-byte refresh tokens and 8-byte backup codes as hex", () => {
    const tokens = Array.from({ length: 10 }, () => crypto.generateRefreshToken());
    const codes = Array.from({ length: 10 }, () => crypto.generateBackupCode());
    for (const token of tokens) expect(token).toMatch(/^[a-f0-9]{64}$/);
    for (const code of codes) expect(code).toMatch(/^[a-f0-9]{16}$/);
    expect(new Set(tokens).size).toBe(10);
    expect(new Set(codes).size).toBe(10);
  });

  it("issues a UUID request receipt for a reserved phone without a stored request", () => {
    expect(crypto.generateRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
