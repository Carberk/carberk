import { describe, expect, it, vi } from "vitest";

import { StickyActionBar } from "../navigation/StickyActionBar";
import { renderMobile, fireEvent } from "../../test/render";

import { GlassButton } from "./glass-button";
import { Text } from "./text";

// Off iOS 26 (what a spec renders, see test/native-setup.ts) a glass button is
// a solid capsule with the floating shadow.
describe("GlassButton without the system glass", () => {
  it("draws Call as a solid brand capsule and Message as a solid tonal capsule", async () => {
    const screen = await renderMobile(<>
      <GlassButton tone="brand" onPress={vi.fn()} accessibilityLabel="Call"><Text>Call</Text></GlassButton>
      <GlassButton onPress={vi.fn()} accessibilityLabel="Message"><Text>Message</Text></GlassButton>
    </>);

    const call = screen.getByRole("button", { name: "Call" });
    const message = screen.getByRole("button", { name: "Message" });
    expect(call.props.className).toMatch(/\bbg-primary\b/);
    expect(message.props.className).not.toMatch(/\bbg-primary\b/);
    for (const button of [call, message]) {
      expect(button.props.className).toMatch(/\brounded-full\b/);
      expect(button.props.className).toMatch(/\bshadow-floating\b/);
      expect(button.props.className).toMatch(/\bmin-h-control-lg\b/);
    }
  });

  it("passes layout classes and presses through", async () => {
    const onPress = vi.fn();
    const screen = await renderMobile(<GlassButton className="flex-1" onPress={onPress} accessibilityLabel="Go"><Text>Go</Text></GlassButton>);

    await fireEvent.press(screen.getByRole("button", { name: "Go" }));
    expect(onPress).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Go" }).props.className).toMatch(/\bflex-1\b/);
  });
});

describe("StickyActionBar", () => {
  it("floats its buttons with no material of its own behind them", async () => {
    const screen = await renderMobile(<StickyActionBar testID="bar">
      <GlassButton onPress={vi.fn()} accessibilityLabel="All filters"><Text>All filters</Text></GlassButton>
    </StickyActionBar>);

    const materials = screen.container.queryAll((node: { props: { className?: unknown } }) =>
      typeof node.props.className === "string" && /\bbg-glass\b|\bbg-glass\/|rounded-3xl/.test(node.props.className));
    expect(materials).toHaveLength(0);
    expect(screen.getByRole("button", { name: "All filters" })).toBeTruthy();
  });
});
