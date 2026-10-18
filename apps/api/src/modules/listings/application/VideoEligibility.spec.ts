import { afterEach, describe, expect, it } from "vitest";
import { VideoEligibility } from "./VideoEligibility";

const previous = {
  enabled: process.env["VIDEO_ROLLOUT_ENABLED"],
  testers: process.env["VIDEO_TESTER_USER_IDS"],
};

afterEach(() => {
  if (previous.enabled === undefined) delete process.env["VIDEO_ROLLOUT_ENABLED"];
  else process.env["VIDEO_ROLLOUT_ENABLED"] = previous.enabled;
  if (previous.testers === undefined) delete process.env["VIDEO_TESTER_USER_IDS"];
  else process.env["VIDEO_TESTER_USER_IDS"] = previous.testers;
});

describe("VideoEligibility", () => {
  it("fails closed when rollout is not enabled", () => {
    process.env["VIDEO_ROLLOUT_ENABLED"] = "false";
    process.env["VIDEO_TESTER_USER_IDS"] = "tester-1";
    expect(new VideoEligibility().isEligible("tester-1")).toBe(false);
  });

  it("allows only explicitly listed testers", () => {
    process.env["VIDEO_ROLLOUT_ENABLED"] = "true";
    process.env["VIDEO_TESTER_USER_IDS"] = "tester-1, tester-2";
    const eligibility = new VideoEligibility();
    expect(eligibility.isEligible("tester-1")).toBe(true);
    expect(eligibility.isEligible("seller-1")).toBe(false);
  });

  it("reports a stable rollout error for ineligible users", () => {
    process.env["VIDEO_ROLLOUT_ENABLED"] = "true";
    process.env["VIDEO_TESTER_USER_IDS"] = "tester-1";
    expect(() => new VideoEligibility().assertEligible("seller-1")).toThrow("Listing video is currently limited to approved testers");
  });
});
