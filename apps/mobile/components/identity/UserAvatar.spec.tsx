import { beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile, getHost, queryHost } from "../../test/render";

import { UserAvatar } from "./UserAvatar";

const theme = vi.hoisted(() => ({ colorScheme: "light" as "light" | "dark" | undefined }));
vi.mock("nativewind", () => ({
  cssInterop: vi.fn(),
  remapProps: vi.fn(),
  useColorScheme: () => ({ colorScheme: theme.colorScheme, setColorScheme: vi.fn() }),
}));

beforeEach(() => {
  theme.colorScheme = "light";
});

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };

/** Every rendered host node of one type, in drawing order. */
function nodes(view: Awaited<ReturnType<typeof renderMobile>>, type: string): Node[] {
  const found: Node[] = [];
  const visit = (node: Node | Node[] | string | null) => {
    if (node === null || typeof node === "string") return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.type === type) found.push(node);
    node.children?.forEach(visit);
  };
  visit(view.toJSON() as Node | Node[] | null);
  return found;
}

const firstPath = (view: Awaited<ReturnType<typeof renderMobile>>) => nodes(view, "Path")[0]?.props.d;
const circle = (view: Awaited<ReturnType<typeof renderMobile>>) => nodes(view, "View")[0]?.props.style;

// The prototype's library by position: the first stroke of each mark.
const LIBRARY = [
  [0, "sedan", "M3 15v-2.6l2.3-.8 2.4-3.1h6.3l3.1 3.1 3.9 .9V15"],
  [1, "hatchback", "M3 15v-3l2-1.1L7.6 8H14l4.2 3.6 2.8.7V15"],
  [2, "SUV", "M3 15V9.4C3 8.6 3.6 8 4.4 8H15l3.2 3.6 2.8.6V15"],
  [3, "pickup", "M3 15v-3.4h8.5V8H16l2.4 3.6 2.6.6V15"],
  [4, "van", "M3 15V8.2C3 7.5 3.5 7 4.2 7h11.3l4 4.6 1.5.5V15"],
  [5, "steering wheel", "M3.8 10.4c3.2-1 5.2-.8 6.5.9M20.2 10.4c-3.2-1-5.2-.8-6.5.9M12 14.5v6"],
  [6, "wheel", "M12 3.5v5.9M12 14.6v5.9M3.9 9.4l5.6 1.8M14.5 12.8l5.6 1.8M7 18.9l3.5-4.8M13.5 9.9L17 5.1"],
  [7, "key", "M11.5 12H21M17 12v3M20 12v2.4M6.5 12h.01"],
  [8, "speedometer", "M4.2 17a8.5 8.5 0 1 1 15.6 0"],
  [9, "gear shift", "M6 6.5v11M12 6.5v11M18 6.5V12H6"],
  [10, "road", "M8.5 3L4 21M15.5 3L20 21M12 4v3M12 10.5v3M12 17v3"],
  [11, "headlight", "M10 6a6 6 0 0 0 0 12c1.6 0 3-2.6 3-6s-1.4-6-3-6z"],
] as const;

describe("UserAvatar car mark", () => {
  it.each(LIBRARY)("draws mark %i, the %s, for that avatar index", async (index, _name, d) => {
    const view = await renderMobile(<UserAvatar size={48} avatarIndex={index} />);
    expect(firstPath(view)).toBe(d);
  });

  it("draws twelve different marks on twelve different tints", async () => {
    const drawings = new Set<string>();
    const tints = new Set<unknown>();
    for (let index = 0; index < 12; index += 1) {
      const view = await renderMobile(<UserAvatar size={48} avatarIndex={index} />);
      drawings.add(JSON.stringify([nodes(view, "Path"), nodes(view, "Circle")].flat().map((node) => node.props)));
      tints.add((circle(view) as { backgroundColor: string }).backgroundColor);
      await view.unmount();
    }
    expect(drawings.size).toBe(12);
    expect(tints.size).toBe(12);
  });

  it("draws the sedan's body, its details and both wheels", async () => {
    const view = await renderMobile(<UserAvatar size={48} avatarIndex={0} />);
    expect(nodes(view, "Path").map((node) => node.props.d)).toEqual([
      "M3 15v-2.6l2.3-.8 2.4-3.1h6.3l3.1 3.1 3.9 .9V15",
      "M3 15h2.2M9.8 15h4.4M18.8 15H21M11 8.5v3.2",
    ]);
    expect(nodes(view, "Circle").map(({ props }) => [props.cx, props.cy, props.r])).toEqual([
      [7.5, 15.5, 1.8],
      [16.5, 15.5, 1.8],
    ]);
  });

  it.each([
    [12, "M3 15v-2.6l2.3-.8 2.4-3.1h6.3l3.1 3.1 3.9 .9V15"],
    [19, "M11.5 12H21M17 12v3M20 12v2.4M6.5 12h.01"],
    [240, "M3 15v-2.6l2.3-.8 2.4-3.1h6.3l3.1 3.1 3.9 .9V15"],
    [-1, "M10 6a6 6 0 0 0 0 12c1.6 0 3-2.6 3-6s-1.4-6-3-6z"],
    [Number.NaN, "M3 15v-2.6l2.3-.8 2.4-3.1h6.3l3.1 3.1 3.9 .9V15"],
  ])("still draws a mark for the out-of-range index %d", async (index, d) => {
    const view = await renderMobile(<UserAvatar size={48} avatarIndex={index} />);
    expect(firstPath(view)).toBe(d);
    expect(nodes(view, "Svg")).toHaveLength(1);
  });

  it.each([
    [72, 45, 1.6],
    [48, 30, 1.6],
    [24, 15, 2],
  ])("fills a %i-point circle with a %i-point mark", async (size, glyph, strokeWidth) => {
    const view = await renderMobile(<UserAvatar size={size} avatarIndex={7} />);
    expect(circle(view)).toMatchObject({ width: size, height: size, borderRadius: size / 2 });
    expect(nodes(view, "Svg")[0]?.props).toMatchObject({
      width: glyph, height: glyph, viewBox: "0 0 24 24", fill: "none", strokeWidth,
      strokeLinecap: "round", strokeLinejoin: "round",
    });
  });
});

