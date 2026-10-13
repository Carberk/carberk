import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../src/api/client";
import ContactPhoneScreen from "../../app/listings/contact-phone";
import { KEYBOARD_PLATFORMS, activeKeyboardRegion, onPlatform } from "../keyboardAvoidance";
import { act, fireEvent, renderMobile, routeParams, routerMock, within } from "../render";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  republish: vi.fn(async () => ({})),
  toast: vi.fn(),
}));

vi.mock("../../src/api/listings/useRequestContactPhoneCode", () => ({
  useRequestContactPhoneCode: () => ({ mutateAsync: mocks.request, isPending: false }),
}));
vi.mock("../../src/api/listings/useRepublishListing", () => ({
  useRepublishListing: () => ({ mutateAsync: mocks.republish, isPending: false }),
}));
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ show: mocks.toast, setTopClearance: vi.fn() }),
}));
vi.mock("lucide-react-native", async () => {
  const Icon = (await import("react-native")).View;
  return { ChevronLeft: Icon, ChevronRight: Icon, AlertCircle: Icon };
});
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const CODE_SENT = {
  status: "code_sent" as const,
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  resendInSeconds: 60,
};

beforeEach(() => {
  vi.stubGlobal("__DEV__", false);
  mocks.request.mockReset();
  mocks.republish.mockClear();
  mocks.toast.mockClear();
});

async function typePhone(screen: Awaited<ReturnType<typeof renderMobile>>, value: string) {
  await fireEvent.changeText(screen.getByLabelText("Phone number"), value);
  await fireEvent(screen.getByLabelText("Phone number"), "blur");
}

async function pressSendCode(screen: Awaited<ReturnType<typeof renderMobile>>) {
  await act(async () => {
    void fireEvent.press(screen.getByRole("button", { name: "Send code" }));
  });
}

