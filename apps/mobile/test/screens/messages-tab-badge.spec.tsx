import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { focusManager } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, renderMobile } from "../render";
import { AutoTmTabBar } from "../../components/navigation/AutoTmTabBar";

const api = vi.hoisted(() => ({ get: vi.fn() }));
const auth = vi.hoisted(() => ({
  viewer: { userId: "user-a" } as { userId: string } | null | undefined,
}));
const push = vi.hoisted(() => ({
  listener: null as null | (() => void),
  remove: vi.fn(),
}));

vi.mock("../../src/api/client", () => ({
  apiClient: { get: api.get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(public code: string, public status: number) {
      super(code);
    }
  },
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("../../src/auth/useViewer", () => ({ useViewer: () => auth.viewer }));
vi.mock("expo-notifications", () => ({
  addNotificationReceivedListener: vi.fn((listener: () => void) => {
    push.listener = listener;
    return { remove: push.remove };
  }),
}));

const routeNames = ["(search)", "favorites", "sell", "chat", "services"];
const routes = routeNames.map((name) => ({ key: name, name, params: undefined }));
const CHAT = 3;

function barProps(index: number) {
  return {
    state: { index, key: "tabs", routes },
    descriptors: Object.fromEntries(routes.map((route) => [route.key, { options: {} }])),
    navigation: { emit: vi.fn(() => ({ defaultPrevented: false })), dispatch: vi.fn() },
  } as unknown as BottomTabBarProps;
}

/** Lets queries and their batched notifications finish. */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderBar(count: number | null, { index = 0, locale = "en" } = {}) {
  if (count !== null) api.get.mockResolvedValue({ count });
  const view = await renderMobile(<AutoTmTabBar {...barProps(index)} />, { locale });
  await settle();
  return view;
}

beforeEach(() => {
  auth.viewer = { userId: "user-a" };
  push.listener = null;
  push.remove.mockReset();
  api.get.mockReset().mockResolvedValue({ count: 0 });
});

describe("Messages tab unread badge", () => {
  it("shows nothing at 0", async () => {
    const view = await renderBar(0);

    expect(view.queryByTestId("messages-tab-badge")).toBeNull();
    expect(view.getByRole("tab", { name: "Messages" })).toBeTruthy();
  });

  it.each([
    [1, "1"],
    [99, "99"],
    [100, "99+"],
    [1250, "99+"],
  ])("shows %i as %s", async (count, shown) => {
    const view = await renderBar(count);

    expect(view.getByTestId("messages-tab-badge")).toBeTruthy();
    expect(view.getByText(shown)).toBeTruthy();
  });

  it("states the count in the tab's accessibility label", async () => {
    const view = await renderBar(3);

    expect(view.getByRole("tab", { name: "Messages, 3 unread" })).toBeTruthy();
  });

  it("labels the count in Russian and Turkmen", async () => {
    expect((await renderBar(3, { locale: "ru" })).getByRole("tab", { name: "Сообщения, непрочитанных: 3" })).toBeTruthy();
    expect((await renderBar(3, { locale: "tk" })).getByRole("tab", { name: "Çat, okalmadyk: 3" })).toBeTruthy();
  });

  it("leaves the other tabs unchanged", async () => {
    const view = await renderBar(3);

    expect(view.getAllByTestId("messages-tab-badge")).toHaveLength(1);
    for (const name of ["Search", "Favorites", "Sell", "Account"]) {
      expect(view.getByRole("tab", { name })).toBeTruthy();
    }
  });

  it("floats over the icon, so the tab keeps its size", async () => {
    const view = await renderBar(3);

    expect(view.getByTestId("messages-tab-badge").props.className).toContain("absolute");
  });

  it("shows nothing and asks for nothing when signed out", async () => {
    auth.viewer = null;
    const view = await renderBar(null);

    expect(view.queryByTestId("messages-tab-badge")).toBeNull();
    expect(view.getByRole("tab", { name: "Messages" })).toBeTruthy();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("clears on sign-out and never shows the previous User's count to the next", async () => {
    const view = await renderBar(5);
    expect(view.getByText("5")).toBeTruthy();

    auth.viewer = null;
    await view.rerender(<AutoTmTabBar {...barProps(0)} />);
    await settle();
    expect(view.queryByTestId("messages-tab-badge")).toBeNull();

    let answer: (value: { count: number }) => void = () => {};
    api.get.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    auth.viewer = { userId: "user-b" };
    await view.rerender(<AutoTmTabBar {...barProps(0)} />);
    await settle();
    expect(view.queryByTestId("messages-tab-badge")).toBeNull();

    await act(async () => { answer({ count: 2 }); });
    await settle();
    expect(view.getByText("2")).toBeTruthy();
    expect(view.queryByText("5")).toBeNull();
  });

  describe("refreshes", () => {
    it("when the app comes to the foreground", async () => {
      const view = await renderBar(1);
      api.get.mockResolvedValue({ count: 4 });

      await act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await settle();

      expect(view.getByText("4")).toBeTruthy();
    });

    it("when a push arrives while the app is open", async () => {
      const view = await renderBar(1);
      api.get.mockResolvedValue({ count: 2 });

      await act(async () => { push.listener?.(); });
      await settle();

      expect(view.getByText("2")).toBeTruthy();
    });

    it("when the Messages tab gains focus", async () => {
      const view = await renderBar(1, { index: 0 });
      api.get.mockClear().mockResolvedValue({ count: 3 });

      await view.rerender(<AutoTmTabBar {...barProps(CHAT)} />);
      await settle();

      expect(api.get).toHaveBeenCalledTimes(1);
      expect(view.getByText("3")).toBeTruthy();
    });

    it("not when another tab gains focus", async () => {
      const view = await renderBar(1, { index: 0 });
      api.get.mockClear();

      await view.rerender(<AutoTmTabBar {...barProps(1)} />);
      await settle();

      expect(api.get).not.toHaveBeenCalled();
    });
  });
});
