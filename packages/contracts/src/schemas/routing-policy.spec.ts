import { describe, expect, it } from "vitest";

import { RoutingPolicySchema } from "./routing-policy";

describe("routing preference policy", () => {
  it("accepts the frozen version and sixty-second lifetime", () => {
    expect(RoutingPolicySchema.parse({ version: 1, disableTmPreference: true, maxAgeSeconds: 60 }))
      .toEqual({ version: 1, disableTmPreference: true, maxAgeSeconds: 60 });
  });

  it.each([
    { version: 2, disableTmPreference: true, maxAgeSeconds: 60 },
    { version: 1, disableTmPreference: "false", maxAgeSeconds: 60 },
    { version: 1, disableTmPreference: true, maxAgeSeconds: 61 },
    { version: 1, disableTmPreference: false },
    { version: 1, disableTmPreference: true, maxAgeSeconds: 60, apiBaseUrl: "https://untrusted.example" },
  ])("rejects malformed or extended policy without endpoint authority", (value) => {
    expect(RoutingPolicySchema.safeParse(value).success).toBe(false);
  });
});
