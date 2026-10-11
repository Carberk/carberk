import { describe, expect, it } from "vitest";

import { renderMobile } from "./render";
import { contrast, cssTokens, rgb } from "./tokens";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { THEME } from "@/lib/theme";

describe("functional blue", () => {
  it("gives More the functional link role", () => {
    const screen = renderMobile(<Button variant="link"><Text>More</Text></Button>);
    expect(screen.getByText("More").props.className).toContain("text-link");
  });

  it.each(["light", "dark"] as const)("keeps small links readable on %s page and card surfaces", (theme) => {
    const tokens = cssTokens(theme);
    const colour = rgb(tokens["message-read"] ?? "");
    expect(THEME[theme].messageRead).toBe(tokens["message-read"]);
    expect(contrast(colour, rgb(tokens.background ?? ""))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colour, rgb(tokens.card ?? ""))).toBeGreaterThanOrEqual(4.5);
    expect(THEME[theme].primary).toBe(theme === "light" ? "0 100% 45%" : "0 90% 52%");
  });
});