describe("UserAvatar tints", () => {
  it("draws a dark mark on a pale tint in light theme", async () => {
    const view = await renderMobile(<UserAvatar size={48} avatarIndex={0} />);
    expect(circle(view)).toMatchObject({ backgroundColor: "hsl(212, 46%, 89%)" });
    expect(nodes(view, "Svg")[0]?.props.stroke).toBe("hsl(212, 48%, 28%)");
  });

  it("draws a pale mark on a deep tint in dark theme", async () => {
    theme.colorScheme = "dark";
    const view = await renderMobile(<UserAvatar size={48} avatarIndex={0} />);
    expect(circle(view)).toMatchObject({ backgroundColor: "hsl(212, 26%, 22%)" });
    expect(nodes(view, "Svg")[0]?.props.stroke).toBe("hsl(212, 58%, 80%)");
  });

  it("uses the light tint before the theme is known", async () => {
    theme.colorScheme = undefined;
    const view = await renderMobile(<UserAvatar size={48} avatarIndex={0} />);
    expect(circle(view)).toMatchObject({ backgroundColor: "hsl(212, 46%, 89%)" });
  });

  it.each(["light", "dark"] as const)("never uses the brand red in %s theme", async (scheme) => {
    theme.colorScheme = scheme;
    const colours: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      const view = await renderMobile(<UserAvatar size={48} avatarIndex={index} />);
      colours.push((circle(view) as { backgroundColor: string }).backgroundColor);
      colours.push(String(nodes(view, "Svg")[0]?.props.stroke));
      await view.unmount();
    }
    expect(colours).toHaveLength(24);
    // Brand red is hue 0 at 90% saturation; every tint is soft and off that hue.
    for (const colour of colours) {
      const [hue, saturation] = (colour.match(/\d+/g) ?? []).map(Number);
      expect(hue).toBeGreaterThanOrEqual(14);
      expect(hue).toBeLessThanOrEqual(338);
      expect(saturation).toBeLessThanOrEqual(58);
    }
  });
});

describe("UserAvatar for a screen reader", () => {
  it("is skipped when the name beside it already says who it is", async () => {
    const view = await renderMobile(<UserAvatar size={48} avatarIndex={3} />);
    expect(nodes(view, "View")[0]?.props).toMatchObject({
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
    });
    expect(view.queryByRole("image")).toBeNull();
  });

  it("is read as one labelled image when it stands alone", async () => {
    const view = await renderMobile(<UserAvatar size={48} avatarIndex={3} accessibilityLabel="Driver 4821" />);
    expect(view.getByRole("image", { name: "Driver 4821" })).toBeTruthy();
    expect(view.getAllByLabelText("Driver 4821")).toHaveLength(1);
  });
});

describe("UserAvatar profile photo", () => {
  const PHOTO = "https://media.autotm.tm/avatars/u1/photo.jpg";

  it("shows the photo instead of the car mark when the User has one", async () => {
    const view = await renderMobile(<UserAvatar size={72} avatarIndex={3} avatarKey="avatars/u1/photo.jpg" avatarUrl={PHOTO} />);
    expect(getHost(view.container, "Image").props.source).toEqual({ uri: PHOTO });
    expect(nodes(view, "Svg")).toHaveLength(0);
  });

  it("goes back to the car mark when the photo does not load", async () => {
    const view = await renderMobile(<UserAvatar size={72} avatarIndex={3} avatarKey="avatars/u1/photo.jpg" avatarUrl={PHOTO} />);
    await fireEvent(getHost(view.container, "Image"), "error");
    expect(queryHost(view.container, "Image")).toBeNull();
    expect(firstPath(view)).toBe("M3 15v-3.4h8.5V8H16l2.4 3.6 2.6.6V15");
  });

  it.each([
    ["no photo key", null, PHOTO],
  ])("shows the car mark with %s", async (_name, avatarKey, avatarUrl) => {
    const view = await renderMobile(<UserAvatar size={72} avatarIndex={3} avatarKey={avatarKey} avatarUrl={avatarUrl} />);
    expect(queryHost(view.container, "Image")).toBeNull();
    expect(firstPath(view)).toBe("M3 15v-3.4h8.5V8H16l2.4 3.6 2.6.6V15");
  });
  it("builds the photo variant from its key and falls back on a load error", async () => {
    const view = await renderMobile(<UserAvatar size={72} avatarIndex={3} avatarKey="pending/u1/original.jpg" />);
    expect(getHost(view.container, "Image").props.source).toEqual({ uri: "https://media.autotm.tm/listing-photos/pending/u1/thumbnail.webp?v=webp-natural-1" });
    await fireEvent(getHost(view.container, "Image"), "error");
    expect(queryHost(view.container, "Image")).toBeNull();
    expect(firstPath(view)).toBe("M3 15v-3.4h8.5V8H16l2.4 3.6 2.6.6V15");
  });

});
