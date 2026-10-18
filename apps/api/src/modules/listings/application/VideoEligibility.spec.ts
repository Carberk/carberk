import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import { VideoEligibility } from "./VideoEligibility";
import type { Env } from "../../../env.schema";

const tester = "11111111-1111-4111-8111-111111111111";
const seller = "22222222-2222-4222-8222-222222222222";
const eligibility = (enabled: boolean) => new VideoEligibility(new ConfigService({
  VIDEO_ROLLOUT_ENABLED: enabled,
  VIDEO_TESTER_USER_IDS: [tester],
}) as ConfigService<Env, true>);

describe("VideoEligibility", () => {
  it("fails closed when rollout is not enabled", () => {
    expect(eligibility(false).isEligible(tester)).toBe(false);
  });
  it("allows only explicitly listed testers", () => {
    expect(eligibility(true).isEligible(tester)).toBe(true);
    expect(eligibility(true).isEligible(seller)).toBe(false);
  });
  it("reports a stable rollout error for ineligible users", () => {
    expect(() => eligibility(true).assertEligible(seller)).toThrow("Listing video is currently limited to approved testers");
  });
});
