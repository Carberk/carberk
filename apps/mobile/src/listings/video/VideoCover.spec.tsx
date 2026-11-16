import * as SecureStore from "expo-secure-store";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { renderMobile } from "../../../test/render";
import { provisionGatewayKey, selectTesterRoute } from "../../api/routes";

import { VideoCover } from "./VideoCover";

const key = "synthetic-cover-gateway-key-0123456789";
const storage = new Map<string, string>();

beforeEach(async () => {
  vi.stubGlobal("__DEV__", true);
  vi.stubEnv("EXPO_PUBLIC_API_URL", "https://api-staging-2861.up.railway.app/api/v1");
  vi.stubEnv("EXPO_PUBLIC_GATEWAY_TESTER", "true");
  vi.stubEnv("EXPO_PUBLIC_ENV", "staging");
  storage.clear();
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async name => storage.get(name) ?? null);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (name, value) => { storage.set(name, value); });
  await provisionGatewayKey(key);
});

afterEach(() => {
  selectTesterRoute("global");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([
  ["global", "https://api-staging-2861.up.railway.app", {}],
  ["tm", "https://tm-staging.bagtyyar.dev", { "X-Carberk-Gateway-Key": key }],
] as const)("reads a %s cover without an image cache or API bearer", async (_entry, origin, headers) => {
  const uri = `${origin}/api/v1/listings/video-files/viewer/v1/g1/cover.webp?grant=cover`;
  const screen = await renderMobile(<VideoCover uri={uri} durationMs={42000} />);
  const image = await screen.findByTestId("video-cover-image");
  expect(image.props.source).toEqual({ uri, headers });
  expect(image.props.cachePolicy).toBe("none");
});

it("keeps the cover dark when the gateway key is absent or the destination is unapproved", async () => {
  storage.clear();
  const screen = await renderMobile(<VideoCover uri="https://tm-staging.bagtyyar.dev/api/v1/listings/video-files/viewer/v1/g1/cover.webp?grant=cover" durationMs={42000} />);
  expect(screen.queryByTestId("video-cover-image")).toBeNull();
  await screen.rerender(<VideoCover uri="https://unapproved.example/cover.webp" durationMs={42000} />);
  expect(screen.queryByTestId("video-cover-image")).toBeNull();
  expect(screen.getByTestId("video-cover-play")).toBeTruthy();
});
