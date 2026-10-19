import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { ToastProvider } from "../../components/ui/toast";
import ContactPhoneCodeScreen from "../../app/listings/contact-phone-code";
import { act, fireEvent, renderMobile, routeParams, getHost } from "../render";
import { server } from "../msw";

vi.mock("lucide-react-native", async () => {
  const Icon = (await import("react-native")).View;
  return { ChevronLeft: Icon, ChevronRight: Icon, AlertCircle: Icon };
});
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// OtpCells remains real; only the native animation driver is inert in Node.
vi.mock("react-native", async (importOriginal) => {
  const native = await importOriginal<typeof import("react-native")>();
  return {
    ...native,
    Animated: {
      View: native.View,
      Value: class {
        setValue(_value: number) {}
      },
      timing: () => ({}),
      sequence: () => ({ start: () => {} }),
    },
  };
});

function barrier<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe("contact-phone-code resend expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("__DEV__", false);
    routeParams.phone = "+99361000001";
    routeParams.resendInSeconds = "0";
    routeParams.returnPathname = "/(tabs)/sell";
    server.use(
      http.post("*/me/contact-phones/request", () =>
        HttpResponse.json(
          { code: "RATE_LIMITED", details: { reason: "backoff", retryInSeconds: 2 } },
          { status: 400 },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clears an expired backoff error and allows a later resend", async () => {
    const rendered = await renderMobile(
      <ToastProvider>
        <ContactPhoneCodeScreen />
      </ToastProvider>,
    );

    await act(async () => {
      void fireEvent.press(rendered.getByRole("button", { name: "Resend code" }));
    });
    expect(await rendered.findByText("Too many requests. Try again in 0:02.")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    expect(rendered.queryByText("Too many requests. Try again in 0:02.") === null).toBe(true);
    const resend = rendered.getByRole("button", { name: "Resend code" });
    expect(resend.props.accessibilityState).not.toMatchObject({ disabled: true });

    server.use(
      http.post("*/me/contact-phones/request", () =>
        HttpResponse.json({
          status: "code_sent",
          requestId: "550e8400-e29b-41d4-a716-446655440000",
          resendInSeconds: 60,
        }),
      ),
    );
    await act(async () => {
      void fireEvent.press(resend);
    });
    expect(await rendered.findByRole("button", { name: "Resend code in 60s" })).toBeTruthy();
  });

  it.each([
    ["INVALID_OTP", "Wrong code. Attempts left: 3.", false],
    ["NETWORK_ERROR", "No internet connection. Try again when you are online.", false],
    ["OTP_EXPIRED", "Code expired. Request a new one.", true],
    ["OTP_LOCKED", "Too many attempts. Request a new code.", true],
  ])("keeps a late %s verification error after an overlapping resend backoff expires", async (code, message, needsNewCode) => {
    const verificationStarted = barrier<void>();
    const verificationResponse = barrier<Response>();
    server.use(http.post("*/me/contact-phones/verify", () => {
      verificationStarted.resolve();
      return verificationResponse.promise;
    }));
    const rendered = await renderMobile(
      <ToastProvider><ContactPhoneCodeScreen /></ToastProvider>,
    );
    await act(async () => {
      void fireEvent.changeText(getHost(rendered.container, "TextInput"), "123456");
    });
    await verificationStarted.promise;

    // The existing route permits resend while verification is in flight.
    await act(async () => {
      void fireEvent.press(rendered.getByRole("button", { name: "Resend code" }));
    });
    expect(await rendered.findByText("Too many requests. Try again in 0:02.")).toBeTruthy();

    await act(async () => {
      verificationResponse.resolve(code === "NETWORK_ERROR"
        ? HttpResponse.error()
        : HttpResponse.json({ code, details: { attemptsLeft: 3 } }, { status: 400 }));
    });
    // Expired/locked resets the countdown immediately; other errors keep it.
    expect(await rendered.findByText(message)).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(2_000); });
    expect(rendered.queryByText(message) !== null).toBe(true);
    const resend = rendered.getByRole("button", {
      name: needsNewCode ? "Send a new code" : "Resend code",
    });
    expect(resend.props.accessibilityState).not.toMatchObject({ disabled: true });
    expect(getHost(rendered.container, "TextInput").props.editable).toBe(!needsNewCode);
  });

});
