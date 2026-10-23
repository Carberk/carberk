import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";

import { resources } from "./resources";

function translator(locale: string) {
  const i18n = createInstance();
  void i18n.init({ lng: locale, resources, defaultNS: "common", initImmediate: false });
  return (count: number) => i18n.t("showResultsCount", { count });
}

// Show N is the Search parameters and Model picker button. Each locale must
// agree the noun with the number the way its plural rules require.
describe("showResultsCount", () => {
  it.each([
    [0, "Show 0 listings"],
    [1, "Show 1 listing"],
    [2, "Show 2 listings"],
    [21, "Show 21 listings"],
  ])("in English reads %i as %s", (count, expected) => {
    expect(translator("en")(count)).toBe(expected);
  });

  it.each([
    [0, "Показать 0 объявлений"],
    [1, "Показать 1 объявление"],
    [2, "Показать 2 объявления"],
    [4, "Показать 4 объявления"],
    [5, "Показать 5 объявлений"],
    [11, "Показать 11 объявлений"],
    [12, "Показать 12 объявлений"],
    [21, "Показать 21 объявление"],
    [22, "Показать 22 объявления"],
    [111, "Показать 111 объявлений"],
  ])("in Russian reads %i as %s", (count, expected) => {
    expect(translator("ru")(count)).toBe(expected);
  });

  // Turkmen keeps the noun singular after a numeral, so every count reads alike.
  it.each([
    [0, "0 bildirişi görkez"],
    [1, "1 bildirişi görkez"],
    [5, "5 bildirişi görkez"],
  ])("in Turkmen reads %i as %s", (count, expected) => {
    expect(translator("tk")(count)).toBe(expected);
  });
});