describe("contact-phone screen", () => {
  it("asks for another contact number with the +993 prefix", async () => {
    routeParams.returnPathname = "/(tabs)/sell";
    const screen = await renderMobile(<ContactPhoneScreen />);

    expect(
      screen.getByRole("header", { name: "Another contact number" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/We'll text a code to this number/),
    ).toBeTruthy();
    expect(screen.getByText("+993")).toBeTruthy();
  });

  it("titled reconfirm when a saved number expired", async () => {
    routeParams.phone = "+99362999999";
    routeParams.reconfirm = "1";
    const screen = await renderMobile(<ContactPhoneScreen />);

    expect(
      screen.getByRole("header", { name: "Confirm the number again" }),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("62 99-99-99")).toBeTruthy();
  });

  it("shows the format error without a request", async () => {
    const screen = await renderMobile(<ContactPhoneScreen />);
    await typePhone(screen, "11");

    await pressSendCode(screen);

    expect(
      screen.getByText("Enter a number in the format +993 6X XX-XX-XX."),
    ).toBeTruthy();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("opens the code screen when the code is sent", async () => {
    routeParams.returnPathname = "/(tabs)/sell";
    mocks.request.mockResolvedValue(CODE_SENT);
    const screen = await renderMobile(<ContactPhoneScreen />);
    await typePhone(screen, "61 00-00-01");

    await pressSendCode(screen);

    expect(mocks.request).toHaveBeenCalledWith({ phone: "+99361000001" });
    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/listings/contact-phone-code",
      params: {
        phone: "+99361000001",
        resendInSeconds: "60",
        purpose: "listing",
        returnPathname: "/(tabs)/sell",
      },
    });
  });

  it("skips the code screen for an already confirmed number", async () => {
    routeParams.returnPathname = "/(tabs)/sell";
    mocks.request.mockResolvedValue({
      status: "confirmed",
      contactPhone: {
        phone: "+99365000000",
        source: "account",
        confirmedAt: null,
        reusableUntil: null,
      },
    });
    const screen = await renderMobile(<ContactPhoneScreen />);
    await typePhone(screen, "65 00-00-00");

    await pressSendCode(screen);

    expect(routerMock.push).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "This number is already confirmed. No code needed.",
      variant: "success",
    });
    expect(routerMock.dismissTo).toHaveBeenCalledWith({
      pathname: "/(tabs)/sell",
      params: { confirmedContactPhone: "+99365000000" },
    });
  });

  it("shows the daily limit with the one Help link and no time", async () => {
    mocks.request.mockRejectedValue(
      new ApiError("RATE_LIMITED", 400, undefined, {
        reason: "destination_limit",
        retryInSeconds: 0,
      }),
    );
    const screen = await renderMobile(<ContactPhoneScreen />);
    await typePhone(screen, "61 00-00-01");

    await pressSendCode(screen);

    expect(
      screen.getByText(
        "No more codes to this number today. Try again tomorrow or use another number.",
      ),
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole("link", { name: "Help" }));
    expect(routerMock.push).toHaveBeenCalledWith("/help");
  });

  it("shows the general rate message for the IP limit, with no Help link", async () => {
    mocks.request.mockRejectedValue(
      new ApiError("RATE_LIMITED", 400, undefined, {
        reason: "ip_limit",
        retryInSeconds: 0,
      }),
    );
    const screen = await renderMobile(<ContactPhoneScreen />);
    await typePhone(screen, "61 00-00-01");

    await pressSendCode(screen);

    expect(
      screen.getByText("Too many requests. Please wait a moment."),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Help" })).toBeNull();
  });

  it("shows the wait of a backoff refusal", async () => {
    mocks.request.mockRejectedValue(
      new ApiError("RATE_LIMITED", 400, undefined, {
        reason: "backoff",
        retryInSeconds: 120,
      }),
    );
    const screen = await renderMobile(<ContactPhoneScreen />);
    await typePhone(screen, "61 00-00-01");

    await pressSendCode(screen);

    expect(
      screen.getByText("Too many requests. Try again in 2:00."),
    ).toBeTruthy();
  });

  it("shows the offline message", async () => {
    mocks.request.mockRejectedValue(new ApiError("NETWORK_ERROR", 0));
    const screen = await renderMobile(<ContactPhoneScreen />);
    await typePhone(screen, "61 00-00-01");

    await pressSendCode(screen);

    expect(
      screen.getByText("No internet connection. Try again when you are online."),
    ).toBeTruthy();
  });

  it("relists straight away when a relist number needs no code", async () => {
    routeParams.purpose = "relist";
    routeParams.listingId = "listing-1";
    routeParams.phone = "+99362000002";
    routeParams.returnPathname = "/listings/manage";
    mocks.request.mockResolvedValue({
      status: "confirmed",
      contactPhone: {
        phone: "+99362000002",
        source: "confirmed",
        confirmedAt: "2026-10-05T12:00:00.000Z",
        reusableUntil: "2026-10-12T12:00:00.000Z",
      },
    });
    const screen = await renderMobile(<ContactPhoneScreen />);

    await pressSendCode(screen);

    expect(mocks.republish).toHaveBeenCalledWith("listing-1");
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "Back on sale",
      variant: "success",
    });
    expect(routerMock.dismissTo).toHaveBeenCalledWith("/listings/manage");
  });

  it("keeps the Listing's own number read-only on a relist", async () => {
    routeParams.purpose = "relist";
    routeParams.listingId = "listing-1";
    routeParams.phone = "+99362000002";
    routeParams.returnPathname = "/listings/manage";
    const screen = await renderMobile(<ContactPhoneScreen />);

    expect(screen.getByDisplayValue("62 00-00-02").props.editable).toBe(false);
  });
});

describe("contact-phone keyboard (#843)", () => {
  it.each(KEYBOARD_PLATFORMS)("keeps the number and Send code above the %s keyboard", (os) =>
    onPlatform(os, async () => {
      const screen = await renderMobile(<ContactPhoneScreen />);
      const region = activeKeyboardRegion(screen);
      expect(within(region).getByLabelText("Phone number")).toBeTruthy();
      expect(within(region).getByRole("button", { name: "Send code" })).toBeTruthy();
    }));
});
