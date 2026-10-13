import { mobileType } from "@auto-tm/ui/tokens";
import { Platform } from "react-native";
import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile, queryAllHosts } from "../../../test/render";

import { MessageComposer } from "./MessageComposer";

// The real theme module imports React Navigation, which needs the native runtime.
vi.mock("../../../lib/theme", () => ({
  THEME: { light: { mutedForeground: "0 0% 45%" }, dark: { mutedForeground: "0 0% 60%" } },
}));
vi.mock("expo-image-picker", () => ({
  useMediaLibraryPermissions: () => [{ granted: true }, vi.fn()],
  launchImageLibraryAsync: vi.fn(),
}));
vi.mock("expo-file-system/legacy", () => ({ deleteAsync: vi.fn(async () => {}) }));
vi.mock("expo-linking", () => ({ openSettings: vi.fn() }));
vi.mock("../upload/chatImageUpload", () => ({
  compressChatImage: vi.fn(),
  getChatImageStagingPath: vi.fn(),
  ensureChatStagingDir: vi.fn(),
  ChatImageUploadError: class extends Error {},
}));

interface Node {
  parent: Node | null;
  props: { className?: unknown; style?: unknown };
  queryAll: (match: (node: Node) => boolean) => Node[];
}

const TOUCH_TARGET = 44;
const classes = (node: Node) =>
  typeof node.props.className === "string" ? node.props.className.split(/\s+/) : [];

/** The nearest node at or above `node` that carries the class. */
function closest(node: Node, className: string): Node {
  let current: Node | null = node;
  while (current) {
    if (classes(current).includes(className)) return current;
    current = current.parent;
  }
  throw new Error(`No node with ${className} at or above the node`);
}

/** A spacing class in dp on the 4 dp scale ("py-2.5" is 10), or undefined when the node has none. */
function spacing(node: Node, prefix: string): number | undefined {
  const found = classes(node).map((name) => new RegExp(`^${prefix}-([\\d.]+)$`).exec(name)).find(Boolean);
  return found ? Number(found[1]) * 4 : undefined;
}

async function composer(text = "") {
  const screen = await renderMobile(<MessageComposer onSend={vi.fn()} conversationId="c1" />);
  const input = screen.getByPlaceholderText("Message") as unknown as Node;
  if (text) await fireEvent.changeText(screen.getByPlaceholderText("Message"), text);
  const field = closest(input, "rounded-2xl");
  const row = closest(field, "border-t");
  const button = (name: string) => {
    const node = screen.getByRole("button", { name }) as unknown as Node;
    return [node, ...node.queryAll(() => true)].find((candidate) => classes(candidate).includes("h-11")) ?? closest(node, "h-11");
  };
  return { input, field, row, paperclip: button("Attach photo"), send: button("Send message") };
}

describe("Message composer row alignment (#775 F)", () => {
  it("makes a one-line field exactly as tall as the two buttons, so the three share a centre", async () => {
    const { input, field, paperclip, send } = await composer("Hello");

    // The field's own text adds no native padding of its own on either platform.
    expect(spacing(input, "py")).toBe(0);
    // One line of body text plus the field's padding fits inside the buttons' height...
    const oneLine = mobileType.body[1] + 2 * (spacing(field, "py") ?? Number.NaN);
    expect(oneLine).toBeLessThanOrEqual(TOUCH_TARGET);
    // ...and the field never gets shorter than them, with its text centred in that height.
    expect(spacing(field, "min-h")).toBe(TOUCH_TARGET);
    expect(classes(field)).toContain("justify-center");
    expect(spacing(paperclip, "h")).toBe(TOUCH_TARGET);
    expect(spacing(send, "h")).toBe(TOUCH_TARGET);
  });

  it("centres the text of the field on Android as well", async () => {
    const { input } = await composer();
    expect(input.props.style).toMatchObject({ textAlignVertical: "center" });
  });

  it("keeps both buttons at the bottom of a field that grew to several lines", async () => {
    const { row, field, paperclip, send } = await composer("One\nTwo\nThree");

    expect(classes(row)).toContain("items-end");
    expect(closest(paperclip, "border-t")).toBe(row);
    expect(closest(send, "border-t")).toBe(row);
    // The field may still grow: its height is a minimum, not a fixed value.
    expect(spacing(field, "h")).toBeUndefined();
  });

  it("keeps a 44 dp touch target on both buttons", async () => {
    const { paperclip, send } = await composer();
    for (const button of [paperclip, send]) {
      expect(spacing(button, "h")).toBe(TOUCH_TARGET);
      expect(spacing(button, "w")).toBe(TOUCH_TARGET);
    }
  });
});

describe("Message composer keyboard avoidance (#843)", () => {
  // The composer sits at the bottom of the Conversation screen, which owns the one
  // avoidance region. A region of its own would measure its frame in the footer's
  // coordinates against the keyboard's screen position and leave it behind the keys.
  it.each(["ios", "android"] as const)("adds no keyboard avoidance of its own on %s", async (os) => {
    const previousOS = Platform.OS;
    Platform.OS = os;
    try {
      const screen = await renderMobile(<MessageComposer onSend={vi.fn()} conversationId="c1" showQuickReplies />);
      expect(queryAllHosts(screen.container, "KeyboardAvoidingView")).toHaveLength(0);
      expect(screen.getByRole("button", { name: "Attach photo" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Send message" })).toBeTruthy();
    } finally { Platform.OS = previousOS; }
  });
});
