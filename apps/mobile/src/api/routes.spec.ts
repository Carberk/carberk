import { afterEach, expect, it, vi } from "vitest";

import { captureRouteSnapshot, gatewayTesterEnabled, selectTesterRoute, subscribeRouteChanges } from "./routes";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("keeps normal builds on their configured Global entry", () => {
  expect(gatewayTesterEnabled()).toBe(false);
  expect(() => selectTesterRoute("tm")).toThrow();
  expect(captureRouteSnapshot()).toMatchObject({ entry: "global", apiBaseUrl: "http://localhost:3006/api/v1" });
});

it("pins an approved entry before networking even when the override changes", () => {
  vi.stubGlobal("__DEV__", true);
  vi.stubEnv("EXPO_PUBLIC_API_URL", "https://api-staging-2861.up.railway.app/api/v1");
  vi.stubEnv("EXPO_PUBLIC_GATEWAY_TESTER", "true");
  vi.stubEnv("EXPO_PUBLIC_ENV", "staging");
  selectTesterRoute("tm");
  const pinned = captureRouteSnapshot();
  selectTesterRoute("global");
  expect(pinned).toMatchObject({ entry: "tm", apiBaseUrl: "https://tm-staging.bagtyyar.dev/api/v1" });
  expect(Object.isFrozen(pinned)).toBe(true);
  expect(captureRouteSnapshot().generation).toBeGreaterThan(pinned.generation);
});

it("notifies active transports only when the selected entry changes", () => {
  vi.stubGlobal("__DEV__", true);
  vi.stubEnv("EXPO_PUBLIC_API_URL", "https://api-staging-2861.up.railway.app/api/v1");
  vi.stubEnv("EXPO_PUBLIC_GATEWAY_TESTER", "true");
  vi.stubEnv("EXPO_PUBLIC_ENV", "staging");
  selectTesterRoute("global");
  const listener = vi.fn();
  const unsubscribe = subscribeRouteChanges(listener);
  selectTesterRoute("tm");
  selectTesterRoute("tm");
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith(expect.objectContaining({ entry: "tm" }));
  unsubscribe();
  selectTesterRoute("global");
  expect(listener).toHaveBeenCalledTimes(1);
});

it.each([[false, "true", "staging"], [true, "false", "staging"], [true, "true", "production"]] as const)("refuses the tester control outside the closed development gate", (development, flag, environment) => {
  vi.stubGlobal("__DEV__", development);
  vi.stubEnv("EXPO_PUBLIC_API_URL", "https://api-staging-2861.up.railway.app/api/v1");
  vi.stubEnv("EXPO_PUBLIC_GATEWAY_TESTER", flag);
  vi.stubEnv("EXPO_PUBLIC_ENV", environment);
  expect(gatewayTesterEnabled()).toBe(false);
  expect(captureRouteSnapshot().entry).toBe("global");
});
