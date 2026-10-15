import { expect, it } from "vitest";
import { servicePushRuntime } from "./servicePushRuntime";
const id = "11111111-1111-4111-8111-111111111111";
it("refuses live transport, production and malformed synthetic admissions", () => {
 const env = { APP_ENV: "test", PUSH_TRANSPORT: "test", SERVICE_SYNTHETIC_ENABLED: "true", SERVICE_SYNTHETIC_USER_IDS: JSON.stringify([id]) };
 expect(servicePushRuntime(env).enabled()).toBe(true); expect(servicePushRuntime(env).allowed(id)).toBe(true);
 for (const changed of [{ ...env, PUSH_TRANSPORT: "fcm" }, { ...env, APP_ENV: "production" }, { ...env, SERVICE_SYNTHETIC_ENABLED: "false" }, { ...env, SERVICE_SYNTHETIC_USER_IDS: "[broken" }]) expect(servicePushRuntime(changed).enabled()).toBe(false);
 expect(servicePushRuntime(env).allowed("other")).toBe(false);
});
