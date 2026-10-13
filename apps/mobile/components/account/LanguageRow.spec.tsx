import { beforeEach, describe, expect, it, vi } from "vitest";

import { localeStore } from "../../src/locale/localeStore";
import { fireEvent, renderMobile } from "../../test/render";

import { LanguageRow } from "./LanguageRow";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined) },
}));

beforeEach(() => localeStore.setState({ locale: "ru" }));

describe("LanguageRow", () => {
  it.each([["en", "English"], ["ru", "Русский"], ["tk", "Türkmençe"]] as const)("shows %s by its own name", async (locale, name) => {
    localeStore.setState({ locale });
    const view = await renderMobile(<LanguageRow />);
    expect(view.getByText(name)).toBeTruthy();
  });

  it("makes the row at least 44 pt tall and reads as a button", async () => {
    const view = await renderMobile(<LanguageRow />);
    expect(String(view.getByRole("button", { name: "Language, Русский" }).props.className)).toContain("min-h-14");
  });

  it("opens a sheet with the three languages and marks the current one", async () => {
    const view = await renderMobile(<LanguageRow />);
    expect(view.queryAllByRole("radio")).toHaveLength(0);
    await fireEvent.press(view.getByRole("button", { name: "Language, Русский" }));
    expect(view.getAllByRole("radio").map((r) => r.props.accessibilityLabel)).toEqual(["English", "Русский", "Türkmençe"]);
    expect(view.getAllByRole("radio", { checked: true }).map((r) => r.props.accessibilityLabel)).toEqual(["Русский"]);
  });

  it("applies the picked language at once, closes the sheet and shows the new name", async () => {
    const view = await renderMobile(<LanguageRow />);
    await fireEvent.press(view.getByRole("button", { name: "Language, Русский" }));
    await fireEvent.press(view.getByRole("radio", { name: "Türkmençe" }));
    expect(localeStore.getState().locale).toBe("tk");
    expect(view.queryAllByRole("radio")).toHaveLength(0);
    expect(view.getByRole("button", { name: "Language, Türkmençe" })).toBeTruthy();
  });

  it("closes from the close button and leaves the language alone", async () => {
    const view = await renderMobile(<LanguageRow />);
    await fireEvent.press(view.getByRole("button", { name: "Language, Русский" }));
    await fireEvent.press(view.getByRole("button", { name: "Close" }));
    expect(view.queryAllByRole("radio")).toHaveLength(0);
    expect(localeStore.getState().locale).toBe("ru");
  });

  it.each([["ru", "Язык"], ["tk", "Dil"]])("reads in %s", async (locale, label) => {
    const view = await renderMobile(<LanguageRow />, { locale });
    await fireEvent.press(view.getByRole("button", { name: `${label}, Русский` }));
    expect(view.getAllByText(label).length).toBeGreaterThan(1);
    expect(view.getAllByRole("radio")).toHaveLength(3);
  });
});
