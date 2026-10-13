import type { ComponentProps } from "react";
import type * as Native from "react-native";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import * as reanimated from "react-native-reanimated";
import { HttpResponse, http } from "msw";

import PhoneScreen from "../../app/(auth)/phone";
import EmailScreen from "../../app/(auth)/email";
import { useAuthIntentStore } from "../../src/auth/intentStore";
import { server } from "../msw";
import { act, fireEvent, renderMobile, routeParams, routerMock } from "../render";

const native = vi.hoisted(() => ({ focus: vi.fn(), selection: vi.fn(async () => {}) }));
vi.mock("expo-haptics", () => ({ selectionAsync: native.selection, performAndroidHapticsAsync: native.selection, AndroidHaptics: { Clock_Tick: "clock-tick" } }));
vi.mock("react-native", async (importOriginal) => {
  const hosts = await importOriginal<typeof Native>();
  const React = await import("react");
  const Input = React.forwardRef<{ focus: () => void }, ComponentProps<typeof hosts.TextInput>>((props, ref) => {
    React.useImperativeHandle(ref, () => ({ focus: native.focus }), []);
    return <hosts.TextInput {...props} />;
  });
  Input.displayName = "NativeInput";
  return { ...hosts, TextInput: Input };
});

beforeEach(() => {
  vi.stubGlobal("__DEV__", false);
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 1; });
  native.focus.mockClear(); native.selection.mockClear();
  useAuthIntentStore.setState({ intent: null, replayAction: null, replayReturnTo: null });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function pendingIntent() {
  useAuthIntentStore.getState().requireSignIn(routerMock, { returnTo: "/(tabs)/favorites", action: { kind: "favorite", listingId: "listing" } });
  routeParams.authRoot = "1";
  routerMock.push.mockClear();
}

it("switches in place, retains both values and keeps the same native field for keyboard changes", async () => {
  const view = await renderMobile(<PhoneScreen />);
  const input = view.getByLabelText("Phone number");
  await fireEvent.changeText(input, "61234567");
  await fireEvent.press(view.getByText("Email"));
  expect(routerMock.navigate).not.toHaveBeenCalled();
  expect(routerMock.push).not.toHaveBeenCalled();
  const email = view.getByPlaceholderText("name@example.com");
  expect(email).toBe(input);
  expect(email.props.keyboardType).toBe("email-address");
  await fireEvent.changeText(email, "held@example.com");
  await fireEvent.press(view.getByText("Phone"));
  expect(view.getByDisplayValue("61 23-45-67").props.keyboardType).toBe("phone-pad");
  native.focus.mockClear();
  await fireEvent.press(view.getByText("Email"));
  expect(view.getByDisplayValue("held@example.com")).toBeTruthy();
  expect(native.focus).toHaveBeenCalled();
});

it("keeps pending intent through a switch and cancels it exactly once on close/unmount", async () => {
  pendingIntent();
  const cancel = vi.spyOn(useAuthIntentStore.getState(), "cancelSignIn");
  const view = await renderMobile(<PhoneScreen />);
  await fireEvent.press(view.getByText("Email"));
  expect(cancel).not.toHaveBeenCalled();
  expect(useAuthIntentStore.getState().intent).not.toBeNull();
  await fireEvent.press(view.getByRole("button", { name: "Close" }));
  await view.unmount();
  expect(cancel).toHaveBeenCalledOnce();
  expect(routerMock.dismissTo).toHaveBeenCalledWith("/(tabs)/favorites");
});

it("single Android Back leaves either local method and cancels once", async () => {
  pendingIntent();
  const cancel = vi.spyOn(useAuthIntentStore.getState(), "cancelSignIn");
  const view = await renderMobile(<EmailScreen />);
  await fireEvent.press(view.getByText("Phone"));
  const module = await import("react-native");
  const back = module as unknown as { pressHardwareBack: () => boolean };
  await act(() => { expect(back.pressHardwareBack()).toBe(true); });
  await view.unmount();
  expect(cancel).toHaveBeenCalledOnce();
  expect(routerMock.dismissTo).toHaveBeenCalledOnce();
});

it("places the selected pill directly on first layout; only a value change springs", async () => {
  const withSpring = vi.spyOn(reanimated, "withSpring");
  const view = await renderMobile(<EmailScreen />);
  expect(withSpring).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText("Phone"));
  expect(withSpring).toHaveBeenCalledTimes(1);
});

it("cross-fades the field only on a method switch, not on mount", async () => {
  const withTiming = vi.spyOn(reanimated, "withTiming");
  const view = await renderMobile(<PhoneScreen />);
  expect(withTiming).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText("Email"));
  expect(withTiming).toHaveBeenCalled();
});

it("gives selection feedback only for a changed method, without navigation", async () => {
  const view = await renderMobile(<PhoneScreen />);
  await fireEvent.press(view.getByText("Phone"));
  expect(native.selection).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText("Email"));
  expect(native.selection).toHaveBeenCalledOnce();
});

it("requests the selected method and opens the existing code route with its purpose intact", async () => {
  let body: unknown;
  server.use(http.post("http://localhost:3006/api/v1/auth/otp/request", async ({ request }) => {
    body = await request.json();
    return HttpResponse.json({ requestId: "00000000-0000-4000-8000-000000000001", resendInSeconds: 60 });
  }));
  const view = await renderMobile(<PhoneScreen />);
  await fireEvent.press(view.getByText("Email"));
  await fireEvent.changeText(view.getByPlaceholderText("name@example.com"), "held@example.com");
  await act(async () => { await fireEvent.press(view.getByRole("button", { name: "Get code" })); });
  await vi.waitFor(() => expect(routerMock.push).toHaveBeenCalled());
  expect(body).toEqual({ email: "held@example.com" });
  expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/(auth)/otp", params: { method: "email", destination: "held@example.com", requestId: "00000000-0000-4000-8000-000000000001", resendInSeconds: "60" } });
});


it.each([
  ["en", "Phone", "Email", "Phone number", "Enter your email", "Close"],
  ["ru", "Телефон", "Эл. почта", "Номер телефона", "Введите электронную почту", "Закрыть"],
  ["tk", "Telefon", "E-poçta", "Telefon belgisi", "E-poçtaňyzy giriziň", "Ýap"],
] as const)("keeps localized accessible method selection and held value in %s", async (locale, phone, email, field, emailTitle, close) => {
  const view = await renderMobile(<PhoneScreen />, { locale });
  await fireEvent.changeText(view.getByLabelText(field), "61234567");
  await fireEvent.press(view.getByRole("tab", { name: email }));
  expect(view.getByRole("tab", { name: email, selected: true })).toBeTruthy();
  expect(view.getByText(emailTitle)).toBeTruthy();
  expect(view.getByRole("button", { name: close })).toBeTruthy();
  await fireEvent.press(view.getByRole("tab", { name: phone }));
  expect(view.getByDisplayValue("61 23-45-67")).toBeTruthy();
  expect(routerMock.navigate).not.toHaveBeenCalled();
});

it("preserves completed sign-in replay when the entry unmounts", async () => {
  pendingIntent();
  const cancel = vi.spyOn(useAuthIntentStore.getState(), "cancelSignIn");
  const view = await renderMobile(<PhoneScreen />);
  await act(() => useAuthIntentStore.getState().completeSignIn(routerMock));
  await view.unmount();
  expect(cancel).not.toHaveBeenCalled();
  expect(useAuthIntentStore.getState().replayAction).toEqual({ kind: "favorite", listingId: "listing" });
});
