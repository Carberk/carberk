import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile, routeParams, routerMock } from "../render";
import EmailScreen from "../../app/(auth)/email";
import PhoneScreen from "../../app/(auth)/phone";
import { useAuthIntentStore } from "../../src/auth/intentStore";

vi.mock("../../src/api/identity/useRequestOtp", () => ({
  useRequestOtp: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../../src/auth/BrandLogo", () => ({ BrandLogo: () => null }));
vi.mock("../../src/auth/LocaleSwitcher", () => ({ LocaleSwitcher: () => null }));

const LISTING_ID = "listing-abc";

beforeEach(() => {
  useAuthIntentStore.setState({ intent: null, replayAction: null });
  useAuthIntentStore.getState().requireSignIn(routerMock as never, {
    returnTo: `/(public)/listings/${LISTING_ID}`,
    action: { kind: "message", listingId: LISTING_ID },
  });
  routeParams.authRoot = "1";
});

describe.each([
  ["phone", PhoneScreen],
  ["email", EmailScreen],
] as const)("The %s entry that started sign-in", (_method, Screen) => {
  it("keeps the pending intent when a pop back to it drops the authRoot param", () => {
    const screen = renderMobile(<Screen />);

    Reflect.deleteProperty(routeParams, "authRoot");
    screen.rerender(<Screen />);

    expect(useAuthIntentStore.getState().intent).not.toBeNull();
  });

  it("cancels the pending intent when it closes", () => {
    const screen = renderMobile(<Screen />);

    screen.unmount();

    expect(useAuthIntentStore.getState().intent).toBeNull();
  });
});
