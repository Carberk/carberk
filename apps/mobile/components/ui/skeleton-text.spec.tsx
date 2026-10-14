import { describe, expect, it } from "vitest";

import { getHost, renderMobile } from "../../test/render";

import { SkeletonText } from "./skeleton-text";

import { ROLE_MAX_FONT_SCALE } from "@/lib/font-scale";

describe("SkeletonText", () => {
  it.each([
    ["text-subhead font-semibold", ROLE_MAX_FONT_SCALE.subhead],
    ["text-headline font-heading", ROLE_MAX_FONT_SCALE.headline],
    ["text-callout", undefined],
  ])("sets its height with an invisible line of %s, which grows with the font size as that role does", async (role, cap) => {
    const screen = await renderMobile(<SkeletonText className={role} width="50%" />);
    const line = getHost(screen.container, "Text");

    expect(line.props.className).toContain(role.split(" ")[0]);
    expect(line.props.className).toContain("opacity-0");
    expect(line.props.maxFontSizeMultiplier).toBe(cap);
    expect(line.props.children).toBe(" ");
  });

  it("is hidden from screen readers", async () => {
    const screen = await renderMobile(<SkeletonText testID="line" className="text-body" width="100%" />);
    const root = screen.getByTestId("line", { includeHiddenElements: true });
    expect(screen.queryByTestId("line")).toBeNull();

    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe("no-hide-descendants");
  });
});
