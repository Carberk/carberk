import type * as Native from "react-native";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

import EmailScreen from "../../app/(auth)/email";
import PhoneScreen from "../../app/(auth)/phone";
import OtpScreen from "../../app/(auth)/otp";
import { useAuthIntentStore } from "../../src/auth/intentStore";
import { act, fireEvent, renderMobile, routeParams, routerMock } from "../render";

import { ToastProvider } from "@/components/ui/toast";

const navigation = vi.hoisted(() => ({ back: () => {} }));
vi.mock("@react-navigation/native", () => ({
  DefaultTheme: { dark: false, colors: {} }, DarkTheme: { dark: true, colors: {} },
  usePreventRemove: (_enabled: boolean, callback: () => void) => { navigation.back = callback; },
}));
vi.mock("react-native", async (importOriginal) => {
  const hosts = await importOriginal<typeof Native>();
  return { ...hosts, Animated: {
    View: hosts.View,
    Value: class { setValue() {} },
    timing: () => ({}), sequence: () => ({ start: () => {} }),
  } };
});

beforeEach(() => {
  vi.stubGlobal("__DEV__", false);
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 1; });
  useAuthIntentStore.setState({ intent: null, replayAction: null, replayReturnTo: null });
});
afterEach(() => vi.unstubAllGlobals());

function openEmailCode() {
  Object.assign(routeParams, { method: "email", destination: "held@example.com", resendInSeconds: "0" });
  return renderMobile(
    <ToastProvider>
      <OtpScreen />
    </ToastProvider>,
  );
}

it("Use phone instead returns to a mounted email entry in place, retaining its held phone value and pending intent", async () => {
  useAuthIntentStore.getState().requireSignIn(routerMock, { returnTo: "/(tabs)/favorites" }, "email");
  routeParams.authRoot = "1";
  const entry = await renderMobile(<EmailScreen />);
  await fireEvent.press(entry.getByText("Phone"));
  await fireEvent.changeText(entry.getByLabelText("Phone number"), "61234567");
  await fireEvent.press(entry.getByText("Email"));
  await fireEvent.changeText(entry.getByPlaceholderText("name@example.com"), "held@example.com");
  const code = await openEmailCode();
  await fireEvent.press(code.getByRole("button", { name: "Use phone instead" }));
  expect(routerMock.back).toHaveBeenCalledOnce();
  expect(routerMock.dismissTo).not.toHaveBeenCalled();
  expect(entry.getByDisplayValue("61 23-45-67")).toBeTruthy();
  expect(useAuthIntentStore.getState().intent).not.toBeNull();
});

it("Change email returns to the selected method with its typed value and no intent cleanup", async () => {
  useAuthIntentStore.getState().requireSignIn(routerMock, { returnTo: "/(tabs)/favorites" });
  routeParams.authRoot = "1";
  const entry = await renderMobile(<PhoneScreen />);
  await fireEvent.press(entry.getByText("Email"));
  await fireEvent.changeText(entry.getByPlaceholderText("name@example.com"), "held@example.com");
  const code = await openEmailCode();
  await fireEvent.press(code.getByRole("button", { name: "Change email" }));
  expect(routerMock.back).toHaveBeenCalledOnce();
  expect(entry.getByDisplayValue("held@example.com")).toBeTruthy();
  expect(useAuthIntentStore.getState().intent).not.toBeNull();
});


it("Code header Back returns to the held selected method without abandoning intent", async () => {
  useAuthIntentStore.getState().requireSignIn(routerMock, { returnTo: "/(tabs)/favorites" });
  routeParams.authRoot = "1";
  const entry = await renderMobile(<PhoneScreen />);
  await fireEvent.press(entry.getByText("Email"));
  await fireEvent.changeText(entry.getByPlaceholderText("name@example.com"), "held@example.com");
  const code = await openEmailCode();
  await fireEvent.press(code.getByRole("button", { name: "Back" }));
  expect(routerMock.back).toHaveBeenCalledOnce();
  expect(routerMock.dismissTo).not.toHaveBeenCalled();
  expect(entry.getByDisplayValue("held@example.com")).toBeTruthy();
  expect(useAuthIntentStore.getState().intent).not.toBeNull();
});

it("Code Back still returns to the older entry when a newer mounted entry unmounts", async () => {
  useAuthIntentStore.getState().requireSignIn(routerMock, { returnTo: "/(tabs)/favorites" });
  const entry = await renderMobile(<EmailScreen />);
  await fireEvent.changeText(entry.getByPlaceholderText("name@example.com"), "held@example.com");
  const newer = await renderMobile(<PhoneScreen />);
  await newer.unmount();
  const code = await openEmailCode();
  await fireEvent.press(code.getByRole("button", { name: "Back" }));
  expect(routerMock.back).toHaveBeenCalledOnce();
  expect(routerMock.dismissTo).not.toHaveBeenCalled();
  expect(entry.getByDisplayValue("held@example.com")).toBeTruthy();
  expect(useAuthIntentStore.getState().intent).not.toBeNull();
});

it("the Code native Back guard returns to the same entry and leaves intent live", async () => {
  useAuthIntentStore.getState().requireSignIn(routerMock, { returnTo: "/(tabs)/favorites" });
  routeParams.authRoot = "1";
  const entry = await renderMobile(<PhoneScreen />);
  await fireEvent.press(entry.getByText("Email"));
  await fireEvent.changeText(entry.getByPlaceholderText("name@example.com"), "held@example.com");
  await openEmailCode();
  await act(() => navigation.back());
  expect(routerMock.back).toHaveBeenCalledOnce();
  expect(routerMock.dismissTo).not.toHaveBeenCalled();
  expect(entry.getByDisplayValue("held@example.com")).toBeTruthy();
  expect(useAuthIntentStore.getState().intent).not.toBeNull();
});
