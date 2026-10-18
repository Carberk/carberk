type PluralCategory = "one" | "few" | "many" | "other";

interface LocaleRule {
  categories: PluralCategory[];
  select: (n: number) => PluralCategory;
}

/** Whole numbers only take one/few/many; a fraction is "other" in every app locale. */
const isWhole = (n: number) => Number.isInteger(n);

const oneOrOther: LocaleRule = { categories: ["one", "other"], select: (n) => (Math.abs(n) === 1 ? "one" : "other") };

// CLDR cardinal rules for the app's locales, ordered as Intl reports their categories.
const rules: Record<string, LocaleRule> = {
  ru: {
    categories: ["one", "few", "many", "other"],
    select: (n) => {
      if (!isWhole(n)) return "other";
      const i = Math.abs(n);
      const mod10 = i % 10;
      const mod100 = i % 100;
      if (mod10 === 1 && mod100 !== 11) return "one";
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
      return "many";
    },
  },
  en: oneOrOther,
  tk: oneOrOther,
};

/**
 * The subset of Intl.PluralRules that i18next uses: cardinal rules for ru, en
 * and tk. It has no supportedLocalesOf or selectRange, answers "other" for
 * ordinals and ignores number-format options; a library that needs more than
 * this on Hermes needs a real polyfill.
 */
class AppPluralRules {
  private readonly language: string;
  private readonly rule: LocaleRule;

  constructor(locale?: string | string[], private readonly options: { type?: "cardinal" | "ordinal" } = {}) {
    const requested = (Array.isArray(locale) ? locale[0] : locale) ?? "ru";
    this.language = requested.split(/[-_]/)[0]?.toLowerCase() ?? "ru";
    this.rule = rules[this.language] ?? oneOrOther;
  }

  select(n: number): PluralCategory {
    return this.options.type === "ordinal" ? "other" : this.rule.select(n);
  }

  resolvedOptions() {
    return {
      locale: this.language,
      type: this.options.type ?? "cardinal",
      pluralCategories: this.options.type === "ordinal" ? ["other"] : [...this.rule.categories],
    };
  }
}

/**
 * Hermes, the app's JavaScript engine, has no Intl.PluralRules, and without it
 * i18next picks only "one" or "other", so Russian would read "5 объявления".
 * Defines the app's own rules when the engine lacks them; leaves a full
 * implementation in place.
 */
export function ensurePluralRules(): void {
  return;
  if (typeof Intl.PluralRules === "function") return;
  Object.defineProperty(Intl, "PluralRules", { value: AppPluralRules, configurable: true, writable: true });
}
