import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile, getHost } from "../../test/render";

import { OptionPickerSheet } from "./OptionPickerSheet";

type Value = "a" | "b" | "c";
const options: { value: Value; label: string }[] = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

async function renderSheet({ open = true, locale = "en" } = {}) {
  const onChange = vi.fn();
  const onOpenChange = vi.fn();
  const view = await renderMobile(
    <OptionPickerSheet<Value> open={open} title="Pick one" options={options} value="b" onChange={onChange} onOpenChange={onOpenChange} />,
    { locale },
  );
  return { view, onChange, onOpenChange };
}

describe("OptionPickerSheet", () => {
  it("shows the title and one radio per option, with only the current one checked", async () => {
    const { view } = await renderSheet();
    expect(view.getByText("Pick one")).toBeTruthy();
    expect(view.getAllByRole("radio")).toHaveLength(3);
    expect(view.getAllByRole("radio", { checked: true }).map((r) => r.props.accessibilityLabel)).toEqual(["Beta"]);
    expect(view.getAllByRole("radio", { checked: false }).map((r) => r.props.accessibilityLabel)).toEqual(["Alpha", "Gamma"]);
  });

  it("gives every option a touch target of at least 44 pt", async () => {
    const { view } = await renderSheet();
    for (const radio of view.getAllByRole("radio")) expect(String(radio.props.className)).toContain("min-h-14");
    expect(String(view.getByRole("button", { name: "Close" }).props.className)).toContain("h-11");
  });

  it("applies a choice at once and closes the sheet", async () => {
    const { view, onChange, onOpenChange } = await renderSheet();
    await fireEvent.press(view.getByRole("radio", { name: "Gamma" }));
    expect(onChange).toHaveBeenCalledWith("c");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes from the close button without changing anything", async () => {
    const { view, onChange, onOpenChange } = await renderSheet();
    await fireEvent.press(view.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders nothing while closed", async () => {
    const { view } = await renderSheet({ open: false });
    expect(view.queryByText("Pick one")).toBeNull();
    expect(view.queryAllByRole("radio")).toHaveLength(0);
  });

  it.each([["ru", "Закрыть"], ["tk", "Ýap"]])("labels the close button in %s", async (locale, label) => {
    const { view } = await renderSheet({ locale });
    expect(view.getByRole("button", { name: label })).toBeTruthy();
  });

  it("asks the sheet to close on a tap outside (the shell mock passes the prop to a View)", async () => {
    const { view } = await renderSheet();
    expect(getHost(view.container, "View", { closeOnBackdropPress: true })).toBeTruthy();
  });
});
