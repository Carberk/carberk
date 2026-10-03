import { WizardSchemas } from "@auto-tm/contracts";
import { createInstance, type TFunction } from "i18next";
import { describe, expect, it, beforeAll } from "vitest";

import { locales, resources } from "../../i18n/resources";

import { translateWizardError, translateWizardFieldErrors } from "./wizardErrors";

/** Every step, paired with a payload that fails it. */
const INVALID_PAYLOADS: [WizardSchemas.WizardStep, unknown][] = [
  ["vehicle", { vin: "x".repeat(18) }],
  ["photos", {}],
  ["vehicle", {}],
  ["specs", {}],
  ["specs", { condition: "used" }],
  ["specs", { condition: "new", conditionDisclosure: { damaged: true } }],
  ["price", {}],
  ["price", { priceAmount: -1, priceCurrency: "TMT" }],
  ["location", {}],
  ["location", { description: "x".repeat(2001), regionId: "no", cityId: "no", locationText: "x".repeat(201) }],
  ["contact", {}],
  ["contact", { allowCalls: false, allowChat: false }],
];

function collectEmittedKeys(): string[] {
  const keys = new Set<string>();
  for (const [step, payload] of INVALID_PAYLOADS) {
    const result = WizardSchemas.validateStep(step, payload as never);
    result.errors.forEach((message) => keys.add(message));
    Object.values(result.fieldErrors).forEach((message) => keys.add(message));
  }
  return [...keys];
}

const tByLocale = new Map<string, TFunction>();

function translator(locale: string): TFunction {
  const t = tByLocale.get(locale);
  if (!t) throw new Error(`No i18n instance initialised for ${locale}`);
  return t;
}

beforeAll(async () => {
  for (const locale of locales) {
    const instance = createInstance();
    await instance.init({
      resources,
      lng: locale,
      // No fallback: a missing Turkmen key must fail here, not silently
      // resolve to Russian the way the running app would.
      fallbackLng: false,
      ns: ["common"],
      defaultNS: "common",
      interpolation: { escapeValue: false },
    });
    tByLocale.set(locale, instance.t);
  }
});

/** Every key the contract declares, including the publish-gate blockers. */
const DECLARED_KEYS: string[] = Object.values(WizardSchemas.WIZARD_ERROR_KEYS);

describe("wizard validation messages", () => {
  it.each(INVALID_PAYLOADS)("emits a key for an invalid %s step", (step, payload) => {
    const result = WizardSchemas.validateStep(step, payload as never);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("declares every key the step schemas actually emit", () => {
    expect(
      collectEmittedKeys().filter((key) => !DECLARED_KEYS.includes(key)),
    ).toEqual([]);
  });

  it.each(locales)("translates every declared key in %s", (locale) => {
    const t = translator(locale);

    for (const key of DECLARED_KEYS) {
      const translated = translateWizardError(t, key);

      expect(translated, `${key} is missing from ${locale}`).not.toBe(key);
      expect(translated.trim()).not.toBe("");
      // An unresolved {{placeholder}} means the limit was never interpolated.
      expect(translated, `${key} has an unfilled placeholder in ${locale}`)
        .not.toMatch(/\{\{/);
    }
  });

  it.each([
    ["en", "A new car can't be damaged. Choose Used."],
    ["ru", "Новый автомобиль не может быть битым. Выберите «Б/у»."],
    ["tk", "Täze awtoulag zeperli bolup bilmez. «Ulanylan» saýlaň."],
  ])("explains in %s that a New car cannot be damaged", (locale, text) => {
    expect(translateWizardError(translator(locale), "wizardErrors.damagedNotForNew")).toBe(text);
  });

  it("interpolates the limits from the contract", () => {
    const t = translator("en");

    expect(translateWizardError(t, "wizardErrors.vinTooLong")).toContain(
      String(WizardSchemas.WIZARD_LIMITS.vinMaxLength),
    );
    expect(translateWizardError(t, "wizardErrors.descriptionTooLong")).toContain(
      String(WizardSchemas.WIZARD_LIMITS.descriptionMaxLength),
    );
    expect(translateWizardError(t, "wizardErrors.yearTooLate")).toContain(
      String(WizardSchemas.WIZARD_LIMITS.yearMax),
    );
  });

  it("passes non-wizard messages through untouched", () => {
    const t = translator("ru");
    const serverMessage = "Не удалось сохранить черновик";

    expect(translateWizardError(t, serverMessage)).toBe(serverMessage);
    expect(translateWizardError(t, undefined)).toBeUndefined();
  });

  it("translates a whole field-error map", () => {
    const t = translator("en");
    const translated = translateWizardFieldErrors(t, {
      brandId: "wizardErrors.brandRequired",
      priceAmount: "wizardErrors.priceRequired",
    });

    expect(translated).toEqual({
      brandId: "Brand is required",
      priceAmount: "Price is required",
    });
  });
});
