import type { ReactElement } from "react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CabinetScreen from "../../app/(tabs)/services";
import DisplayNameScreen from "../../app/account/display-name";
import ProfileScreen from "../../app/profile";
import { clearAuthSession, storeAuthSession } from "../../src/auth/session";
import { profileNoticeStore } from "../../src/identity/profileNotice";
import { server } from "../msw";
import { act, fireEvent, renderMobile, routerMock } from "../render";

import { ToastProvider } from "@/components/ui/toast";

// The name editor, Profile and Cabinet with the real session, API client,
// `/me` query and `useUpdateDisplayName` against an in-memory API that stores
// the name like the server does. Only the device's storage is replaced.

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { storage.set(key, value); },
  deleteItemAsync: async (key: string) => { storage.delete(key); },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const AMAN_ID = "00000000-0000-4000-8000-00000000000a";
const PHONE = "+993 65 XX-XX-56";

type Answer = "store" | "fail" | "offline" | { reason: string } | "hold";

const api = {
  displayName: null as string | null,
  patches: [] as unknown[],
  next: [] as Answer[],
  release: null as (() => void) | null,
};

function me() {
  return {
    id: AMAN_ID, phone: "+99365123456", email: null, phoneVerified: true,
    displayName: api.displayName, nameNumber: 4821, avatarIndex: 7, avatarKey: null,
    role: "buyer", avatarUrl: null, locale: "ru",
    createdAt: "2026-01-15T00:00:00.000Z", deletionScheduledAt: null,
  };
}

beforeEach(async () => {
  storage.clear();
  api.displayName = null;
  api.patches = [];
  api.next = [];
  api.release = null;
  profileNoticeStore.setState({ notice: null });
  server.use(
    http.get("*/me", () => HttpResponse.json(me())),
    http.patch("*/me", async ({ request }) => {
      const body = (await request.json()) as { displayName: string };
      api.patches.push(body);
      const answer = api.next.shift() ?? "store";
      if (answer === "fail") return HttpResponse.json({ code: "INTERNAL" }, { status: 500 });
      if (answer === "offline") return HttpResponse.error();
      if (typeof answer === "object") {
        return HttpResponse.json(
          { statusCode: 400, code: "INVALID_DISPLAY_NAME", message: "x", details: answer },
          { status: 400 },
        );
      }
      if (answer === "hold") await new Promise<void>((resolve) => { api.release = resolve; });
      api.displayName = body.displayName.trim().replace(/\s+/g, " ");
      return HttpResponse.json(me());
    }),
    http.get("*/me/listings/counts", () =>
      HttpResponse.json({ active: 0, sold: 0, archived: 0, banned: 0, drafts: 0, total: 0 })),
  );
  await storeAuthSession({
    accessToken: "aman", refreshToken: "refresh-aman",
    user: { id: AMAN_ID, phone: "+99365123456", email: null, displayName: null, role: "buyer" },
  });
});

function render(screen: ReactElement, options?: { locale?: string }) {
  return renderMobile(<ToastProvider>{screen}</ToastProvider>, options);
}

type View = ReturnType<typeof renderMobile>;

async function openEditor(options?: { locale?: string }) {
  const view = render(<DisplayNameScreen />, options);
  const generated = { en: "Driver 4821", ru: "Водитель 4821", tk: "Sürüji 4821" };
  await view.findByDisplayValue(api.displayName ?? generated[(options?.locale ?? "en") as keyof typeof generated]);
  return view;
}

const field = (view: View) => view.getByLabelText("Name");
const save = (view: View) => view.getByRole("button", { name: "Save" });
const isDisabled = (button: { props: Record<string, unknown> }) =>
  (button.props.accessibilityState as { disabled?: boolean } | undefined)?.disabled === true;
const type = (view: View, text: string) => fireEvent.changeText(field(view), text);
const classOf = (node: { props: Record<string, unknown> }) => String(node.props.className ?? "");

