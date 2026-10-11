import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderMobile } from "../../../test/render";
import { contrast, cssTokens, hex, over, rgb, type Rgb, type ThemeName } from "../../../test/tokens";

import { MessageBubble } from "./MessageBubble";

import { THEME } from "@/lib/theme";

type Screen = ReturnType<typeof renderMobile>;
interface Node {
  parent: Node | null;
  props: { className?: unknown };
  findAll: (match: (node: Node) => boolean) => Node[];
}

const AT_1405 = new Date(2026, 9, 2, 14, 5).toISOString();
const TEXT = "Is the car still available?";
const IMAGE = { kind: "image" as const, text: "", localImageUri: "file:///photo.jpg" };
const AA = 4.5;
/** Non-text graphics such as the read ✓✓ (77 Accessibility). */
const GRAPHIC = 3;
const THEMES: ThemeName[] = ["light", "dark"];
/** The founder's sketch (#775 F): brand colour at about 12% (light) and 22% (dark) over the page. */
const SKETCH: Record<ThemeName, string> = { light: "#F1D6D4", dark: "#411112" };

function bubble(props: Partial<ComponentProps<typeof MessageBubble>> = {}) {
  return <MessageBubble id="m1" text={TEXT} isMine status="sent" createdAt={AT_1405} {...props} />;
}

const classOf = (node: Node) => (typeof node.props.className === "string" ? node.props.className : "");

/** The bubble container, found from any node inside it. */
function bubbleOf(node: Node): Node {
  let current: Node | null = node;
  while (current) {
    if (classOf(current).includes("max-w-[80%]")) return current;
    current = current.parent;
  }
  throw new Error("No bubble container above the node");
}

/** The colour class of a node as a token name and an opacity: "text-foreground/70" is foreground at 0.7. */
function colourClass(className: string, prefix: "text" | "bg") {
  const pattern = new RegExp(`^${prefix}-(message-own|message-read|primary-foreground|muted-foreground|foreground|destructive|primary|muted)(?:/(\\d+))?$`);
  const found = className.split(/\s+/).map((name) => pattern.exec(name)).find(Boolean);
  if (!found) throw new Error(`No ${prefix} colour class in "${className}"`);
  return { token: found[1] ?? "", alpha: found[2] ? Number(found[2]) / 100 : 1 };
}

/** The opaque colour a class draws over `surface`, from the tokens of one theme. */
function drawn(className: string, prefix: "text" | "bg", theme: ThemeName, surface: Rgb): Rgb {
  const { token, alpha } = colourClass(className, prefix);
  const value = cssTokens(theme)[token];
  if (!value) throw new Error(`global.css has no --${token} in the ${theme} theme`);
  return over(rgb(value), alpha, surface);
}

/** The contrast of a text or icon node against the bubble it sits in. */
function contrastOnBubble(node: Node, theme: ThemeName): number {
  const page = rgb(cssTokens(theme).background ?? "");
  const fill = drawn(classOf(bubbleOf(node)), "bg", theme, page);
  return contrast(drawn(classOf(node), "text", theme, fill), fill);
}

/** The icon inside a wrapper: the one node whose class sets an icon size. */
const iconIn = (wrapper: Node) => wrapper.findAll((node) => classOf(node).includes("size-3.5"))[0] as Node;
const tick = (screen: Screen, id: string) =>
  iconIn(screen.getByTestId(id, { includeHiddenElements: true }) as unknown as Node);
const text = (screen: Screen, value: string) => screen.getByText(value) as unknown as Node;

