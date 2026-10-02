import { describe, expect, it } from "vitest";

import { locales, resources } from "../i18n/resources";

import { formatDeletionDate } from "./formatDeletionDate";

const SCHEDULED_AT = "2026-10-26T12:00:00.000Z";

describe("formatDeletionDate", () => {
  it("drops the period that Russian ends the date with", () => {
    expect(formatDeletionDate(SCHEDULED_AT, "ru")).toBe("26 октября 2026 г");
  });

  it("keeps the Russian period when the date sits mid-sentence", () => {
    expect(formatDeletionDate(SCHEDULED_AT, "ru", { midSentence: true })).toBe("26 октября 2026 г.");
  });

  it("leaves dates that do not end with a period alone", () => {
    expect(formatDeletionDate(SCHEDULED_AT, "en")).toBe("October 26, 2026");
  });

  it.each(locales)(
    "never renders a doubled period in the %s restore prompt",
    (locale) => {
      const account = resources[locale]?.["account"] as
        | Record<string, string>
        | undefined;
      const template = account?.["restoreAccountMessage"];
      expect(typeof template).toBe("string");

      const message = (template as string).replace(
        "{{date}}",
        formatDeletionDate(SCHEDULED_AT, locale),
      );

      expect(message).not.toMatch(/\.\./);
    },
  );
});
