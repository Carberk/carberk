import type * as Native from "react-native";
import * as RN from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act, fireEvent, renderMobile, routerMock, screenFocus } from "../render";
import LanguagePickerScreen from "../../app/(onboarding)/language";
import ValuePropScreen from "../../app/(onboarding)/value-prop";
import { localeStore } from "../../src/locale/localeStore";
import { HOME_HREF } from "../../src/navigation/homeHref";

import { useReduceMotion } from "@/lib/motion";

const FLAG = "@auto-tm/onboarding-completed";
const PAGE_WIDTH = 390;

const device = vi.hoisted(() => ({ width: 390, height: 844, fontScale: 1 }));
const insets = vi.hoisted(() => ({ top: 0, right: 0, bottom: 0, left: 0 }));

vi.mock("react-native", async (original) => ({
  ...await original<typeof Native>(),
  useWindowDimensions: () => ({ ...device, scale: 3 }),
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => insets }));

const native = RN as unknown as {
  pressHardwareBack: () => boolean;
  scrollRequests: { method: string; x?: number; animated?: boolean }[];
  AccessibilityInfo: { announcements: string[]; sendAccessibilityEvent?: (node: unknown, event: string) => void };
};
const announcements = (RN.AccessibilityInfo as unknown as { announcements: string[] }).announcements;

const COPY = {
  en: {
    back: "Back", skip: "Skip", next: "Next", finish: "Browse listings", continue: "Continue",
    find: "Find a car by make and model", chat: "Write to the seller directly",
    page1: "Page 1 of 2", page2: "Page 2 of 2", language: "Language", choose: "Choose language",
  },
  ru: {
    back: "Назад", skip: "Пропустить", next: "Далее", finish: "Смотреть объявления", continue: "Продолжить",
    find: "Найдите машину по марке и модели", chat: "Пишите продавцу напрямую",
    page1: "Страница 1 из 2", page2: "Страница 2 из 2", language: "Язык", choose: "Выберите язык",
  },
  tk: {
    back: "Yza", skip: "Geç", next: "Indiki", finish: "Bildirişlere seret", continue: "Dowam et",
    find: "Awtoulagy marka we model boýunça tapyň", chat: "Satyja göni ýazyň",
    page1: "Sahypa 1 / 2", page2: "Sahypa 2 / 2", language: "Dil", choose: "Dil saýlaň",
  },
} as const;
const LOCALES = ["en", "ru", "tk"] as const;
/** The pictures and the page out of view are hidden from screen readers; these queries still reach them. */
const HIDDEN = { includeHiddenElements: true } as const;

