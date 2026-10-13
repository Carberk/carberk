import type { ComponentProps } from "react";
import type * as ReactNative from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../src/api/client";

import { CodeEntryForm } from "./CodeEntryForm";

import { act, fireEvent, renderMobile } from "@/test/render";

// Only native boundaries are substituted: the real form and OtpCells execute.
const native = vi.hoisted(() => ({
  reducedMotion: false,
  focus: vi.fn(),
  animate: vi.fn(),
}));
vi.mock("react-native-reanimated", () => ({
  useReducedMotion: () => native.reducedMotion,
}));
vi.mock("react-native", async (importOriginal) => {
  const hosts = await importOriginal<typeof ReactNative>();
  const React = await import("react");
  const NativeInput = React.forwardRef<
    { focus: () => void },
    ComponentProps<typeof hosts.TextInput>
  >((props, ref) => {
    React.useImperativeHandle(ref, () => ({ focus: native.focus }), []);
    return <hosts.TextInput {...props} />;
  });
  NativeInput.displayName = "NativeInput";
  return {
    ...hosts,
    TextInput: NativeInput,
    Animated: {
      View: hosts.View,
      Value: class {
        setValue() {}
      },
      timing: () => ({}),
      sequence: () => ({ start: native.animate }),
    },
  };
});

beforeEach(() => {
  native.reducedMotion = false;
  native.focus.mockClear();
  native.animate.mockClear();
  vi.stubGlobal("__DEV__", false);
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    callback();
    return 1;
  });
});
afterEach(() => vi.unstubAllGlobals());

async function renderWrongCode(locale: "en" | "ru" | "tk" = "en", method: "phone" | "email" = "phone") {
  const verify = vi.fn(async (): Promise<void> => {
    throw new ApiError("INVALID_OTP", 400, "Invalid code");
  });
  const view = await renderMobile(
    <CodeEntryForm
      method={method}
      displayedDestination="+993 61 ** ** 67"
      initialResendSeconds={0}
      verify={verify}
      resend={async () => ({ resendInSeconds: 120 })}
      onChangeDestination={() => {}}
      onContactSupport={() => {}}
    />,
    { locale },
  );
  // The form also focuses on mount; measure the wrong-code focus reset only.
  native.focus.mockClear();
  return { view, verify };
}

async function enterWrongCode(view: Awaited<ReturnType<typeof renderMobile>>) {
  await act(async () => {
    void fireEvent.changeText(view.getByDisplayValue(""), "123456");
  });
}

describe("wrong code through the real form and cells", () => {
  it.each([
    ["en", "phone", "Wrong code. Try again."],
    ["ru", "phone", "Неверный код. Попробуйте еще раз."],
    ["tk", "phone", "Kod nädogry. Täzeden synanyşyň."],
    ["en", "email", "Wrong code. Try again."],
    ["ru", "email", "Неверный код. Попробуйте еще раз."],
    ["tk", "email", "Kod nädogry. Täzeden synanyşyň."],
  ] as const)("uses instant error, digit clearing and focus reset in %s for %s under Reduce Motion", async (locale, method, error) => {
    native.reducedMotion = true;
    const { view, verify } = await renderWrongCode(locale, method);
    await enterWrongCode(view);
    expect(verify).toHaveBeenCalledWith("123456");
    expect(view.getByText(error)).toBeTruthy();
    expect(view.getByDisplayValue("").props.editable).toBe(true);
    expect(native.focus).toHaveBeenCalledOnce();
    expect(native.animate).not.toHaveBeenCalled();

    // The instant error does not prevent correcting the code on the same form.
    verify.mockResolvedValueOnce(undefined);
    await act(async () => {
      void fireEvent.changeText(view.getByDisplayValue(""), "654321");
    });
    expect(verify).toHaveBeenLastCalledWith("654321");
    expect(view.queryByText(error)).toBeNull();
  });

  it("keeps the normal shake, digit clearing and focus reset when Reduce Motion is off", async () => {
    const { view } = await renderWrongCode();
    await enterWrongCode(view);
    expect(view.getByText("Wrong code. Try again.")).toBeTruthy();
    expect(view.getByDisplayValue("").props.editable).toBe(true);
    expect(native.focus).toHaveBeenCalledOnce();
    expect(native.animate).toHaveBeenCalledOnce();
  });
});
