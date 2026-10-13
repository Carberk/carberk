import { describe, expect, it, vi } from "vitest";

import { renderMobile, fireEvent, getHost } from "../../../test/render";

import { SortSheet } from "./SortSheet";

describe("Sort sheet", () => {
  it("offers exactly the six approved choices, selects the current one and closes on choice", async () => {
    const onChange = vi.fn(); const onOpenChange = vi.fn();
    const view = await renderMobile(<SortSheet open value="year_asc" onChange={onChange} onOpenChange={onOpenChange} />);
    const choices = view.getAllByRole("radio");
    expect(choices.map((choice) => choice.props.accessibilityLabel)).toEqual(["Newest first", "Cheapest first", "Most expensive first", "Newest year first", "Oldest year first", "Lowest mileage first"]);
    expect(view.getByRole("radio", { name: "Oldest year first" }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(view.getByRole("radio", { name: "Lowest mileage first" }));
    expect(onChange).toHaveBeenCalledWith("mileage_asc"); expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks the sheet to close on a tap outside (the shell mock passes the prop to a View)", async () => {
    const view = await renderMobile(<SortSheet open value="year_asc" onChange={vi.fn()} onOpenChange={vi.fn()} />);
    expect(getHost(view.container, "View", { closeOnBackdropPress: true })).toBeTruthy();
  });
});
