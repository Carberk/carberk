import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../src/api/client";
import ContactPhoneCodeScreen from "../../app/listings/contact-phone-code";
import { act, fireEvent, renderMobile, routeParams, routerMock } from "../render";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  request: vi.fn(),
  republish: vi.fn(async () => ({})),
  toast: vi.fn(),
}));

vi.mock("../../src/api/listings/useConfirmContactPhone", () => ({
  useConfirmContactPhone: () => ({ mutateAsync: mocks.confirm, isPending: false }),
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
// The test host has no Animated; this stand-in keeps the cells' contract: a
// text input that takes digits and stops taking them while disabled.
vi.mock("../../components/auth/OtpCells", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  const { TextInput } = await import("react-native");
  return {
    OtpCells: forwardRef(
      (
        { value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean },
        ref,
      ) => {
        useImperativeHandle(ref, () => ({ focus: () => {}, shake: () => {} }));
        return (
          <TextInput
            accessibilityLabel="Code"
            editable={!disabled}
            value={value}
            onChangeText={onChange}
          />
        );
      },
    ),
  };
});

beforeEach(() => {
  vi.stubGlobal("__DEV__", false);
  vi.useFakeTimers();
  mocks.confirm.mockReset();
  mocks.request.mockReset();
  mocks.republish.mockClear();
  mocks.toast.mockClear();
  routeParams.phone = "+99361000001";
  routeParams.resendInSeconds = "0";
  routeParams.returnPathname = "/(tabs)/sell";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function typeCode(screen: Awaited<ReturnType<typeof renderMobile>>, code: string) {
  await act(async () => {
    void fireEvent.changeText(screen.getByLabelText("Code"), code);
  });
}

describe("contact-phone-code screen", () => {
  it("says where the code went, that it expires in 5 minutes, and what it allows", async () => {
    const screen = await renderMobile(<ContactPhoneCodeScreen />);

    expect(screen.getByRole("header", { name: "Enter the code" })).toBeTruthy();
    expect(screen.getByText("Code sent to +993 61 XX-XX-01")).toBeTruthy();
    expect(screen.getByText("The code expires in 5 minutes.")).toBeTruthy();
    expect(
      screen.getByText(
        "This code lets the number be shown on a car listing. It cannot sign anyone in.",
      ),
    ).toBeTruthy();
  });

  it("returns to the Contact step with the number confirmed", async () => {
    mocks.confirm.mockResolvedValue({
      contactPhone: {
        phone: "+99361000001",
        source: "confirmed",
        confirmedAt: "2026-10-05T12:00:00.000Z",
        reusableUntil: "2026-10-12T12:00:00.000Z",
      },
    });
    const screen = await renderMobile(<ContactPhoneCodeScreen />);

    await typeCode(screen, "123456");

    expect(mocks.confirm).toHaveBeenCalledWith({
      phone: "+99361000001",
      code: "123456",
    });
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "Number confirmed. You can reuse it for 7 days.",
      variant: "success",
    });
    expect(routerMock.dismissTo).toHaveBeenCalledWith({
      pathname: "/(tabs)/sell",
      params: { confirmedContactPhone: "+99361000001" },
    });
  });

  it("shows the attempts left on a wrong code", async () => {
    mocks.confirm.mockRejectedValue(
      new ApiError("INVALID_OTP", 400, undefined, { attemptsLeft: 3 }),
    );
    const screen = await renderMobile(<ContactPhoneCodeScreen />);

    await typeCode(screen, "123456");

    expect(screen.getByText("Wrong code. Attempts left: 3.")).toBeTruthy();
  });

  it("locks entry after five wrong codes and offers a new code", async () => {
    mocks.confirm.mockRejectedValue(new ApiError("OTP_LOCKED", 400));
    const screen = await renderMobile(<ContactPhoneCodeScreen />);

    await typeCode(screen, "123456");

    expect(
      screen.getByText("Too many attempts. Request a new code."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Code").props.editable).toBe(false);

    mocks.request.mockResolvedValue({
      status: "code_sent",
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      resendInSeconds: 60,
    });
    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Send a new code" }));
    });

    expect(mocks.request).toHaveBeenCalledWith({ phone: "+99361000001" });
    expect(screen.getByLabelText("Code").props.editable).toBe(true);
  });

  it("treats an expired code the same way", async () => {
    mocks.confirm.mockRejectedValue(new ApiError("OTP_EXPIRED", 400));
    const screen = await renderMobile(<ContactPhoneCodeScreen />);

    await typeCode(screen, "123456");

    expect(
      screen.getByText("Code expired. Request a new one."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send a new code" })).toBeTruthy();
  });

  it("disables Resend with a countdown from resendInSeconds", async () => {
    routeParams.resendInSeconds = "45";
    const screen = await renderMobile(<ContactPhoneCodeScreen />);

    const resend = screen.getByRole("button", { name: "Resend code in 45s" });
    expect(resend.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("shows the wait from retryInSeconds when a resend hits the backoff", async () => {
    mocks.request.mockRejectedValue(
      new ApiError("RATE_LIMITED", 400, undefined, {
        reason: "backoff",
        retryInSeconds: 120,
      }),
    );
    const screen = await renderMobile(<ContactPhoneCodeScreen />);

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Resend code" }));
    });

    expect(
      screen.getByText("Too many requests. Try again in 2:00."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Resend code in 2:00" }),
    ).toBeTruthy();
  });

  it.each([
    ["locked", "OTP_LOCKED"],
    ["expired", "OTP_EXPIRED"],
  ])(
    "shows the wait when Send a new code hits the backoff from the %s state",
    async (_state, code) => {
      mocks.confirm.mockRejectedValue(new ApiError(code, 400));
      mocks.request.mockRejectedValue(
        new ApiError("RATE_LIMITED", 400, undefined, {
          reason: "backoff",
          retryInSeconds: 120,
        }),
      );
      const screen = await renderMobile(<ContactPhoneCodeScreen />);
      await typeCode(screen, "123456");

      await act(async () => {
        void fireEvent.press(screen.getByRole("button", { name: "Send a new code" }));
      });

      expect(
        screen.getByText("Too many requests. Try again in 2:00."),
      ).toBeTruthy();
      // The seller is not left with an enabled button and no time.
      expect(screen.queryByRole("button", { name: "Send a new code" })).toBeNull();
      const waiting = screen.getByRole("button", { name: "Resend code in 2:00" });
      expect(waiting.props.accessibilityState).toMatchObject({ disabled: true });
      expect(screen.getByLabelText("Code").props.editable).toBe(false);

      // Once the wait is over the new code can be asked for again.
      await act(async () => {
        vi.advanceTimersByTime(120_000);
      });
      const again = screen.getByRole("button", { name: "Send a new code" });
      expect(again.props.accessibilityState).not.toMatchObject({ disabled: true });
    },
  );

  it("offers Send a new code at once after a lock, whatever was left of the resend wait", async () => {
    routeParams.resendInSeconds = "45";
    mocks.confirm.mockRejectedValue(new ApiError("OTP_LOCKED", 400));
    const screen = await renderMobile(<ContactPhoneCodeScreen />);

    await typeCode(screen, "123456");

    const sendNew = screen.getByRole("button", { name: "Send a new code" });
    expect(sendNew.props.accessibilityState).not.toMatchObject({ disabled: true });
  });

  it("shows the daily limit with the one Help link when a resend hits it", async () => {
    mocks.request.mockRejectedValue(
      new ApiError("RATE_LIMITED", 400, undefined, {
        reason: "destination_limit",
        retryInSeconds: 0,
      }),
    );
    const screen = await renderMobile(<ContactPhoneCodeScreen />);

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Resend code" }));
    });

    expect(
      screen.getByText(
        "No more codes to this number today. Try again tomorrow or use another number.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Code").props.editable).toBe(false);

    await fireEvent.press(screen.getByRole("link", { name: "Help" }));
    expect(routerMock.push).toHaveBeenCalledWith("/help");
  });

  it("keeps the screen on offline", async () => {
    mocks.confirm.mockRejectedValue(new ApiError("NETWORK_ERROR", 0));
    const screen = await renderMobile(<ContactPhoneCodeScreen />);

    await typeCode(screen, "123456");

    expect(
      screen.getByText("No internet connection. Try again when you are online."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Code").props.editable).toBe(true);
  });

  it("goes back to the number screen from Change number", async () => {
    const screen = await renderMobile(<ContactPhoneCodeScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Change number" }));

    expect(routerMock.back).toHaveBeenCalled();
  });

  it("offers no Change number on a relist, which confirms the Listing's own number only", async () => {
    routeParams.purpose = "relist";
    routeParams.listingId = "listing-1";
    routeParams.returnPathname = "/listings/manage";
    const screen = await renderMobile(<ContactPhoneCodeScreen />);

    expect(screen.getByRole("header", { name: "Enter the code" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Change number" })).toBeNull();
  });

  it("relists the Listing once the relist code is confirmed", async () => {
    routeParams.purpose = "relist";
    routeParams.listingId = "listing-1";
    routeParams.returnPathname = "/listings/manage";
    mocks.confirm.mockResolvedValue({
      contactPhone: {
        phone: "+99361000001",
        source: "confirmed",
        confirmedAt: "2026-10-05T12:00:00.000Z",
        reusableUntil: "2026-10-12T12:00:00.000Z",
      },
    });
    const screen = await renderMobile(<ContactPhoneCodeScreen />);

    await typeCode(screen, "123456");

    expect(mocks.republish).toHaveBeenCalledWith("listing-1");
    expect(mocks.toast).toHaveBeenCalledWith({
      title: "Back on sale",
      variant: "success",
    });
    expect(routerMock.dismissTo).toHaveBeenCalledWith("/listings/manage");
  });
});
