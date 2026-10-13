import { describe, expect, it, vi } from "vitest";

import { renderMobile, fireEvent } from "../../../test/render";

import { FilterChipsRow } from "./FilterChipsRow";

describe("Results filter chips", () => {
  it("counts complete city/price/year groups, excluding brand/models/condition/sort", async () => {
    const onRemove = vi.fn(); const onOpen = vi.fn();
    const view = await renderMobile(<FilterChipsRow filters={{ brandId: "toyota", modelIds: ["camry"], condition: "new", sort: "price_asc", cityId: "ashgabat", priceMin: 70000, priceMax: 120000, yearMin: 2018, yearMax: 2020 }} cityName="Ashgabat" onRemove={onRemove} onOpen={onOpen} />);
    expect(view.getByLabelText("Filters: 3")).toBeTruthy();
    expect(view.getByText("70,000 – 120,000 TMT")).toBeTruthy(); expect(view.getByText("2018 – 2020")).toBeTruthy();
    for (const group of ["city", "price", "year"]) await fireEvent.press(view.getByLabelText(`Remove ${group} filter`));
    expect(onRemove.mock.calls.map(([group]) => group)).toEqual(["city", "price", "year"]);
    await fireEvent.press(view.getByLabelText("Filters: 3")); expect(onOpen).toHaveBeenCalledOnce();
  });
  it("shows one-sided ranges and no model chips", async () => {
    const view = await renderMobile(<FilterChipsRow filters={{ priceMax: 120000, yearMin: 2018, modelIds: ["camry", "corolla"] }} onRemove={vi.fn()} onOpen={vi.fn()} />);
    expect(view.getByText("up to 120,000 TMT")).toBeTruthy(); expect(view.getByText("from 2018")).toBeTruthy(); expect(view.queryByText("camry")).toBeNull();
  });
  it.each([["en", "Filters: 1"], ["ru", "Фильтры: 1"], ["tk", "Süzgüçler: 1"]])("names the count without plural-dependent words in %s", async (locale, label) => {
    const view = await renderMobile(<FilterChipsRow filters={{ cityId: "ashgabat" }} cityName="Ashgabat" onRemove={vi.fn()} onOpen={vi.fn()} />, { locale });
    expect(view.getByLabelText(label)).toBeTruthy();
  });
});
