import { ListingsSchemas } from "@auto-tm/contracts";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../../test/msw";
import { renderMobile, fireEvent, routerMock } from "../../../test/render";

import { SearchParametersForm } from "./SearchParametersForm";

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const requests: Record<string, string>[] = [];

beforeEach(() => {
  requests.length = 0;
  server.use(
    http.get("*/catalog/brands", () => HttpResponse.json({ items: [], nextCursor: null, hasMore: false })),
    http.get("*/catalog/regions", () => HttpResponse.json({ items: [] })),
    http.get("*/listings/count", ({ request }) => {
      const query = Object.fromEntries(new URL(request.url).searchParams);
      requests.push(query);
      const parsed = ListingsSchemas.ListingCountQuerySchema.safeParse(query);
      return parsed.success
        ? HttpResponse.json({ totalMatching: 5, priceMinTmt: null, priceMaxTmt: null })
        : HttpResponse.json({ message: "Invalid filters" }, { status: 400 });
    }),
  );
});

describe("Search parameters: exact price filters", () => {
  for (const field of ["Min", "Max"] as const) {
    for (const typed of ["9999999999999999", "1234567890123456789012"]) {
      it(`caps ${field} input ${typed} to 15 exact digits in the field and applied filter`, async () => {
        const view = await renderMobile(<SearchParametersForm initial={{ sort: "newest" }} returnToResults onBack={vi.fn()} />);
        const expectedText = typed === "9999999999999999" ? "999,999,999,999,999" : "123,456,789,012,345";
        const expectedPrice = typed === "9999999999999999" ? "999999999999999" : "123456789012345";
        const key = field === "Min" ? "priceMin" : "priceMax";

        await fireEvent.changeText(view.getByPlaceholderText(field), typed);
        expect.soft(view.getByPlaceholderText(field).props.value).toBe(expectedText);
        await view.findByRole("button", { name: "Show 5 listings" });
        await fireEvent.press(view.getByRole("button", { name: "Show 5 listings" }));

        expect.soft(routerMock.dismissTo).toHaveBeenCalledWith({
          pathname: "/(tabs)/(search)/results",
          params: expect.objectContaining({ [key]: expectedPrice }),
        });
        expect(requests.some(query => query[key] === expectedPrice)).toBe(true);
        for (const query of requests) {
          expect(ListingsSchemas.ListingCountQuerySchema.safeParse(query).success).toBe(true);
        }
      });
    }
  }
});