describe("Opening the name editor from Profile", () => {
  it("shows the name on Profile as a button with a pencil that opens the editor", async () => {
    const view = render(<ProfileScreen />);
    const name = await view.findByRole("button", { name: "Edit name" });
    expect(view.getByText("Driver 4821")).toBeTruthy();
    // A value, not a hint: screen readers can switch hints off.
    expect(name.props.accessibilityValue).toEqual({ text: "Driver 4821" });
    expect(name.props.accessibilityHint).toBeUndefined();
    expect(classOf(name)).toContain("min-h-11");
    fireEvent.press(name);
    expect(routerMock.push).toHaveBeenCalledWith("/account/display-name");
  });

  it("opens with the generated name in the app language when the User has not set one", async () => {
    const view = await openEditor({ locale: "ru" });
    expect(view.getByDisplayValue("Водитель 4821")).toBeTruthy();
    expect(view.getByText("От 2 до 30 символов")).toBeTruthy();
  });

  it("opens with the User's own name, the rule line and the counter", async () => {
    api.displayName = "Aman";
    const view = await openEditor();
    expect(view.getByDisplayValue("Aman")).toBeTruthy();
    expect(view.getByText("2 to 30 characters")).toBeTruthy();
    expect(view.getByText("4/30")).toBeTruthy();
  });

  it("shows no name in the field when opened signed out with the previous User's /me cached", async () => {
    api.displayName = "Aman";
    const view = render(<ProfileScreen />);
    expect(await view.findByText("Aman")).toBeTruthy();
    await act(async () => { await clearAuthSession(); });

    view.rerender(<ToastProvider><DisplayNameScreen /></ToastProvider>);

    expect(view.getByLabelText("Name").props.value).toBe("");
    expect(view.queryByDisplayValue("Aman")).toBeNull();
  });

  it("has the title, the helper line and a labelled field in Turkmen", async () => {
    const view = await openEditor({ locale: "tk" });
    expect(view.getByText("2-den 30-a çenli nyşan")).toBeTruthy();
    expect(view.getByLabelText("At")).toBeTruthy();
  });
});

describe("Editing the name", () => {
  it("keeps Save disabled until the name is valid and different", async () => {
    api.displayName = "Aman";
    const view = await openEditor();
    expect(isDisabled(save(view))).toBe(true);
    type(view, "Aman ");
    expect(isDisabled(save(view))).toBe(true);
    type(view, "A");
    expect(isDisabled(save(view))).toBe(true);
    type(view, "Merdan");
    expect(isDisabled(save(view))).toBe(false);
  });

  it("shows no error for an untouched field", async () => {
    const view = await openEditor();
    expect(view.queryByRole("alert")).toBeNull();
    expect(classOf(field(view))).not.toContain("border-destructive");
  });

  it.each([
    ["", "Enter a name."],
    ["     ", "A name can't be only spaces."],
    ["  A  ", "Use at least 2 characters."],
    ["a".repeat(31), "Use 30 characters or fewer."],
  ])("after an edit, replaces the rule line with the error for %j at once", async (text, error) => {
    const view = await openEditor();
    type(view, text);
    const line = view.getByText(error);
    expect(line.props.accessibilityRole).toBe("alert");
    expect(line.props.accessibilityLiveRegion).toBe("polite");
    expect(view.queryByText("2 to 30 characters")).toBeNull();
    expect(classOf(field(view))).toContain("border-destructive");
    expect(isDisabled(save(view))).toBe(true);
  });

  it("counts characters after trimming and turns the counter red past 30", async () => {
    const view = await openEditor();
    type(view, "  Aman   Durdy ");
    expect(view.getByText("10/30")).toBeTruthy();
    type(view, "a".repeat(31));
    expect(classOf(view.getByText("31/30"))).toContain("text-destructive");
  });

  it("lets the User type past 30 so the error can be seen, and stops at 40", async () => {
    const view = await openEditor();
    expect(field(view).props.maxLength).toBe(40);
  });
});

