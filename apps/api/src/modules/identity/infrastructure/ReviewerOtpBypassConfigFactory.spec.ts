import { describe, expect, it } from "vitest";

import { parseReviewerOtpBypassConfig } from "./ReviewerOtpBypassConfigFactory";

function reviewerAccount(index: number): { phone: string; email: string; code: string } {
  return {
    phone: `+99365${String(index).padStart(6, "0")}`,
    email: `reviewer${index}@autotm.bagtyyar.dev`,
    code: String(index).repeat(6),
  };
}

function testerAccount(index: number): { phone: string; email: string; code: string } {
  return {
    phone: `+99370${String(index).padStart(6, "0")}`,
    email: `tester${index}@example.com`,
    code: `9${String(index).padStart(5, "0")}`.slice(-6),
  };
}

describe("parseReviewerOtpBypassConfig", () => {
  it("is disabled with no tester accounts when the reviewer flag is off", () => {
    expect(parseReviewerOtpBypassConfig({ REVIEW_DEMO_ACCOUNT_ENABLED: false })).toEqual({
      enabled: false,
      accounts: [],
    });
  });

  it("holds reviewer accounts only when the reviewer flag is on", () => {
    const config = parseReviewerOtpBypassConfig({
      REVIEW_DEMO_ACCOUNT_ENABLED: true,
      REVIEW_DEMO_ACCOUNTS_JSON: JSON.stringify([reviewerAccount(1)]),
      TESTER_ACCOUNTS_JSON: JSON.stringify([testerAccount(1)]),
    });

    expect(config.enabled).toBe(true);
    expect(config.accounts).toEqual([reviewerAccount(1), testerAccount(1)]);
  });

  it("enables tester accounts with the reviewer flag off", () => {
    const config = parseReviewerOtpBypassConfig({
      REVIEW_DEMO_ACCOUNT_ENABLED: false,
      REVIEW_DEMO_ACCOUNTS_JSON: JSON.stringify([reviewerAccount(1)]),
      TESTER_ACCOUNTS_JSON: JSON.stringify([testerAccount(1), testerAccount(2)]),
    });

    expect(config).toEqual({
      enabled: true,
      accounts: [testerAccount(1), testerAccount(2)],
    });
  });

  it("treats an unset or empty tester list as unchanged reviewer behaviour", () => {
    const withoutTesters = parseReviewerOtpBypassConfig({
      REVIEW_DEMO_ACCOUNT_ENABLED: true,
      REVIEW_DEMO_ACCOUNTS_JSON: JSON.stringify([reviewerAccount(1)]),
    });
    const emptyTesters = parseReviewerOtpBypassConfig({
      REVIEW_DEMO_ACCOUNT_ENABLED: true,
      REVIEW_DEMO_ACCOUNTS_JSON: JSON.stringify([reviewerAccount(1)]),
      TESTER_ACCOUNTS_JSON: "[]",
    });

    expect(withoutTesters).toEqual({ enabled: true, accounts: [reviewerAccount(1)] });
    expect(emptyTesters).toEqual(withoutTesters);
  });
});