beforeEach(() => {
  Object.assign(device, { width: 390, height: 844, fontScale: 1 });
  Object.assign(insets, { top: 0, right: 0, bottom: 0, left: 0 });
  localeStore.setState({ locale: null });
  announcements.length = 0;
  vi.mocked(AsyncStorage.setItem).mockClear();
  vi.mocked(SplashScreen.hide).mockClear();
  vi.mocked(useReduceMotion).mockReturnValue(false);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Onboarding pager", () => {
  it("opens on Find with Skip, Next and the first of two pages", () => {
    const screen = renderMobile(<ValuePropScreen />);

    expect(screen.getByRole("header", { name: COPY.en.find })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
    expect(screen.getByLabelText("Page 1 of 2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Browse listings" })).toBeNull();
    expect(screen.getByTestId("onboarding-illustration-find", HIDDEN)).toBeTruthy();
    expect(screen.getByTestId("onboarding-illustration-chat", HIDDEN)).toBeTruthy();
  });

  it("has no Sell page: Chat is the last one", () => {
    const screen = renderMobile(<ValuePropScreen />);

    expect(screen.getAllByRole("header", HIDDEN)).toHaveLength(2);
    expect(screen.queryByText(/free/i)).toBeNull();
  });

  it("moves to Chat on Next: the final button replaces Next and Skip goes away", () => {
    const screen = renderMobile(<ValuePropScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Next" }));

    expect(native.scrollRequests).toEqual([{ method: "scrollTo", x: PAGE_WIDTH, animated: true }]);
    expect(screen.getByRole("button", { name: "Browse listings" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    expect(screen.getByLabelText("Page 2 of 2")).toBeTruthy();
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
  });

  it("reads out only the page in view", () => {
    const screen = renderMobile(<ValuePropScreen />);

    expect(screen.getByText(COPY.en.find)).toBeTruthy();
    expect(screen.queryByText(COPY.en.chat)).toBeNull();
    expect(screen.getByText(COPY.en.chat, HIDDEN)).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByText(COPY.en.find)).toBeNull();
    expect(screen.getByText(COPY.en.chat)).toBeTruthy();
  });

  it("moves accessibility focus to the new page's title only after the page is unhidden", () => {
    // Recorded at call time: with the focus request in the same tick as the
    // page change, the new page is still hidden from the accessibility tree.
    const targetVisibleAtCall: boolean[] = [];
    const holder: { current: ReturnType<typeof renderMobile> | null } = { current: null };
    const focus = vi.fn((_node: unknown, _event: string) => {
      targetVisibleAtCall.push(holder.current?.queryByText(COPY.en.chat) !== null);
    });
    native.AccessibilityInfo.sendAccessibilityEvent = focus;
    vi.mocked(useReduceMotion).mockReturnValue(true);
    // Host refs are null in the test renderer unless it gets a node mock.
    holder.current = renderMobile(<ValuePropScreen />, {
      createNodeMock: (element) => {
        const { type, props } = element as { type: unknown; props: Record<string, unknown> };
        return type === "Text" ? { props } : {};
      },
    });
    const screen = holder.current;

    // Mounting the first page announces nothing; the screen reader lands there itself.
    expect(focus).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole("button", { name: "Next" }));

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.calls[0]?.[1]).toBe("focus");
    expect((focus.mock.calls[0]?.[0] as { props: Record<string, unknown> }).props.children)
      .toBe(COPY.en.chat);
    expect(targetVisibleAtCall).toEqual([true]);

    fireEvent.press(screen.getByRole("button", { name: "Back" }));

    expect(focus).toHaveBeenCalledTimes(2);
    expect((focus.mock.calls[1]?.[0] as { props: Record<string, unknown> }).props.children)
      .toBe(COPY.en.find);
  });

  it("follows a swipe to Chat and back to Find", () => {
    const screen = renderMobile(<ValuePropScreen />);
    const pager = screen.getByTestId("onboarding-pager");

    fireEvent(pager, "momentumScrollEnd", { nativeEvent: { contentOffset: { x: PAGE_WIDTH } } });
    expect(screen.getByRole("button", { name: "Browse listings" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();

    fireEvent(pager, "momentumScrollEnd", { nativeEvent: { contentOffset: { x: 0 } } });
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    // A swipe past the last page ends on the last page and does not leave onboarding.
    fireEvent(pager, "momentumScrollEnd", { nativeEvent: { contentOffset: { x: PAGE_WIDTH * 3 } } });
    expect(screen.getByLabelText("Page 2 of 2")).toBeTruthy();
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
  });

  it("ignores a second tap while the pages are still sliding, so a double tap on Next does not finish", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const screen = renderMobile(<ValuePropScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Next" }));
    now.mockReturnValue(1_100);
    fireEvent.press(screen.getByRole("button", { name: "Browse listings" }));
    expect(routerMock.dismissTo).not.toHaveBeenCalled();

    now.mockReturnValue(2_000);
    fireEvent.press(screen.getByRole("button", { name: "Browse listings" }));
    expect(routerMock.dismissTo).toHaveBeenCalledWith(HOME_HREF);
  });

  it("jumps between pages without animation when Reduce Motion is on", () => {
    vi.mocked(useReduceMotion).mockReturnValue(true);
    const screen = renderMobile(<ValuePropScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Next" }));

    expect(native.scrollRequests).toEqual([{ method: "scrollTo", x: PAGE_WIDTH, animated: false }]);
    // Nothing is sliding, so the final button works at once.
    fireEvent.press(screen.getByRole("button", { name: "Browse listings" }));
    expect(routerMock.dismissTo).toHaveBeenCalledWith(HOME_HREF);
  });
});

describe("Leaving onboarding", () => {
  it("Skip stores the flag and takes onboarding off the stack above Home, once", () => {
    const screen = renderMobile(<ValuePropScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Skip" }));
    fireEvent.press(screen.getByRole("button", { name: "Skip" }));

    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(FLAG, "true");
    expect(routerMock.dismissTo).toHaveBeenCalledTimes(1);
    expect(routerMock.dismissTo).toHaveBeenCalledWith(HOME_HREF);
    // `replace` would leave a second Home under the first; `push` would keep onboarding in history.
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("the final button on Chat does the same as Skip", () => {
    const screen = renderMobile(<ValuePropScreen />);
    fireEvent(screen.getByTestId("onboarding-pager"), "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: PAGE_WIDTH } },
    });

    fireEvent.press(screen.getByRole("button", { name: "Browse listings" }));

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(FLAG, "true");
    expect(routerMock.dismissTo).toHaveBeenCalledWith(HOME_HREF);
  });

  it("still goes Home when the flag cannot be stored", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("disk full"));
    const screen = renderMobile(<ValuePropScreen />);

    await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Skip" })); });

    expect(routerMock.dismissTo).toHaveBeenCalledWith(HOME_HREF);
  });
});

describe("Onboarding Back", () => {
  it("the header Back returns from Chat to Find, then from Find to Language", () => {
    vi.mocked(useReduceMotion).mockReturnValue(true);
    const screen = renderMobile(<ValuePropScreen />);
    fireEvent.press(screen.getByRole("button", { name: "Next" }));

    fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
    expect(native.scrollRequests.at(-1)).toMatchObject({ method: "scrollTo", x: 0 });
    expect(routerMock.back).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(routerMock.back).toHaveBeenCalledTimes(1);
  });

  it("Android Back does the same, and never skips onboarding", () => {
    vi.mocked(useReduceMotion).mockReturnValue(true);
    const screen = renderMobile(<ValuePropScreen />);
    fireEvent.press(screen.getByRole("button", { name: "Next" }));

    let handled = false;
    act(() => { handled = native.pressHardwareBack(); });
    expect(handled).toBe(true);
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();

    act(() => { native.pressHardwareBack(); });
    expect(routerMock.back).toHaveBeenCalledTimes(1);
    expect(routerMock.dismissTo).not.toHaveBeenCalled();
  });

  it("on Language, Android Back leaves the app instead of dropping to Home underneath", () => {
    const exitApp = vi.spyOn(RN.BackHandler, "exitApp");
    renderMobile(<LanguagePickerScreen />);

    let handled = false;
    act(() => { handled = native.pressHardwareBack(); });

    expect(handled).toBe(true);
    expect(exitApp).toHaveBeenCalledTimes(1);
    expect(routerMock.back).not.toHaveBeenCalled();
  });

  it("Language leaves Android Back alone while another screen covers it", () => {
    screenFocus.focused = false;
    renderMobile(<LanguagePickerScreen />);

    expect(native.pressHardwareBack()).toBe(false);
  });
});

describe("Language choice", () => {
  it("lists the three languages by their own names, with Russian chosen until one is picked", () => {
    const screen = renderMobile(<LanguagePickerScreen />);

    expect(screen.getAllByRole("radio").map((row) => row.props.accessibilityLabel as string))
      .toEqual(["Türkmençe", "Русский", "English"]);
    expect(screen.getByRole("radio", { name: "Русский", checked: true })).toBeTruthy();
    expect(screen.getAllByRole("radio", { checked: false })).toHaveLength(2);
    expect(screen.getByTestId("onboarding-illustration-language-ru", HIDDEN)).toBeTruthy();
  });

  it("stores the choice, moves the check, switches the picture and says the language", () => {
    const screen = renderMobile(<LanguagePickerScreen />);

    fireEvent.press(screen.getByRole("radio", { name: "Türkmençe" }));

    expect(localeStore.getState().locale).toBe("tk");
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("@auto-tm/locale", "tk");
    expect(screen.getByRole("radio", { name: "Türkmençe", checked: true })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Русский", checked: false })).toBeTruthy();
    expect(screen.getByTestId("onboarding-illustration-language-tk", HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId("onboarding-illustration-language-ru", HIDDEN)).toBeNull();
    expect(announcements).toEqual(["Türkmençe"]);
  });

  it("does nothing when the chosen row is tapped again", () => {
    const screen = renderMobile(<LanguagePickerScreen />);

    fireEvent.press(screen.getByRole("radio", { name: "Русский" }));

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(announcements).toEqual([]);
  });

  it("changes the whole screen to the chosen language at once", async () => {
    const screen = renderMobile(<LanguagePickerScreen />, { locale: "ru" });
    // The app keeps i18next in step with the store (`initI18n`); the test wires the same link.
    const unsubscribe = localeStore.subscribe((state) => {
      if (state.locale) void screen.i18n.changeLanguage(state.locale);
    });
    expect(screen.getByText(COPY.ru.choose)).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByRole("radio", { name: "English" })); });
    expect(screen.getByText(COPY.en.choose)).toBeTruthy();
    expect(screen.getByRole("button", { name: COPY.en.continue })).toBeTruthy();

    await act(async () => { fireEvent.press(screen.getByRole("radio", { name: "Türkmençe" })); });
    expect(screen.getByText(COPY.tk.choose)).toBeTruthy();
    expect(screen.getByRole("button", { name: COPY.tk.continue })).toBeTruthy();
    unsubscribe();
  });

  it("Continue stores the preselected language when nothing was tapped, then opens the pager", () => {
    const screen = renderMobile(<LanguagePickerScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(routerMock.push).toHaveBeenCalledWith("/(onboarding)/value-prop");
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("@auto-tm/locale", "ru");
    // Continue moves on; it does not end onboarding.
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith("@auto-tm/onboarding-completed", "true");
  });

  it("Continue does not rewrite a language that was already stored", () => {
    localeStore.setState({ locale: "tk" });
    const screen = renderMobile(<LanguagePickerScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(routerMock.push).toHaveBeenCalledWith("/(onboarding)/value-prop");
  });

  it("does not release native before the entrance owns its layout handoff", () => {
    renderMobile(<LanguagePickerScreen />);

    expect(SplashScreen.hide).not.toHaveBeenCalled();
  });
});

describe("Onboarding in three languages", () => {
  it.each(LOCALES)("labels every control and page in %s", (locale) => {
    const copy = COPY[locale];
    const pager = renderMobile(<ValuePropScreen />, { locale });

    expect(pager.getByRole("button", { name: copy.back })).toBeTruthy();
    expect(pager.getByRole("button", { name: copy.skip })).toBeTruthy();
    expect(pager.getByRole("button", { name: copy.next })).toBeTruthy();
    expect(pager.getByRole("header", { name: copy.find })).toBeTruthy();
    expect(pager.getByLabelText(copy.page1)).toBeTruthy();

    fireEvent(pager.getByTestId("onboarding-pager"), "momentumScrollEnd", {
      nativeEvent: { contentOffset: { x: PAGE_WIDTH } },
    });
    expect(pager.getByRole("button", { name: copy.finish })).toBeTruthy();
    expect(pager.getByLabelText(copy.page2)).toBeTruthy();
    expect(pager.getByText(copy.chat)).toBeTruthy();
    pager.unmount();

    const language = renderMobile(<LanguagePickerScreen />, { locale });
    expect(language.getByLabelText(copy.language).props.accessibilityRole).toBe("radiogroup");
    expect(language.getByRole("header", { name: copy.choose })).toBeTruthy();
    expect(language.getByRole("button", { name: copy.continue })).toBeTruthy();
    expect(language.getByLabelText("Carberk")).toBeTruthy();
  });
});

describe("Large text and small windows", () => {
  it("keeps the picture at font scale 1.2 on a 360 x 640 phone with 3-button navigation", () => {
    Object.assign(device, { width: 360, height: 640, fontScale: 1.2 });
    Object.assign(insets, { top: 24, bottom: 48 });
    const screen = renderMobile(<ValuePropScreen />);

    expect(screen.getByTestId("onboarding-illustration-find", HIDDEN)).toBeTruthy();
  });

  it.each([
    ["font scale 1.3", { width: 360, height: 780, fontScale: 1.3 }, { top: 24, bottom: 24 }],
    ["a usable height under 520", { width: 640, height: 360, fontScale: 1 }, { top: 24, bottom: 0 }],
  ])("drops the pictures at %s and keeps every word and control", (_name, window, safeArea) => {
    Object.assign(device, window);
    Object.assign(insets, safeArea);
    const pager = renderMobile(<ValuePropScreen />);

    expect(pager.queryByTestId("onboarding-illustration-find", HIDDEN)).toBeNull();
    expect(pager.queryByTestId("onboarding-illustration-chat", HIDDEN)).toBeNull();
    expect(pager.getByText(COPY.en.find)).toBeTruthy();
    expect(pager.getByText(/You don't need an account to look\./)).toBeTruthy();
    expect(pager.getByRole("button", { name: "Next" })).toBeTruthy();
    expect(pager.getByRole("button", { name: "Skip" })).toBeTruthy();
    pager.unmount();

    const language = renderMobile(<LanguagePickerScreen />);
    expect(language.queryByTestId("onboarding-illustration-language-ru", HIDDEN)).toBeNull();
    expect(language.getAllByRole("radio")).toHaveLength(3);
    expect(language.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("puts the text of each page and of Language in a scroll view, so large text scrolls instead of clipping", () => {
    Object.assign(device, { width: 360, height: 640, fontScale: 1.3 });
    const scrolls = (node: { type: unknown; parent: unknown } | null) => {
      for (let current = node; current; current = current.parent as typeof node) {
        if (current.type === "RCTScrollView") return true;
      }
      return false;
    };

    const language = renderMobile(<LanguagePickerScreen />);
    expect(scrolls(language.getByText("Choose language"))).toBe(true);
    expect(scrolls(language.getByRole("radio", { name: "English" }))).toBe(true);
    // The button stays pinned under the scrolling text.
    expect(scrolls(language.getByRole("button", { name: "Continue" }))).toBe(false);
  });

  it("caps the page width at 480 on a tablet", () => {
    Object.assign(device, { width: 800, height: 1200, fontScale: 1 });
    const screen = renderMobile(<ValuePropScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Next" }));

    expect(native.scrollRequests).toEqual([{ method: "scrollTo", x: 480, animated: true }]);
  });
});
