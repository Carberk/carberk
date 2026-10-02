import { useFocusEffect } from "expo-router";
import type { EffectCallback } from "react";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NotificationsScreen from "../../app/notifications";
import { act, fireEvent, renderMobile, routerMock } from "../render";

const appState = vi.hoisted(() => ({
  listeners: new Set<(status: string) => void>(),
}));

vi.mock("react-native", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  AppState: {
    addEventListener: (_: string, listener: (status: string) => void) => {
      appState.listeners.add(listener);
      return { remove: () => appState.listeners.delete(listener) };
    },
  },
}));
vi.mock("expo-linking", () => ({ openSettings: vi.fn(async () => {}) }));
vi.mock("expo-notifications", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));

type Permission = "granted" | "denied" | "undetermined" | "unavailable";

function devicePermission(permission: Permission) {
  vi.mocked(Notifications.getPermissionsAsync).mockImplementation(async () => {
    if (permission === "unavailable") throw new Error("Native module unavailable");
    return { granted: permission === "granted", status: permission } as never;
  });
}

async function renderScreen(locale = "en") {
  const view = renderMobile(<NotificationsScreen />, { locale });
  await act(async () => {});
  return view;
}

// The latest focus callback, so a spec can focus the screen again.
const focus = vi.hoisted(() => ({ callback: null as null | (() => void) }));

beforeEach(() => {
  appState.listeners.clear();
  focus.callback = null;
  vi.mocked(Notifications.requestPermissionsAsync).mockClear();
  vi.mocked(Linking.openSettings).mockClear();
  // Run the focus callback as a mount effect, as the screen gaining focus.
  vi.mocked(useFocusEffect).mockImplementation((callback: EffectCallback) => {
    focus.callback = callback;
    useEffect(() => callback(), [callback]);
  });
});

describe("Notifications screen", () => {
  it("shows On when the device permission is granted", async () => {
    devicePermission("granted");
    const view = await renderScreen();
    expect(view.getByLabelText("Message notifications, On")).toBeTruthy();
  });

  it.each(["denied", "undetermined", "unavailable"] as const)(
    "shows Off when the device permission is %s",
    async (permission) => {
      devicePermission(permission);
      const view = await renderScreen();
      expect(view.getByLabelText("Message notifications, Off")).toBeTruthy();
    },
  );

  it("shows the new state when the User returns from system settings", async () => {
    devicePermission("denied");
    const view = await renderScreen();
    expect(view.getByLabelText("Message notifications, Off")).toBeTruthy();

    devicePermission("granted");
    await act(async () => {
      appState.listeners.forEach((listener) => listener("active"));
    });
    expect(view.getByLabelText("Message notifications, On")).toBeTruthy();
  });

  it("re-reads the permission when the screen is focused again", async () => {
    devicePermission("granted");
    const view = await renderScreen();
    expect(view.getByLabelText("Message notifications, On")).toBeTruthy();

    devicePermission("denied");
    await act(async () => {
      focus.callback?.();
    });
    expect(view.getByLabelText("Message notifications, Off")).toBeTruthy();
  });

  it("shows no state until the first read finishes", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockImplementation(() => new Promise(() => {}));
    const view = await renderScreen();
    expect(view.getByLabelText("Message notifications")).toBeTruthy();
    expect(view.queryByText("On")).toBeNull();
    expect(view.queryByText("Off")).toBeNull();
  });

  it("keeps the newest read when an older one resolves last", async () => {
    let resolveOlder: (value: unknown) => void = () => {};
    vi.mocked(Notifications.getPermissionsAsync)
      .mockImplementationOnce(() => new Promise<never>((resolve) => { resolveOlder = resolve as (value: unknown) => void; }))
      .mockImplementationOnce(async () => ({ granted: true, status: "granted" }) as never);
    const view = renderMobile(<NotificationsScreen />);
    await act(async () => {
      appState.listeners.forEach((listener) => listener("active"));
    });
    expect(view.getByLabelText("Message notifications, On")).toBeTruthy();

    await act(async () => {
      resolveOlder({ granted: false, status: "denied" });
    });
    expect(view.getByLabelText("Message notifications, On")).toBeTruthy();
  });

  it("opens the app's page in system settings", async () => {
    devicePermission("denied");
    const view = await renderScreen();
    fireEvent.press(view.getByRole("button", { name: "Open system settings" }));
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });

  it("never asks for the permission", async () => {
    devicePermission("undetermined");
    await renderScreen();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("has no switch or checkbox, and shows the mute hint", async () => {
    devicePermission("granted");
    const view = await renderScreen();
    expect(view.queryByRole("switch")).toBeNull();
    expect(view.queryByRole("checkbox")).toBeNull();
    expect(view.getByText("To mute one conversation, use its menu.")).toBeTruthy();
  });

  it("goes back to Cabinet", async () => {
    devicePermission("granted");
    const view = await renderScreen();
    fireEvent.press(view.getByRole("button", { name: "Back" }));
    expect(routerMock.back).toHaveBeenCalledTimes(1);
  });

  it("goes to Cabinet when there is no screen to go back to", async () => {
    devicePermission("granted");
    routerMock.canGoBack.mockReturnValueOnce(false);
    const view = await renderScreen();
    fireEvent.press(view.getByRole("button", { name: "Back" }));
    expect(routerMock.replace).toHaveBeenCalledWith("/(tabs)/services");
  });

  it.each([
    ["ru", "Уведомления о сообщениях, Включены", "Открыть настройки системы"],
    ["tk", "Habar habarnamalary, Açyk", "Ulgam sazlamalaryny aç"],
  ])("reads in %s", async (locale, state, settings) => {
    devicePermission("granted");
    const view = await renderScreen(locale);
    expect(view.getByLabelText(state)).toBeTruthy();
    expect(view.getByRole("button", { name: settings })).toBeTruthy();
    expect(view.getByText(view.i18n.t("account:notifications"))).toBeTruthy();
    expect(view.getByText(view.i18n.t("account:notificationsMuteHint"))).toBeTruthy();
  });
});
