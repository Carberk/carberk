import { waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import type * as ReactNative from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ContactPhoneCodeScreen from "../../app/listings/contact-phone-code";
import { ApiError } from "../../src/api/client";

import { CodeEntryForm } from "./CodeEntryForm";
import { OtpCells } from "./OtpCells";

import { ToastProvider } from "@/components/ui/toast";
import { server } from "@/test/msw";
import { act, fireEvent, renderMobile, routeParams, routerMock } from "@/test/render";

vi.mock("react-native", async (importOriginal) => {
  const hosts = await importOriginal<typeof ReactNative>();
  return {
    ...hosts,
    Animated: {
      View: hosts.View,
      Value: class {
        setValue() {}
      },
      timing: () => ({}),
      sequence: () => ({ start() {} }),
    },
  };
});

const locales = [
  ["tk", "Kody giriziň"],
  ["ru", "Введите код"],
  ["en", "Enter the code"],
] as const;

beforeEach(() => vi.stubGlobal("__DEV__", false));
afterEach(() => vi.unstubAllGlobals());

describe("accessible code entry", () => {
  it.each(locales)("exposes one native numeric field in %s and hides the six decorative digits", async (locale, label) => {
    const screen = await renderMobile(
      <OtpCells value="123456" onChange={() => {}} />,
      { locale },
    );

    const field = screen.getByLabelText(label);
    expect(screen.getAllByLabelText(label)).toHaveLength(1);
    expect(field.type).toBe("TextInput");
    expect(field.props).toMatchObject({
      accessible: true,
      editable: true,
      inputMode: "numeric",
      keyboardType: "number-pad",
      autoComplete: "sms-otp",
      textContentType: "oneTimeCode",
      maxLength: 6,
      caretHidden: true,
      selectionColor: "transparent",
      value: "123456",
    });
    expect(screen.queryAllByText(/^[1-6]$/)).toHaveLength(0);
    expect(screen.getAllByText(/^[1-6]$/, { includeHiddenElements: true })).toHaveLength(6);
  });

  it("keeps six numeric digits and stops taking changes while disabled", async () => {
    const onChange = vi.fn();
    const screen = await renderMobile(<OtpCells value="" onChange={onChange} />);

    await fireEvent.changeText(screen.getByLabelText("Enter the code"), "1a2 34-567");
    expect(onChange).toHaveBeenCalledWith("123456");

    await screen.rerender(<OtpCells disabled value="12" onChange={onChange} />);
    const field = screen.getByLabelText("Enter the code");
    expect(field.props.editable).toBe(false);
    expect(field.props.accessibilityState).toMatchObject({ disabled: true });

    onChange.mockClear();
    await fireEvent.changeText(field, "654321");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Sign-in Code through the real form", () => {
  it.each([
    ["tk", "Kody giriziň", "Kod nädogry. Täzeden synanyşyň."],
    ["ru", "Введите код", "Неверный код. Попробуйте еще раз."],
    ["en", "Enter the code", "Wrong code. Try again."],
  ] as const)("keeps the labeled field usable after a wrong code in %s", async (locale, label, error) => {
    let rejectVerification!: (error: Error) => void;
    const pending = new Promise<void>((_resolve, reject) => { rejectVerification = reject; });
    const verify = vi.fn<(code: string) => Promise<void>>()
      .mockReturnValueOnce(pending)
      .mockResolvedValue(undefined);
    const screen = await renderMobile(
      <CodeEntryForm
        method="phone"
        displayedDestination="+993 61 ** ** 01"
        initialResendSeconds={0}
        verify={verify}
        resend={async () => ({ resendInSeconds: 60 })}
        onChangeDestination={() => {}}
        onContactSupport={() => {}}
      />,
      { locale },
    );

    await fireEvent.changeText(screen.getByLabelText(label), "123456");
    expect(screen.getByLabelText(label).props.editable).toBe(false);
    expect(screen.getByLabelText(label).props.accessibilityState).toMatchObject({ disabled: true });

    await act(async () => rejectVerification(new ApiError("INVALID_OTP", 400)));
    expect(screen.getByText(error)).toBeTruthy();
    expect(screen.getByLabelText(label).props).toMatchObject({ editable: true, value: "" });

    await fireEvent.changeText(screen.getByLabelText(label), "654321");
    expect(verify).toHaveBeenLastCalledWith("654321");
    expect(screen.queryByText(error)).toBeNull();
  });
});

describe("Contact Phone Code through the real screen and API client", () => {
  it.each([
    ["tk", "Kody giriziň", "Kod nädogry. Galan synanyşyk: 3."],
    ["ru", "Введите код", "Неверный код. Осталось попыток: 3."],
    ["en", "Enter the code", "Wrong code. Attempts left: 3."],
  ] as const)("keeps the labeled field usable after a wrong code in %s", async (locale, label, error) => {
    let releaseWrongCode!: () => void;
    const pending = new Promise<void>((resolve) => { releaseWrongCode = resolve; });
    server.use(
      http.post("*/me/contact-phones/verify", async () => {
        await pending;
        return HttpResponse.json(
          { code: "INVALID_OTP", details: { attemptsLeft: 3 } },
          { status: 400 },
        );
      }),
    );
    routeParams.phone = "+99361000001";
    routeParams.resendInSeconds = "0";
    routeParams.returnPathname = "/(tabs)/sell";
    const screen = await renderMobile(
      <ToastProvider><ContactPhoneCodeScreen /></ToastProvider>,
      { locale },
    );

    await fireEvent.changeText(screen.getByLabelText(label), "123456");
    expect(screen.getByLabelText(label).props.editable).toBe(false);
    expect(screen.getByLabelText(label).props.accessibilityState).toMatchObject({ disabled: true });

    releaseWrongCode();
    expect(await screen.findByText(error)).toBeTruthy();
    expect(screen.getByLabelText(label).props).toMatchObject({ editable: true, value: "" });

    server.use(
      http.post("*/me/contact-phones/verify", () => HttpResponse.json({
        contactPhone: {
          phone: "+99361000001",
          source: "confirmed",
          confirmedAt: "2026-10-05T12:00:00.000Z",
          reusableUntil: "2026-10-12T12:00:00.000Z",
        },
      })),
    );
    await fireEvent.changeText(screen.getByLabelText(label), "654321");
    await waitFor(() => expect(routerMock.dismissTo).toHaveBeenCalledWith({
      pathname: "/(tabs)/sell",
      params: { confirmedContactPhone: "+99361000001" },
    }));
    expect(screen.queryByText(error)).toBeNull();
  });
});