describe("Saving the name", () => {
  it("saves the normalized name, returns to Profile and Cabinet with it, and says Name saved", async () => {
    const view = await openEditor();
    type(view, "  Aman   Durdy ");
    await act(async () => { fireEvent.press(save(view)); });
    await vi.waitFor(() => expect(routerMock.dismissTo).toHaveBeenCalledWith("/profile"));
    expect(api.patches).toEqual([{ displayName: "Aman Durdy" }]);

    view.rerender(<ToastProvider><ProfileScreen /></ToastProvider>);
    expect(await view.findByText("Aman Durdy")).toBeTruthy();
    const notice = view.getByText("Name saved");
    expect(notice.props.accessibilityRole).toBe("alert");
    expect(view.queryByRole("button", { name: "Name saved" })).toBeNull();

    view.rerender(<ToastProvider><CabinetScreen /></ToastProvider>);
    expect(await view.findByRole("button", { name: `Aman Durdy, ${PHONE}` })).toBeTruthy();
  });

  it("clears Name saved from Profile by itself", async () => {
    const view = render(<ProfileScreen />);
    await view.findByRole("button", { name: "Edit name" });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      act(() => profileNoticeStore.getState().show({ kind: "nameSaved" }));
      expect(view.getByText("Name saved")).toBeTruthy();
      act(() => { vi.advanceTimersByTime(4000); });
      expect(view.queryByText("Name saved")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows Saving... with a spinner, and locks the field and the button while saving", async () => {
    api.next = ["hold"];
    const view = await openEditor();
    type(view, "Aman");
    await act(async () => { fireEvent.press(save(view)); });
    const button = await view.findByRole("button", { name: "Saving..." });
    expect(isDisabled(button)).toBe(true);
    expect(view.UNSAFE_queryAllByType("ActivityIndicator" as never)).toHaveLength(1);
    expect(field(view).props.editable).toBe(false);
    await act(async () => { api.release?.(); });
  });

  it("keeps the text after a failed save and sends the same name again from Retry", async () => {
    api.next = ["fail"];
    const view = await openEditor();
    type(view, "Aman");
    await act(async () => { fireEvent.press(save(view)); });
    expect(await view.findByText("Couldn't save the name. Try again.")).toBeTruthy();
    expect(view.getByDisplayValue("Aman")).toBeTruthy();
    expect(routerMock.dismissTo).not.toHaveBeenCalled();

    await act(async () => { fireEvent.press(view.getByRole("button", { name: "Retry" })); });
    await vi.waitFor(() => expect(routerMock.dismissTo).toHaveBeenCalledWith("/profile"));
    expect(api.patches).toEqual([{ displayName: "Aman" }, { displayName: "Aman" }]);
  });

  it("uses the app's offline sentence when there is no connection", async () => {
    api.next = ["offline"];
    const view = await openEditor();
    type(view, "Aman");
    await act(async () => { fireEvent.press(save(view)); });
    expect(await view.findByText("No internet connection. Try again when you are online.")).toBeTruthy();
    expect(view.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(view.getByDisplayValue("Aman")).toBeTruthy();
  });

  it("shows the matching rule error when the server refuses the name", async () => {
    api.next = [{ reason: "too_long" }];
    const view = await openEditor();
    type(view, "Aman");
    await act(async () => { fireEvent.press(save(view)); });
    expect(await view.findByText("Use 30 characters or fewer.")).toBeTruthy();
    expect(view.queryByText("Couldn't save the name. Try again.")).toBeNull();
  });
});

describe("Leaving the editor", () => {
  it("goes back without a question and changes nothing", async () => {
    const view = await openEditor();
    type(view, "Aman");
    fireEvent.press(view.getByRole("button", { name: "Back" }));
    expect(routerMock.back).toHaveBeenCalled();
    expect(view.queryByRole("alertdialog")).toBeNull();
    expect(api.patches).toEqual([]);
  });

  it("lets a save in flight land after the User left, and Profile shows the new name", async () => {
    api.next = ["hold"];
    const view = await openEditor();
    type(view, "Aman");
    await act(async () => { fireEvent.press(save(view)); });
    await vi.waitFor(() => expect(api.release).not.toBeNull());

    view.rerender(<ToastProvider><ProfileScreen /></ToastProvider>);
    expect(await view.findByText("Driver 4821")).toBeTruthy();
    await act(async () => { api.release?.(); });

    expect(await view.findByText("Aman")).toBeTruthy();
    expect(view.queryByText("Driver 4821")).toBeNull();
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
  });
});

describe("Accessibility", () => {
  it("gives the back button and Save at least 44 points", async () => {
    const view = await openEditor();
    expect(classOf(view.getByRole("button", { name: "Back" }))).toContain("h-11 w-11");
    expect(classOf(save(view))).toMatch(/\bh-control-(md|lg)\b/);
  });
});
