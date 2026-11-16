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

it.each([
  {
    outcome: "lost response",
    response: () => HttpResponse.error(),
    message: "Could not confirm whether a code was sent. Wait before requesting another.",
    russian: "Не удалось подтвердить отправку кода. Подождите перед новым запросом.",
    dailyLimit: false,
  },
  {
    outcome: "daily limit",
    response: () => HttpResponse.json({ code: "RATE_LIMITED", details: {
      reason: "destination_limit", retryInSeconds: 0,
    } }, { status: 429 }),
    message: "Too many codes requested for this destination in 24 hours. Try again later.",
    russian: "За 24 часа запрошено слишком много кодов. Попробуйте позже.",
    dailyLimit: true,
  },
])("shows the latest resend $outcome while keeping the uncertain old code locked", async ({ response, message, russian, dailyLimit }) => {
  server.use(
    http.post("*/auth/otp/verify", () => HttpResponse.error()),
    http.post("*/auth/otp/request", response),
  );
  const screen = await renderMobile(<ToastProvider><OtpScreen /></ToastProvider>);
  await act(async () => { void fireEvent.changeText(screen.getByDisplayValue(""), "123456"); });
  await screen.findByText("No confirmation received. This code may have been used. Request a new code to continue.");

  await fireEvent.press(screen.getByRole("button", { name: "Resend code" }));

  await screen.findByText(message);
  expect(screen.queryByText("No confirmation received. This code may have been used. Request a new code to continue.")).toBeNull();
  expect(screen.getByDisplayValue("").props.editable).toBe(false);
  expect(await loadAuthSession()).toBeNull();
  expect(Boolean(screen.queryByRole("button", { name: "Resend code" }))).toBe(!dailyLimit);
  await act(async () => { await screen.i18n.changeLanguage("ru"); });
  expect(screen.getByText(russian)).toBeTruthy();
});
