import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "./render";

import { Checkbox } from "@/components/ui/checkbox";

// The checkbox module is not mocked here: these specs run against the shell that
// `native-setup.ts` registers for every spec.
describe("Checkbox shell", () => {
  it("exposes checked as the checkbox accessibility state", async () => {
    const screen = await renderMobile(
      <>
        <Checkbox accessibilityLabel="Ticked" checked />
        <Checkbox accessibilityLabel="Empty" checked={false} />
      </>,
    );

    expect(screen.getByRole("checkbox", { name: "Ticked", checked: true })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Empty", checked: false })).toBeTruthy();
  });

  it("reports the value a press toggles to through onCheckedChange", async () => {
    const onCheckedChange = vi.fn();
    const screen = await renderMobile(
      <>
        <Checkbox accessibilityLabel="Ticked" checked onCheckedChange={onCheckedChange} />
        <Checkbox accessibilityLabel="Empty" checked={false} onCheckedChange={onCheckedChange} />
      </>,
    );

    await fireEvent.press(screen.getByRole("checkbox", { name: "Empty" }));
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);

    await fireEvent.press(screen.getByRole("checkbox", { name: "Ticked" }));
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });

  it("calls a caller's onPress after onCheckedChange, as the primitive does", async () => {
    const calls: string[] = [];
    const screen = await renderMobile(
      <Checkbox
        accessibilityLabel="Empty"
        checked={false}
        onCheckedChange={() => calls.push("onCheckedChange")}
        onPress={() => calls.push("onPress")}
      />,
    );

    await fireEvent.press(screen.getByRole("checkbox", { name: "Empty" }));

    expect(calls).toEqual(["onCheckedChange", "onPress"]);
  });

  it("does not report a press when it is disabled", async () => {
    const onCheckedChange = vi.fn();
    const screen = await renderMobile(
      <Checkbox accessibilityLabel="Locked" checked={false} disabled onCheckedChange={onCheckedChange} />,
    );

    await fireEvent.press(screen.getByRole("checkbox", { name: "Locked", disabled: true }));

    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("does not call a caller's onPress when it is disabled", async () => {
    const onPress = vi.fn();
    const screen = await renderMobile(
      <Checkbox accessibilityLabel="Locked" checked={false} disabled onCheckedChange={vi.fn()} onPress={onPress} />,
    );

    await fireEvent.press(screen.getByRole("checkbox", { name: "Locked", disabled: true }));

    expect(onPress).not.toHaveBeenCalled();
  });
});
