import { createInstance } from "i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ensurePluralRules } from "./pluralRules";
import { resources } from "./resources";

// Hermes, the app's JavaScript engine, has no Intl.PluralRules. Without it
// i18next falls back to "one when 1, otherwise other", which gives Russian
// "Показать 5 объявления". These tests remove it the way the device lacks it.
const nativePluralRules = Intl.PluralRules;

function translator(locale: string) {
  const i18n = createInstance();
  void i18n.init({ lng: locale, resources, defaultNS: "common", initImmediate: false });
  return (count: number) => i18n.t("showResultsCount", { count });
}

describe("ensurePluralRules without the engine's Intl.PluralRules", () => {
  beforeEach(() => {
    // @ts-expect-error simulating Hermes, which does not define it
    delete Intl.PluralRules;
    ensurePluralRules();
  });
  afterEach(() => {
    Object.defineProperty(Intl, "PluralRules", { value: nativePluralRules, configurable: true, writable: true });
  });

  it.each([
    [0, "Показать 0 объявлений"],
    [1, "Показать 1 объявление"],
    [3, "Показать 3 объявления"],
    [5, "Показать 5 объявлений"],
    [11, "Показать 11 объявлений"],
    [14, "Показать 14 объявлений"],
    [21, "Показать 21 объявление"],
    [22, "Показать 22 объявления"],
    [111, "Показать 111 объявлений"],
  ])("Russian reads %i as %s", (count, expected) => {
    expect(translator("ru")(count)).toBe(expected);
  });

  it.each([
    [0, "Show 0 listings"],
    [1, "Show 1 listing"],
    [7, "Show 7 listings"],
  ])("English reads %i as %s", (count, expected) => {
    expect(translator("en")(count)).toBe(expected);
  });

  it.each([[1, "1 bildirişi görkez"], [7, "7 bildirişi görkez"]])("Turkmen reads %i as %s", (count, expected) => {
    expect(translator("tk")(count)).toBe(expected);
  });

  const samples = [
    ...Array.from({ length: 201 }, (_, n) => n),
    -1, -2, -5, -11, -21, 0.5, 1.5, 2.5, 5.5, 21.5,
  ];

  it.each(["ru", "en", "tk", "ru-RU", "en-US"])("agrees with the full Intl rules for %s", (locale) => {
    const shim = new Intl.PluralRules(locale);
    const full = new nativePluralRules(locale);
    expect(shim.resolvedOptions().pluralCategories).toEqual(full.resolvedOptions().pluralCategories);
    for (const n of samples) expect([n, shim.select(n)]).toEqual([n, full.select(n)]);
  });
});

describe("ensurePluralRules with the engine's Intl.PluralRules", () => {
  it("leaves the engine's implementation in place", () => {
    ensurePluralRules();
    expect(Intl.PluralRules).toBe(nativePluralRules);
  });
});
