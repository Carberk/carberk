import { describe, expect, it, vi } from "vitest";

import { renderMobile } from "../../test/render";

import { GlassButton } from "./glass-button";
import { Text } from "./text";

// iOS 26 and later: the button itself is an interactive Liquid Glass capsule.
vi.mock("expo-glass-effect", async () => {
  const { View } = await import("react-native");
  return {
    GlassView: (props: Record<string, unknown>) => <View testID="glass" {...props} />,
    GlassContainer: View,
    isLiquidGlassAvailable: () => true,
    isGlassEffectAPIAvailable: () => true,
  };
});

describe("GlassButton on the system glass", () => {
  it("tints Call with the brand red and leaves Message clear glass", async () => {
    const screen = await renderMobile(<>
      <GlassButton tone="brand" className="flex-1" accessibilityLabel="Call"><Text>Call</Text></GlassButton>
      <GlassButton accessibilityLabel="Message"><Text>Message</Text></GlassButton>
    </>);

    const [call, message] = screen.getAllByTestId("glass");
    expect(call?.props.isInteractive).toBe(true);
    // Light brand red, hsl(0 100% 45%).
    expect(call?.props.tintColor).toBe("#e60000");
    expect(call?.props.className).toMatch(/\brounded-full\b/);
    expect(call?.props.className).toMatch(/\bflex-1\b/);
    expect(message?.props.isInteractive).toBe(true);
    expect(message?.props.tintColor).toBeUndefined();
    expect(screen.getByText("Call").props.className).toMatch(/\btext-white\b/);
    expect(screen.getByText("Message").props.className).toMatch(/\btext-foreground\b/);
  });

  it("drops the tint and quiets the label while disabled", async () => {
    const screen = await renderMobile(<GlassButton tone="brand" disabled accessibilityLabel="Call"><Text>Call</Text></GlassButton>);

    expect(screen.getByTestId("glass").props.tintColor).toBeUndefined();
    expect(screen.getByText("Call").props.className).toMatch(/\btext-muted-foreground\b/);
    expect(screen.getByRole("button", { name: "Call" }).props.disabled).toBe(true);
  });
});
