import { afterEach, expect, it, vi } from "vitest";
import * as SecureStore from "expo-secure-store";
import { http, HttpResponse } from "msw";

import TesterRouteScreen from "../../app/tester-route";
import { captureRouteSnapshot, selectTesterRoute } from "../../src/api/routes";
import { server } from "../msw";
import { fireEvent, renderMobile } from "../render";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("keeps tester provisioning out of ordinary builds", async () => {
  const screen = await renderMobile(<TesterRouteScreen />);
  expect(screen.queryByLabelText("Gateway access key")).toBeNull();
});
it("saves masked access, selects TM, shows truthful failure and returns to Global", async () => {
  vi.stubGlobal("__DEV__", true);
  vi.stubEnv("EXPO_PUBLIC_API_URL", "https://api-staging-2861.up.railway.app/api/v1");
  vi.stubEnv("EXPO_PUBLIC_GATEWAY_TESTER", "true");
  vi.stubEnv("EXPO_PUBLIC_ENV", "staging");
  selectTesterRoute("global");
  const values = new Map<string, string>();
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async key => values.get(key) ?? null);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { values.set(key, value); });
  const screen = await renderMobile(<TesterRouteScreen />);
  expect(screen.getByText("Gateway access not configured")).toBeTruthy();
  const input = screen.getByLabelText("Gateway access key");
  expect(input.props.secureTextEntry).toBe(true);
  await fireEvent.changeText(input, "synthetic-test-key-never-a-real-secret");
  await fireEvent.press(screen.getByRole("button", { name: "Save access key" }));
  expect(screen.getByText("Gateway access configured")).toBeTruthy();
  expect(screen.queryByDisplayValue("synthetic-test-key-never-a-real-secret")).toBeNull();
  await fireEvent.press(screen.getByRole("radio", { name: "TM gateway" }));
  expect(captureRouteSnapshot().entry).toBe("tm");
  server.use(http.get("https://tm-staging.bagtyyar.dev/api/v1/listings", () => HttpResponse.json({}, { status: 503 })));
  await fireEvent.press(screen.getByRole("button", { name: "Check connection" }));
  expect(screen.getByText("Couldn't connect. Check gateway access or use Global.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("radio", { name: "Global" }));
  expect(captureRouteSnapshot().entry).toBe("global");
});
