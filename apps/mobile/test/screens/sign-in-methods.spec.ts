import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(__dirname, "../..", path), "utf8");
}

const addPhone = read("app/account/add-phone.tsx");
const addEmail = read("app/account/add-email.tsx");
const verify = read("app/account/verify-sign-in-method.tsx");

describe("Profile Sign-in Methods", () => {
  // Profile's rows are covered by rendered tests in profile.spec.tsx.
  it("requests the code through the signed-in Sign-in Method endpoint", () => {
    for (const source of [addPhone, addEmail]) {
      expect(source).toContain("useRequestSignInMethodChange");
      expect(source).not.toContain("useRequestOtp");
      expect(source).toContain('pathname: "/account/verify-sign-in-method"');
    }
  });

  it("reuses the shared code entry and returns to Profile without signing out", () => {
    expect(verify).toContain("<CodeEntryForm");
    expect(verify).toContain("useVerifySignInMethodChange");
    expect(verify).toContain('router.dismissTo("/profile")');
    expect(verify).not.toContain("storeAuthSession");
    expect(verify).not.toContain("clearAuthSession");
  });

  it("keeps the sign-in code screen on the same shared form", () => {
    expect(read("app/(auth)/otp.tsx")).toContain("<CodeEntryForm");
  });
});
