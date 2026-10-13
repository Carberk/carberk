import { describe, expect, it, vi } from "vitest";
import { Heart } from "lucide-react-native";

import { fireEvent, renderMobile } from "../../test/render";

import { BackButton, HeaderButton } from "./StackHeader";

type Node = { props: { className?: string }; parent: Node | null };

/** Whether the glass material is drawn in the node or one of its descendants. */
function drawsGlass(screen: Awaited<ReturnType<typeof renderMobile>>) {
  return screen.container
    .queryAll((node: Node) => typeof node.props.className === "string")
    .some((node: Node) => node.props.className?.split(" ").includes("bg-glass/glass"));
}

describe("Header buttons", () => {
  it("draws a glass circle that keeps its label, role and press", async () => {
    const onPress = vi.fn();
    const screen = await renderMobile(
      <BackButton tone="glass" accessibilityLabel="Back" onPress={onPress} />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Back" }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(drawsGlass(screen)).toBe(true);
  });

  it("does not answer a press on a disabled glass circle", async () => {
    const onPress = vi.fn();
    const screen = await renderMobile(
      <HeaderButton tone="glass" icon={Heart} accessibilityLabel="Favorite" disabled onPress={onPress} />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Favorite" }));

    expect(onPress).not.toHaveBeenCalled();
  });

  it("keeps the tonal circle off the glass on a page header", async () => {
    const screen = await renderMobile(<BackButton accessibilityLabel="Back" onPress={() => {}} />);

    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(drawsGlass(screen)).toBe(false);
  });
});
