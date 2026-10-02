import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../src/api/client";

import { CodeEntryForm, formatResendWait } from "./CodeEntryForm";

import { act, fireEvent, renderMobile } from "@/test/render";

// The test host has no Animated; this stand-in keeps the cells' contract: a
// text input that takes digits and stops taking them while disabled.
vi.mock("./OtpCells", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  const { TextInput } = await import("react-native");
  return {
    OtpCells: forwardRef(
      (
        {
          value,
          onChange,
          disabled,
        }: { value: string; onChange: (v: string) => void; disabled?: boolean },
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

const DAILY_LIMIT =
  "Too many codes requested for this destination in 24 hours. Try again later.";
const WAIT_A_MOMENT = "Too many requests. Please wait a moment.";
const NOT_ARRIVING =
  "Not arriving? Check Spam, wait a few minutes, or use a different email.";

function rateLimited(details?: unknown) {
  return new ApiError("RATE_LIMITED", 429, "Too many OTP requests", details);
}

function renderForm(
  overrides: Partial<Parameters<typeof CodeEntryForm>[0]> = {},
  locale?: "en" | "ru" | "tk",
) {
  const props = {
    method: "phone" as const,
    displayedDestination: "+993 61 ** ** 67",
    initialResendSeconds: 0,
    verify: vi.fn(async () => {}),
    resend: vi.fn(async () => ({ resendInSeconds: 120 })),
    onChangeDestination: vi.fn(),
    onContactSupport: vi.fn(),
    ...overrides,
  };
  const screen = renderMobile(<CodeEntryForm {...props} />, { locale });
  return { screen, props };
}

async function pressResend(screen: ReturnType<typeof renderMobile>) {
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Resend code" }));
  });
}

beforeEach(() => {
  // Metro defines __DEV__; the form reads it for the development code chip.
  vi.stubGlobal("__DEV__", false);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CodeEntryForm code lifetime", () => {
  it("tells a phone User the code lasts 5 minutes", () => {
    const { screen } = renderForm({ method: "phone" });

    expect(screen.getByText("The code expires in 5 minutes.")).toBeTruthy();
    expect(screen.queryByText("The code expires in 10 minutes.")).toBeNull();
  });

  it("tells an email User the code lasts 10 minutes", () => {
    const { screen } = renderForm({ method: "email" });

    expect(screen.getByText("The code expires in 10 minutes.")).toBeTruthy();
    expect(screen.queryByText("The code expires in 5 minutes.")).toBeNull();
  });
});

describe("CodeEntryForm daily code limit", () => {
  it.each(["phone", "email"] as const)(
    "stops Resend and code entry on a %s and offers Contact support",
    async (method) => {
      const verify = vi.fn(async () => {});
      const { screen, props } = renderForm({
        method,
        verify,
        resend: vi.fn(async () => {
          throw rateLimited({ reason: "destination_limit", retryInSeconds: 0 });
        }),
      });

      await pressResend(screen);

      expect(screen.getByText(DAILY_LIMIT)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Resend code" })).toBeNull();
      expect(screen.queryByText(/Resend code in/)).toBeNull();

      await act(async () => {
        fireEvent.changeText(screen.getByLabelText("Code"), "123456");
      });
      expect(verify).not.toHaveBeenCalled();
      expect(screen.getByText(DAILY_LIMIT)).toBeTruthy();

      fireEvent.press(screen.getByRole("button", { name: "Contact support" }));
      expect(props.onContactSupport).toHaveBeenCalledTimes(1);

      fireEvent.press(
        screen.getByRole("button", {
          name: method === "email" ? "Change email" : "Change number",
        }),
      );
      expect(props.onChangeDestination).toHaveBeenCalledTimes(1);
    },
  );

  it("leaves Contact support as the one way forward on an email sign-in", async () => {
    const { screen } = renderForm({
      method: "email",
      onUsePhoneInstead: vi.fn(),
      resend: vi.fn(async () => {
        throw rateLimited({ reason: "destination_limit", retryInSeconds: 0 });
      }),
    });

    expect(screen.getByText(NOT_ARRIVING)).toBeTruthy();
    await pressResend(screen);

    expect(screen.getByText(DAILY_LIMIT)).toBeTruthy();
    expect(screen.queryByText(NOT_ARRIVING)).toBeNull();
    expect(screen.queryByRole("button", { name: "Use phone instead" })).toBeNull();
    expect(screen.getByRole("button", { name: "Contact support" })).toBeTruthy();
  });

  it.each([
    ["backoff", { reason: "backoff", retryInSeconds: 240 }],
    ["ip_limit", { reason: "ip_limit", retryInSeconds: 0 }],
    ["no details", undefined],
  ])("keeps Resend after a %s refusal and offers no support link", async (_label, details) => {
    const { screen } = renderForm({
      resend: vi.fn(async () => {
        throw rateLimited(details);
      }),
    });

    await pressResend(screen);

    expect(screen.getByText(WAIT_A_MOMENT)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resend code" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Contact support" })).toBeNull();
  });

  it("never offers Contact support before the limit", () => {
    const { screen } = renderForm({ method: "email" });

    expect(screen.queryByText("Contact support")).toBeNull();
  });

  it.each([
    ["ru", "За 24 часа запрошено слишком много кодов. Попробуйте позже.", "Связаться с поддержкой"],
    ["tk", "24 sagatda gaty köp kod soraldy. Soňrak synanyşyň.", "Goldaw bilen habarlaş"],
  ] as const)("shows the limit in %s", async (locale, message, link) => {
    const { screen } = renderForm(
      {
        resend: vi.fn(async () => {
          throw rateLimited({ reason: "destination_limit", retryInSeconds: 0 });
        }),
      },
      locale,
    );

    await act(async () => {
      fireEvent.press(
        screen.getByRole("button", {
          name: locale === "ru" ? "Отправить код снова" : "Kody täzeden iber",
        }),
      );
    });

    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByRole("button", { name: link })).toBeTruthy();
  });
});

