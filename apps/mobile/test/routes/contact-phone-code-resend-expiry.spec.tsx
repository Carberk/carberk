import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import { ToastProvider } from "../../components/ui/toast";
import ContactPhoneCodeScreen from "../../app/listings/contact-phone-code";
import { act, fireEvent, renderMobile, routeParams } from "../render";
import { server } from "../msw";

vi.mock("lucide-react-native", async () => {
  const Icon = (await import("react-native")).View;
  return { ChevronLeft: Icon, ChevronRight: Icon, AlertCircle: Icon };
});
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("../../components/auth/OtpCells", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  const { TextInput } = await import("react-native");
  return {
    OtpCells: forwardRef(
      ({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }, ref) => {
        useImperativeHandle(ref, () => ({ focus: () => {}, shake: () => {} }));
        return <TextInput accessibilityLabel="Code" editable={!disabled} value={value} onChangeText={onChange} />;
      },
    ),
  };
});

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

    expect(rendered.queryByText("Too many requests. Try again in 0:02.")).toBeNull();
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
});
