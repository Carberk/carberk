import { describe, it, expect } from "vitest";
import { OtpCode } from "./OtpCode";

describe("OtpCode", () => {
  it("accepts exactly six numeric digits", () => {
    const code = OtpCode.create("123456");
    expect(code).toBeDefined();
    expect(code.value).toBe("123456");
  });

  it("accepts leading zeros", () => {
    const code = OtpCode.create("000001");
    expect(code.value).toBe("000001");
  });

  it("rejects non-digit characters", () => {
    expect(() => OtpCode.create("12345a")).toThrow("OTP code must be exactly six digits");
  });

  it("rejects 5-digit code", () => {
    expect(() => OtpCode.create("12345")).toThrow("OTP code must be exactly six digits");
  });

  it("rejects 7-digit code", () => {
    expect(() => OtpCode.create("1234567")).toThrow("OTP code must be exactly six digits");
  });

  it("rejects empty string", () => {
    expect(() => OtpCode.create("")).toThrow("OTP code must be exactly six digits");
  });
});
