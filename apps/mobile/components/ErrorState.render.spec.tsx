import { describe, expect, it, vi } from "vitest";

import { renderMobile } from "../test/render";

import { ErrorState } from "./ErrorState";

describe("ErrorState fallback copy", () => {
  it.each([
    ["en", "Something went wrong", "This didn't load. Try again in a moment.", "Retry"],
    ["ru", "Что-то пошло не так", "Не удалось загрузить. Попробуйте чуть позже.", "Повторить"],
    ["tk", "Bir zat ýalňyş boldy", "Ýükläp bolmady. Biraz soňrak synanyşyň.", "Täzeden synanyş"],
  ])("in %s says what happened in its own words, apart from the retry button", async (locale, title, description, retry) => {
    const screen = await renderMobile(<ErrorState error={new Error("boom")} onRetry={vi.fn()} />, { locale });

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(description)).toBeTruthy();
    expect(screen.getAllByText(retry)).toHaveLength(1);
  });
});
