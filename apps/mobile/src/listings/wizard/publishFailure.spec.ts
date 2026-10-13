import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";

import { ApiError } from "../../api/client";
import { resources } from "../../i18n/resources";

import { publishFailureMessage, publishFailureOf } from "./publishFailure";

function translator(locale: string) {
  const i18n = createInstance();
  void i18n.init({ lng: locale, resources, defaultNS: "common", initImmediate: false });
  return i18n.t.bind(i18n);
}

describe("publishFailureOf (#588)", () => {
  it("is offline for a request that never reached the server", () => {
    expect(publishFailureOf(new ApiError("NETWORK_ERROR", 0, "Network request failed"))).toBe("offline");
    expect(publishFailureOf(new ApiError("NETWORK_ERROR", 0, "Request timed out"))).toBe("offline");
  });

  it("is rateMissing when the server has no exchange rate for the draft's currency", () => {
    expect(
      publishFailureOf(new ApiError("EXCHANGE_RATE_MISSING", 400, "Exchange rate from USD to TMT is not available")),
    ).toBe("rateMissing");
  });

  it("is photoUnavailable when the server answers UPLOAD_NOT_AVAILABLE for a photo (#735)", () => {
    expect(
      publishFailureOf(new ApiError("UPLOAD_NOT_AVAILABLE", 400, "A photo upload is no longer available")),
    ).toBe("photoUnavailable");
  });

  it("is photoUnavailable for a permanently unusable photo", () => {
    expect(publishFailureOf(new ApiError("UPLOAD_OBJECT_INVALID", 400, "Corrupt image", { key: "photo.webp" }))).toBe("photoUnavailable");
  });

  it("is server for every other refusal or error", () => {
    expect(publishFailureOf(new ApiError("INTERNAL_ERROR", 500))).toBe("server");
    expect(publishFailureOf(new ApiError("INVALID_DRAFT_PAYLOAD", 400, "Draft is missing required fields"))).toBe("server");
    expect(publishFailureOf(new Error("boom"))).toBe("server");
    expect(publishFailureOf(undefined)).toBe("server");
  });
});

describe("publishFailureMessage (#588)", () => {
  it.each([
    ["en", "server", "Could not publish. Your draft is saved. Try again."],
    ["en", "offline", "No internet. Your draft is saved. Publish when you are back online."],
    ["en", "rateMissing", "The USD rate is not available right now. Set the price in TMT or try later."],
    ["en", "photoUnavailable", "One photo is no longer available. Re-add it in the Photos step and try again."],
    ["ru", "server", "Не удалось опубликовать. Черновик сохранён. Попробуйте ещё раз."],
    ["ru", "offline", "Нет интернета. Черновик сохранён. Опубликуйте, когда появится связь."],
    ["ru", "rateMissing", "Курс USD сейчас недоступен. Укажите цену в TMT или попробуйте позже."],
    ["ru", "photoUnavailable", "Одна из фотографий больше недоступна. Добавьте её заново на шаге «Фото» и попробуйте ещё раз."],
    ["tk", "server", "Neşir edip bolmady. Garalama saklandy. Täzeden synanyşyň."],
    ["tk", "offline", "Internet ýok. Garalama saklandy. Baglanyşyk dikelende neşir ediň."],
    ["tk", "rateMissing", "USD kursy häzir elýeterli däl. Bahany TMT-de görkeziň ýa-da soňrak synanyşyň."],
    ["tk", "photoUnavailable", "Suratlaryňyzdan biri indi elýeterli däl. Ony «Surat» ädiminde täzeden goşuň we täzeden synanyşyň."],
  ] as const)("%s %s", (locale, failure, message) => {
    expect(publishFailureMessage(translator(locale), failure, "USD")).toBe(message);
  });

  it("names the draft's own currency, and never shows the server's text", () => {
    expect(publishFailureMessage(translator("en"), "rateMissing", "AED")).toBe(
      "The AED rate is not available right now. Set the price in TMT or try later.",
    );
    // With no failure recorded it reads as a server error, never as the server's text.
    expect(publishFailureMessage(translator("en"), null, "USD")).toBe(
      "Could not publish. Your draft is saved. Try again.",
    );
  });
});

// Installed publish envelopes keep INVALID_DRAFT_PAYLOAD and formErrors.
it("maps the new photo refusal and old installed envelope to the minimum helper", () => {
  for (const code of ["AT_LEAST_THREE_PHOTOS_REQUIRED", "AT_LEAST_ONE_PHOTO_REQUIRED"]) {
    expect(publishFailureOf(new ApiError("INVALID_DRAFT_PAYLOAD", 400, "Invalid", { formErrors: [code] }))).toBe("photos");
  }
});
