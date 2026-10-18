import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react-native";

import { renderMobile, fireEvent } from "../../../test/render";
import { server } from "../../../test/msw";

import { SearchParametersForm } from "./SearchParametersForm";

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined), removeItem: vi.fn(async () => undefined) },
}));

const catalogHandlers = [
  http.get("*/catalog/regions", () => HttpResponse.json({ items: [] })),
  http.get("*/catalog/brands", () => HttpResponse.json({ items: [] })),
];

describe("SearchParametersForm with the real count hook and MSW transport", () => {
  beforeEach(() => server.use(...catalogHandlers));
  afterEach(() => server.resetHandlers());

  it("renders Retry and then the localized count from real HTTP responses", async () => {
    let countCalls = 0;
    server.use(
      http.get("*/listings/count", () => {
        countCalls += 1;
        return countCalls === 1
          ? HttpResponse.json({ code: "UNAVAILABLE" }, { status: 503 })
          : HttpResponse.json({ totalMatching: 5, priceMinTmt: null, priceMaxTmt: null });
      }),
    );

    const view = await renderMobile(
      <SearchParametersForm initial={{ sort: "newest" }} returnToResults onBack={vi.fn()} />,
      { locale: "ru" },
    );

    await waitFor(() => expect(view.getByRole("button", { name: "Повторить" })).toBeTruthy());
    await fireEvent.press(view.getByRole("button", { name: "Повторить" }));
    await waitFor(() => expect(countCalls).toBe(2));
    await waitFor(() => expect(view.getByRole("button", { name: "Показать 5 объявлений" })).toBeTruthy(), { timeout: 3000 });
  });
});
