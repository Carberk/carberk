import type * as ReactNative from "react-native";
import { http, HttpResponse } from "msw";
import { beforeEach, expect, it, vi } from "vitest";

import OtpScreen from "../../app/(auth)/otp";
import { clearAuthSession, loadAuthSession } from "../../src/auth/session";
import { act, fireEvent, renderMobile, routeParams, routerMock } from "../render";
import { server } from "../msw";
import { photoApiStorage } from "../profile-photo-storage";

import { ToastProvider } from "@/components/ui/toast";

vi.mock("expo-secure-store", async () => {
  const { photoApiStorage: storage } = await import("../profile-photo-storage");
  return { getItemAsync: async (key: string) => storage.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { storage.set(key, value); },
    deleteItemAsync: async (key: string) => { storage.delete(key); } };
});
vi.mock("@react-navigation/native", () => ({ usePreventRemove: () => {},
  DefaultTheme: { dark: false, colors: {} }, DarkTheme: { dark: true, colors: {} } }));
vi.mock("react-native", async (original) => {
  const native = await original<typeof ReactNative>();
  return { ...native, Animated: { View: native.View, Value: class { setValue() {} },
    timing: () => ({}), sequence: () => ({ start() {} }) } };
});

beforeEach(async () => {
  vi.stubGlobal("__DEV__", false);
  photoApiStorage.clear();
  await clearAuthSession();
  routeParams.method = "email";
  routeParams.destination = "owner@example.test";
  routeParams.resendInSeconds = "0";
});

it("keeps native sign-in unconfirmed after the server consumes the code, and requires an explicit new code", async () => {
  let verifications = 0;
  let resends = 0;
  server.use(
    http.post("*/auth/otp/verify", () => { verifications++; return HttpResponse.error(); }),
    http.post("*/auth/otp/request", () => {
      resends++;
      return HttpResponse.json({ requestId: "00000000-0000-4000-8000-000000000001", resendInSeconds: 60 });
    }),
  );
  const screen = await renderMobile(<ToastProvider><OtpScreen /></ToastProvider>);
  await act(async () => { void fireEvent.changeText(screen.getByDisplayValue(""), "123456"); });
  await vi.waitFor(() => expect(screen.getByText("No confirmation received. This code may have been used. Request a new code to continue.")).toBeTruthy());
  expect(screen.getByDisplayValue("").props.editable).toBe(false);
  expect(await loadAuthSession()).toBeNull();
  expect(routerMock.back).not.toHaveBeenCalled();
  expect(verifications).toBe(1);
  expect(resends).toBe(0);
  await act(async () => { await screen.i18n.changeLanguage("ru"); });
  expect(screen.getByText("Подтверждение не получено. Код мог быть использован. Запросите новый код, чтобы продолжить.")).toBeTruthy();
  await act(async () => { await screen.i18n.changeLanguage("tk"); });
  expect(screen.getByText("Tassyknama alynmady. Kod ulanylan bolmagy mümkin. Dowam etmek üçin täze kod soraň.")).toBeTruthy();
  await act(async () => { await screen.i18n.changeLanguage("en"); });
  await fireEvent.press(screen.getByRole("button", { name: "Resend code" }));
  expect(screen.getByDisplayValue("").props.editable).toBe(true);
  expect(resends).toBe(1);
  expect(verifications).toBe(1);
});
