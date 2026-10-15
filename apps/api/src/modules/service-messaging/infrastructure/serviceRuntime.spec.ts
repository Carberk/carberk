import { ConfigService } from "@nestjs/config";
import { expect, it } from "vitest";
import { serviceRuntime } from "./serviceRuntime";
const userId = "11111111-1111-4111-8111-111111111111";
it("does not admit ordinary signed users when synthetic mode is enabled", () => {
 const runtime = serviceRuntime(new ConfigService({ SERVICE_SYNTHETIC_ENABLED: true }));
 expect(runtime.syntheticSubjectAllowed({ userId, sessionId: "current" })).toBe(false);
});
it("admits only exact server-configured fixture identities while enabled", () => {
 const config = { SERVICE_SYNTHETIC_ENABLED: true, SERVICE_SYNTHETIC_USER_IDS: JSON.stringify([userId]) };
 expect(serviceRuntime(new ConfigService(config)).syntheticSubjectAllowed({ userId, sessionId: "current" })).toBe(true);
 expect(serviceRuntime(new ConfigService(config)).syntheticSubjectAllowed({ userId: "22222222-2222-4222-8222-222222222222", sessionId: "current" })).toBe(false);
 expect(serviceRuntime(new ConfigService({ ...config, SERVICE_SYNTHETIC_ENABLED: false })).syntheticSubjectAllowed({ userId, sessionId: "current" })).toBe(false);
});
