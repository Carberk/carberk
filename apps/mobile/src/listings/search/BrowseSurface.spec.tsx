import { describe, expect, it, vi } from "vitest";

import { renderMobile, fireEvent } from "../../../test/render";

import { FilterChipsRow } from "./FilterChipsRow";

describe("Results filter entry", () => {
  it("opens Search parameters from the approved Filters control", async () => {
    const onOpen = vi.fn();
    const view = await renderMobile(<FilterChipsRow filters={{}} onOpen={onOpen} onRemove={vi.fn()} />);
    await fireEvent.press(view.getByRole("button", { name: "Filters: 0" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("shows the committed chip group count on the entry", async () => {
    const view = await renderMobile(<FilterChipsRow filters={{ cityId: "ashgabat", priceMin: 70000, priceMax: 120000 }} onOpen={vi.fn()} onRemove={vi.fn()} />);
    expect(view.getByRole("button", { name: "Filters: 2" })).toBeTruthy();
    expect(view.getByText("2")).toBeTruthy();
  });
});
