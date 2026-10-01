import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "@/components/ui/checkbox";

import { fireEvent, renderMobile } from "./render";

// The checkbox module is not mocked here: these specs run against the shell that
// `native-setup.ts` registers for every spec.
describe("Checkbox shell", () => {
  it("exposes checked as the checkbox accessibility state", () => {
    const screen = renderMobile(
      <>
        <Checkbox accessibilityLabel="Ticked" checked />
        <Checkbox accessibilityLabel="Empty" checked={false} />
      </>,
    );

    expect(screen.getByRole("checkbox", { name: "Ticked", checked: true })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Empty", checked: false })).toBeTruthy();
  });

  it("reports the value a press toggles to through onCheckedChange", () => {
    const onCheckedChange = vi.fn();
    const screen = renderMobile(
      <>
        <Checkbox accessibilityLabel="Ticked" checked onCheckedChange={onCheckedChange} />
        <Checkbox accessibilityLabel="Empty" checked={false} onCheckedChange={onCheckedChange} />
      </>,
    );

    fireEvent.press(screen.getByRole("checkbox", { name: "Empty" }));
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);

    fireEvent.press(screen.getByRole("checkbox", { name: "Ticked" }));
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });

  it("does not report a press when it is disabled", () => {
    const onCheckedChange = vi.fn();
    const screen = renderMobile(
      <Checkbox accessibilityLabel="Locked" checked={false} disabled onCheckedChange={onCheckedChange} />,
    );

    fireEvent.press(screen.getByRole("checkbox", { name: "Locked", disabled: true }));

    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
