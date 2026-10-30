import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { diagnosticRuntime } from "./diagnosticRuntime";

const userId = "11111111-1111-4111-8111-111111111111";
const subject = { userId, sessionId: "synthetic-session" };
describe("synthetic diagnostic admission", () => {
  it("keeps string false closed even for a listed tester", () => {
    const runtime = diagnosticRuntime(new ConfigService({ APP_ENV: "test", DIAGNOSTIC_SYNTHETIC_ENABLED: "false", DIAGNOSTIC_SYNTHETIC_USER_IDS: JSON.stringify([userId]) }));
    expect(runtime.syntheticAllowed(subject)).toBe(false);
  });
  it("accepts validated tester arrays supplied by environment validation", () => {
    const runtime = diagnosticRuntime(new ConfigService({ APP_ENV: "test", DIAGNOSTIC_SYNTHETIC_ENABLED: true, DIAGNOSTIC_SYNTHETIC_USER_IDS: [userId] }));
    expect(runtime.syntheticAllowed(subject)).toBe(true);
    expect(runtime.syntheticAllowed({ ...subject, userId: "22222222-2222-4222-8222-222222222222" })).toBe(false);
  });
});