describe("CodeEntryForm email not arriving", () => {
  it("waits for the first countdown to end before hinting", () => {
    const onUsePhoneInstead = vi.fn();
    const { screen } = renderForm({
      method: "email",
      initialResendSeconds: 3,
      onUsePhoneInstead,
    });

    expect(screen.queryByText(NOT_ARRIVING)).toBeNull();
    expect(screen.queryByRole("button", { name: "Use phone instead" })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText(NOT_ARRIVING)).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Use phone instead" }));
    expect(onUsePhoneInstead).toHaveBeenCalledTimes(1);
  });

  it("keeps the hint after a resend restarts the countdown", async () => {
    const { screen } = renderForm({ method: "email", initialResendSeconds: 0 });

    await pressResend(screen);

    expect(screen.getByText("Resend code in 2:00")).toBeTruthy();
    expect(screen.getByText(NOT_ARRIVING)).toBeTruthy();
  });

  it("offers Use phone instead only when the screen passes it", () => {
    const { screen } = renderForm({ method: "email", initialResendSeconds: 0 });

    expect(screen.getByText(NOT_ARRIVING)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use phone instead" })).toBeNull();
  });

  it("never hints on a phone code", () => {
    const { screen } = renderForm({ method: "phone", initialResendSeconds: 0 });

    expect(screen.queryByText(NOT_ARRIVING)).toBeNull();
  });
});

describe("CodeEntryForm countdown", () => {
  it("shows seconds up to a minute and minutes with seconds above it", () => {
    const { screen } = renderForm({ initialResendSeconds: 61 });

    expect(screen.getByText("Resend code in 1:01")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("Resend code in 60s")).toBeTruthy();
  });

  it.each([
    [61, "1:01"],
    [125, "2:05"],
    [960, "16:00"],
  ])("formats %i seconds as %s", (seconds, text) => {
    expect(formatResendWait(seconds)).toBe(text);
  });
});
