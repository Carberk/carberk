import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import * as Linking from "expo-linking";
import { Enums } from "@auto-tm/contracts";

import { server } from "../../test/msw";
import { renderMobile, fireEvent, act } from "../../test/render";
import { ContactCtaBar } from "../listings/components/ContactCtaBar";

import { measurementHost } from "./nativeMeasurement";

vi.hoisted(() => { process.env["EXPO_PUBLIC_MEASUREMENT_ENABLED"] = "true"; process.env["EXPO_PUBLIC_API_URL"] = "https://outage.test/api/v1"; });

vi.mock("expo-linking", () => ({ openURL: vi.fn(async () => undefined) }));

// Only native credential/storage/network boundaries vary. Real ContactCtaBar,
// auth/session hooks, conversation hooks and action handler render unchanged.
describe("core contact during collector outage", () => {
 it("opens the real contact action while bootstrap is unavailable and never waits for telemetry", async () => {
  let started = false; let release: (() => void) | undefined;
  server.use(http.post("https://outage.test/api/v1/measurement/bootstrap", async () => {
   started = true; await new Promise<void>((resolve) => { release = resolve; }); return HttpResponse.error();
  }));
  const pending = measurementHost.foreground();
  const screen = await renderMobile(<ContactCtaBar listingId="00000000-0000-4000-8000-000000000003" contactPhone="+99361000001" allowCalls allowChat={false} status={Enums.ListingStatus.Active} />);
  try {
   await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Call" })); });
   expect(started).toBe(true);
   expect(Linking.openURL).toHaveBeenCalledWith("tel:+99361000001");
   expect(screen.getByRole("button", { name: "Call" }).props.accessibilityState?.disabled).not.toBe(true);
  } finally { release?.(); await pending; }
 });
});
