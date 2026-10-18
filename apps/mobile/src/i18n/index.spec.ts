import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined) } }));
vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "ru" }] }));

const nativePluralRules = Intl.PluralRules;

describe("initI18n on an engine without Intl.PluralRules", () => {
  afterEach(() => {
    Object.defineProperty(Intl, "PluralRules", { value: nativePluralRules, configurable: true, writable: true });
  });

  it("starts the app with Russian plural forms", async () => {
    // @ts-expect-error simulating Hermes, which does not define it
    delete Intl.PluralRules;
    const { initI18n } = await import("./index");

    const i18n = await initI18n("ru");

    expect(i18n.t("showResultsCount", { count: 5 })).toBe("Показать 5 объявлений");
    expect(i18n.t("showResultsCount", { count: 21 })).toBe("Показать 21 объявление");
    expect(i18n.t("showResultsCount", { count: 3 })).toBe("Показать 3 объявления");
  });
});