describe("own Message bubble tint (#775 F)", () => {
  it("fills an own Message with the tint token, not the solid brand colour", () => {
    const className = classOf(bubbleOf(text(renderMobile(bubble()), TEXT)));
    expect(className).toContain("bg-message-own");
    expect(className).not.toMatch(/bg-primary/);
    expect(className).toContain("rounded-br-md");
  });

  it("puts a sent photo in the same tinted bubble", () => {
    const screen = renderMobile(bubble({ ...IMAGE, status: "delivered" }));
    expect(classOf(bubbleOf(text(screen, "02:05 PM")))).toContain("bg-message-own");
  });

  it("writes the Message in the normal text colour", () => {
    expect(classOf(text(renderMobile(bubble()), TEXT)).split(/\s+/)).toContain("text-foreground");
  });

  it("draws the time, the sent and delivered ticks and the state labels in one quiet colour", () => {
    const sent = renderMobile(bubble({ status: "sent" }));
    const quiet = colourClass(classOf(text(sent, "02:05 PM")), "text");
    expect(quiet.token).toBe("foreground");
    expect(quiet.alpha).toBeLessThan(1);
    expect(colourClass(classOf(tick(sent, "message-tick-sent")), "text")).toEqual(quiet);
    sent.unmount();

    const delivered = renderMobile(bubble({ status: "delivered" }));
    expect(colourClass(classOf(tick(delivered, "message-tick-double")), "text")).toEqual(quiet);
    delivered.unmount();

    const pending = renderMobile(bubble({ status: "pending" }));
    expect(colourClass(classOf(text(pending, "Sending...")), "text")).toEqual(quiet);
    pending.unmount();

    const reported = renderMobile(bubble({ reported: true }));
    expect(colourClass(classOf(text(reported, "Reported")), "text")).toEqual(quiet);
  });

  it("colours the read ✓✓ with the read token, so it differs from delivered (#821)", () => {
    const read = renderMobile(bubble({ status: "read" }));
    expect(colourClass(classOf(tick(read, "message-tick-double")), "text")).toEqual({ token: "message-read", alpha: 1 });
  });

  it.each(THEMES)("reads the read ✓✓ on the %s tint at 3:1 or better (#821)", (theme) => {
    const read = renderMobile(bubble({ status: "read" }));
    expect(contrastOnBubble(tick(read, "message-tick-double"), theme)).toBeGreaterThanOrEqual(GRAPHIC);
  });

  it("draws Failed to send and Retry on an own Message in the destructive colour", () => {
    const screen = renderMobile(bubble({ status: "failed", onRetry: vi.fn() }));
    const retry = screen.getByRole("button", { name: "Retry" }) as unknown as Node;
    for (const node of [text(screen, "Failed to send"), text(screen, "Retry"), iconIn(retry)]) {
      expect(colourClass(classOf(node), "text")).toEqual({ token: "destructive", alpha: 1 });
    }
  });

  it.each(THEMES)("has a %s tint near the approved sketch", (theme) => {
    const tint = rgb(cssTokens(theme)["message-own"] ?? "");
    const sketch = hex(SKETCH[theme]);
    tint.forEach((channel, index) => {
      expect(Math.abs(channel - (sketch[index] ?? 0)) * 255).toBeLessThanOrEqual(6);
    });
  });

  it.each(THEMES)("reads every text and icon on the %s tint at 4.5:1 or better", (theme) => {
    const sent = renderMobile(bubble({ status: "sent" }));
    expect(contrastOnBubble(text(sent, TEXT), theme)).toBeGreaterThanOrEqual(AA);
    expect(contrastOnBubble(text(sent, "02:05 PM"), theme)).toBeGreaterThanOrEqual(AA);
    expect(contrastOnBubble(tick(sent, "message-tick-sent"), theme)).toBeGreaterThanOrEqual(AA);
    sent.unmount();

    const photo = renderMobile(bubble({ ...IMAGE, status: "delivered" }));
    expect(contrastOnBubble(text(photo, "02:05 PM"), theme)).toBeGreaterThanOrEqual(AA);
    expect(contrastOnBubble(tick(photo, "message-tick-double"), theme)).toBeGreaterThanOrEqual(AA);
    photo.unmount();

    const failed = renderMobile(bubble({ status: "failed", onRetry: vi.fn() }));
    const retry = failed.getByRole("button", { name: "Retry" }) as unknown as Node;
    expect(contrastOnBubble(text(failed, TEXT), theme)).toBeGreaterThanOrEqual(AA);
    expect(contrastOnBubble(text(failed, "Failed to send"), theme)).toBeGreaterThanOrEqual(AA);
    expect(contrastOnBubble(text(failed, "Retry"), theme)).toBeGreaterThanOrEqual(AA);
    expect(contrastOnBubble(iconIn(retry), theme)).toBeGreaterThanOrEqual(AA);
  });

  it("keeps lib/theme.ts in step with global.css for the tint", () => {
    const tints = THEME as unknown as Record<ThemeName, { messageOwn?: string }>;
    expect(tints.light.messageOwn).toBe(cssTokens("light")["message-own"]);
    expect(tints.dark.messageOwn).toBe(cssTokens("dark")["message-own"]);
    expect(tints.light.messageOwn).toBeTruthy();
  });

  it("keeps lib/theme.ts in step with global.css for the read tick", () => {
    const tokens = THEME as unknown as Record<ThemeName, { messageRead?: string }>;
    expect(tokens.light.messageRead).toBe(cssTokens("light")["message-read"]);
    expect(tokens.dark.messageRead).toBe(cssTokens("dark")["message-read"]);
    expect(tokens.light.messageRead).toBeTruthy();
  });
});

describe("what the tint leaves alone (#775 F)", () => {
  it("keeps the other person's bubble", () => {
    const screen = renderMobile(bubble({ isMine: false }));
    const className = classOf(bubbleOf(text(screen, TEXT)));
    expect(className.split(/\s+/)).toEqual(expect.arrayContaining(["bg-muted", "rounded-bl-md"]));
    expect(classOf(text(screen, TEXT)).split(/\s+/)).toContain("text-foreground");
    expect(classOf(text(screen, "02:05 PM")).split(/\s+/)).toContain("text-muted-foreground");
  });

  it("keeps the other person's failed label destructive", () => {
    const screen = renderMobile(bubble({ isMine: false, status: "failed" }));
    expect(classOf(text(screen, "Failed to send")).split(/\s+/)).toContain("text-destructive");
  });

  it("keeps a deleted own Message grey", () => {
    const screen = renderMobile(bubble({ deletedAt: AT_1405 }));
    const className = classOf(bubbleOf(text(screen, "Message deleted")));
    expect(className.split(/\s+/)).toEqual(expect.arrayContaining(["bg-muted/60", "rounded-md"]));
    expect(className).not.toContain("bg-message-own");
    expect(classOf(text(screen, "02:05 PM")).split(/\s+/)).toContain("text-muted-foreground");
  });

  it("keeps the dimming of a pending and of a reported own Message", () => {
    const pending = renderMobile(bubble({ status: "pending" }));
    expect(classOf(bubbleOf(text(pending, "Sending...")))).toContain("opacity-70");
    pending.unmount();

    const reported = renderMobile(bubble({ reported: true }));
    expect(classOf(bubbleOf(text(reported, "Reported")))).toContain("opacity-60");
  });
});
