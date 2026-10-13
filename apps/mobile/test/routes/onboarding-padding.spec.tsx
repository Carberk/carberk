import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderMobile } from "../render";
import LanguagePickerScreen from "../../app/(onboarding)/language";
import ValuePropScreen from "../../app/(onboarding)/value-prop";

const INSETS = { top: 24, right: 0, bottom: 16, left: 0 };

vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => INSETS }));

type Node = {
  type: unknown;
  props: { className?: string; style?: { paddingBottom?: number } };
  parent: Node | null;
};

const PADDING_CLASS = /^-?p[xytblrse]?-/;

const classes = (node: Node) => (node.props.className ?? "").split(/\s+/).filter(Boolean);
const isHostView = (node: Node) => typeof node.type === "string";
/** SafeScreen's own view: the one that carries the device insets as inline padding. */
const isInsetView = (node: Node) => isHostView(node) && node.props.style?.paddingBottom === INSETS.bottom;

/** Padding classes on the views between a piece of content and the inset view around it. */
function paddingInsideSafeArea(content: Node) {
  const padding: string[] = [];
  for (let node = content.parent; node; node = node.parent) {
    if (isInsetView(node)) return padding;
    if (isHostView(node)) padding.push(...classes(node).filter((name) => PADDING_CLASS.test(name)));
  }
  throw new Error("The content is not inside SafeScreen");
}

async function render(screen: ReactElement) {
  const view = await renderMobile(screen);
  const insetView = view.container.queryAll(isInsetView)[0] as Node;
  return { ...view, insetView };
}

describe("Onboarding screen padding", () => {
  it("keeps the language wordmark, title, rows and Continue button off the screen edges", async () => {
    const screen = await render(<LanguagePickerScreen />);

    const content = [
      screen.getByLabelText("Carberk"),
      screen.getByText("Choose language"),
      screen.getByLabelText("Language"),
      screen.getByRole("button", { name: "Continue" }),
    ];

    for (const node of content) {
      expect(paddingInsideSafeArea(node)).toContain("px-6");
    }
    // The button clears the system navigation bar by the inset plus its own padding.
    expect(paddingInsideSafeArea(screen.getByRole("button", { name: "Continue" }))).toContain("pb-4");
  });

  it("keeps the page text, page dots and main button off the screen edges", async () => {
    const screen = await render(<ValuePropScreen />);

    const content = [
      screen.getByText("Find a car by make and model"),
      screen.getByLabelText("Page 1 of 2"),
      screen.getByRole("button", { name: "Next" }),
    ];

    for (const node of content) {
      expect(paddingInsideSafeArea(node)).toContain("px-6");
    }
    expect(paddingInsideSafeArea(screen.getByRole("button", { name: "Next" }))).toContain("pb-4");
  });

  it("keeps Back and Skip off the screen edges in the top bar", async () => {
    const screen = await render(<ValuePropScreen />);

    for (const name of ["Back", "Skip"]) {
      expect(paddingInsideSafeArea(screen.getByRole("button", { name }))).toContain("px-4");
    }
  });

  it.each([
    ["language", <LanguagePickerScreen key="language" />],
    ["value prop", <ValuePropScreen key="value-prop" />],
  ])("adds the %s padding to the safe-area inset instead of replacing it", async (_name, element) => {
    const { insetView } = await render(element);

    expect(insetView.props.style).toMatchObject({ paddingTop: INSETS.top, paddingBottom: INSETS.bottom });
    expect(classes(insetView).filter((name) => PADDING_CLASS.test(name))).toEqual([]);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules") return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry.name) && !/\.spec\.tsx$/.test(entry.name) ? [path] : [];
  });
}

describe("SafeScreen callers", () => {
  // SafeScreen's inline inset padding wins over a padding class, so the class does nothing.
  it("never pass a padding class to SafeScreen", () => {
    const root = resolve(__dirname, "../..");
    const offenders = ["app", "components", "src"].flatMap((dir) => sourceFiles(join(root, dir))).flatMap((file) => {
      const source = readFileSync(file, "utf-8");
      return [...source.matchAll(/<SafeScreen\b[^>]*?className=(?:"([^"]*)"|\{([^}]*)\})/g)]
        .filter((match) => (match[1] ?? match[2] ?? "").split(/[\s"'`,()]+/).some((name) => PADDING_CLASS.test(name)))
        .map((match) => `${file.slice(root.length + 1)}: ${match[0]}`);
    });

    expect(offenders).toEqual([]);
  });
});
