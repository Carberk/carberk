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

it("switches in place, retains both values and keeps the same native field for keyboard changes", () => {
  const view = renderMobile(<PhoneScreen />);
  const input = view.getByLabelText("Phone number");
  fireEvent.changeText(input, "61234567");
  fireEvent.press(view.getByText("Email"));
  expect(routerMock.navigate).not.toHaveBeenCalled();
  expect(routerMock.push).not.toHaveBeenCalled();
  const email = view.getByPlaceholderText("name@example.com");
  expect(email).toBe(input);
  expect(email.props.keyboardType).toBe("email-address");
  fireEvent.changeText(email, "held@example.com");
  fireEvent.press(view.getByText("Phone"));
  expect(view.getByDisplayValue("61 23-45-67").props.keyboardType).toBe("phone-pad");
  native.focus.mockClear();
  fireEvent.press(view.getByText("Email"));
  expect(view.getByDisplayValue("held@example.com")).toBeTruthy();
  expect(native.focus).toHaveBeenCalled();
});

it("keeps pending intent through a switch and cancels it exactly once on close/unmount", () => {
  pendingIntent();
  const cancel = vi.spyOn(useAuthIntentStore.getState(), "cancelSignIn");
  const view = renderMobile(<PhoneScreen />);
  fireEvent.press(view.getByText("Email"));
  expect(cancel).not.toHaveBeenCalled();
  expect(useAuthIntentStore.getState().intent).not.toBeNull();
  fireEvent.press(view.getByRole("button", { name: "Close" }));
  view.unmount();
  expect(cancel).toHaveBeenCalledOnce();
  expect(routerMock.dismissTo).toHaveBeenCalledWith("/(tabs)/favorites");
});

it("single Android Back leaves either local method and cancels once", async () => {
  pendingIntent();
  const cancel = vi.spyOn(useAuthIntentStore.getState(), "cancelSignIn");
  const view = renderMobile(<EmailScreen />);
  fireEvent.press(view.getByText("Phone"));
  const module = await import("react-native");
  const back = module as unknown as { pressHardwareBack: () => boolean };
  act(() => { expect(back.pressHardwareBack()).toBe(true); });
  view.unmount();
  expect(cancel).toHaveBeenCalledOnce();
  expect(routerMock.dismissTo).toHaveBeenCalledOnce();
});

it("places the selected pill directly on first layout; only a value change springs", () => {
  const withSpring = vi.spyOn(reanimated, "withSpring");
  const view = renderMobile(<EmailScreen />);
  expect(withSpring).not.toHaveBeenCalled();
  fireEvent.press(view.getByText("Phone"));
  expect(withSpring).toHaveBeenCalledTimes(1);
});

it("cross-fades the field only on a method switch, not on mount", () => {
  const withTiming = vi.spyOn(reanimated, "withTiming");
  const view = renderMobile(<PhoneScreen />);
  expect(withTiming).not.toHaveBeenCalled();
  fireEvent.press(view.getByText("Email"));
  expect(withTiming).toHaveBeenCalled();
});

it("gives selection feedback only for a changed method, without navigation", () => {
  const view = renderMobile(<PhoneScreen />);
  fireEvent.press(view.getByText("Phone"));
  expect(native.selection).not.toHaveBeenCalled();
  fireEvent.press(view.getByText("Email"));
  expect(native.selection).toHaveBeenCalledOnce();
});

it("requests the selected method and opens the existing code route with its purpose intact", async () => {
  let body: unknown;
  server.use(http.post("http://localhost:3006/api/v1/auth/otp/request", async ({ request }) => {
    body = await request.json();
    return HttpResponse.json({ requestId: "00000000-0000-4000-8000-000000000001", resendInSeconds: 60 });
  }));
  const view = renderMobile(<PhoneScreen />);
  fireEvent.press(view.getByText("Email"));
  fireEvent.changeText(view.getByPlaceholderText("name@example.com"), "held@example.com");
  await act(async () => { fireEvent.press(view.getByRole("button", { name: "Get code" })); });
  await vi.waitFor(() => expect(routerMock.push).toHaveBeenCalled());
  expect(body).toEqual({ email: "held@example.com" });
  expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/(auth)/otp", params: { method: "email", destination: "held@example.com", requestId: "00000000-0000-4000-8000-000000000001", resendInSeconds: "60" } });
});


it.each([
  ["en", "Phone", "Email", "Phone number", "Sign in to Carberk", "Close"],
  ["ru", "Телефон", "Эл. почта", "Номер телефона", "Вход в Carberk", "Закрыть"],
  ["tk", "Telefon", "E-poçta", "Telefon belgisi", "Carberk-e giriň", "Ýap"],
] as const)("keeps localized accessible method selection and held value in %s", (locale, phone, email, field, entryTitle, close) => {
  const view = renderMobile(<PhoneScreen />, { locale });
  fireEvent.changeText(view.getByLabelText(field), "61234567");
  fireEvent.press(view.getByRole("tab", { name: email }));
  expect(view.getByRole("tab", { name: email, selected: true })).toBeTruthy();
  expect(view.getByText(entryTitle)).toBeTruthy();
  expect(view.getByRole("button", { name: close })).toBeTruthy();
  fireEvent.press(view.getByRole("tab", { name: phone }));
  expect(view.getByDisplayValue("61 23-45-67")).toBeTruthy();
  expect(routerMock.navigate).not.toHaveBeenCalled();
});

it("preserves completed sign-in replay when the entry unmounts", () => {
  pendingIntent();
  const cancel = vi.spyOn(useAuthIntentStore.getState(), "cancelSignIn");
  const view = renderMobile(<PhoneScreen />);
  act(() => useAuthIntentStore.getState().completeSignIn(routerMock));
  view.unmount();
  expect(cancel).not.toHaveBeenCalled();
  expect(useAuthIntentStore.getState().replayAction).toEqual({ kind: "favorite", listingId: "listing" });
});
