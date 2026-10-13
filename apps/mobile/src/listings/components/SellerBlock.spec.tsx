import { Image } from "expo-image";
import { describe, expect, it } from "vitest";

import { fireEvent, first, renderMobile, getHost, queryHost, queryAllHosts } from "../../../test/render";
import { fixture } from "../../../test/fixtures/listing";

import { SellerBlock } from "./SellerBlock";

type View = Awaited<ReturnType<typeof renderMobile>>;
type Host = { type: unknown; props: Record<string, unknown>; parent: Host | null };

/** Rendered host nodes of one native type, such as the avatar's `Svg`. */
const hosts = (view: View, type: string) => queryAllHosts(view.container, type) as unknown as Host[];
const marks = (view: View) => hosts(view, "Path").map((path) => path.props.d);
const personIcons = (view: View) => hosts(view, "Icon").filter((icon) => icon.props.name === "User");
/** The native view that holds the car mark: the avatar's circle. */
function avatarCircle(view: View): Record<string, unknown> {
  let node = first(hosts(view, "Svg")).parent;
  while (node && typeof node.type !== "string") node = node.parent;
  return node?.props ?? {};
}
/** Where a text first appears in the drawn block, to compare the order of lines. */
const position = (view: View, text: string) => JSON.stringify(view.toJSON()).indexOf(JSON.stringify(text));

// The first stroke of the key, the mark for avatar index 7.
const KEY_MARK = "M11.5 12H21M17 12v3M20 12v2.4M6.5 12h.01";
const PHOTO_KEY = "avatars/u2/original.jpg";
const PHOTO_URL = "https://media.autotm.tm/listing-photos/avatars/u2/thumbnail.jpg";

/** Merdan, avatar index 7, name number 2057, no photo. */
const seller = (updates: Partial<ReturnType<typeof fixture>["seller"]> = {}) => ({ ...fixture().seller, ...updates });

it("shows real seller identity and city/place without contact-phone badges", async () => {
  const screen = await renderMobile(
    <SellerBlock
      seller={fixture().seller}
      cityName="Ashgabat"
      locationText="Parahat 7"
    />,
  );
  expect(screen.getByText("Merdan")).toBeTruthy();
  expect(screen.getByText("Private seller")).toBeTruthy();
  expect(screen.getByText("On Carberk since January 2024")).toBeTruthy();
  expect(screen.getByText("Ashgabat · Parahat 7")).toBeTruthy();
  expect(screen.queryByText(/verified|inspection|dealer/i)).toBeNull();
  await screen.rerender(
    <SellerBlock seller={{ ...fixture().seller, displayName: " " }} />,
  );
  expect(screen.getByText("Driver 2057")).toBeTruthy();
  expect(screen.getByText("Private seller")).toBeTruthy();
  expect(screen.queryByText("Ashgabat · Parahat 7")).toBeNull();
});

describe("SellerBlock name", () => {
  it("puts the name first, Private seller under it, then the join month", async () => {
    const view = await renderMobile(<SellerBlock seller={seller()} />);
    expect(position(view, "Merdan")).toBeGreaterThan(-1);
    expect(position(view, "Merdan")).toBeLessThan(position(view, "Private seller"));
    expect(position(view, "Private seller")).toBeLessThan(position(view, "On Carberk since January 2024"));
  });

  it.each([
    ["en", "Driver 2057", "Private seller"],
    ["ru", "Водитель 2057", "Частный продавец"],
    ["tk", "Sürüji 2057", "Şahsy satyjy"],
  ])("titles a seller without a name of their own with the generated name in %s", async (locale, name, role) => {
    const view = await renderMobile(<SellerBlock seller={seller({ displayName: null })} />, { locale });
    expect(position(view, name)).toBeGreaterThan(-1);
    expect(position(view, name)).toBeLessThan(position(view, role));
    // The role is the second line only; it no longer stands in for the name.
    expect(view.getAllByText(role)).toHaveLength(1);
  });

  it.each([
    ["en", "Abdyrahman Gurbanguly Atamyrad"],
    ["ru", "Абдырахман Гурбангулыев Атамыр"],
    ["tk", "Abdyrahman Gurbangulyýew Çaryý"],
  ])("keeps a 30-character name on one line that ends in an ellipsis in %s", async (locale, name) => {
    expect(name).toHaveLength(30);
    const view = await renderMobile(<SellerBlock seller={seller({ displayName: name })} />, { locale });
    expect(view.getByText(name).props).toMatchObject({ numberOfLines: 1, ellipsizeMode: "tail" });
  });
});

describe("SellerBlock avatar", () => {
  it("draws the seller's car mark at 44 points when they have no photo", async () => {
    const view = await renderMobile(<SellerBlock seller={seller()} />);
    expect(marks(view)[0]).toBe(KEY_MARK);
    expect(avatarCircle(view).style).toMatchObject({ width: 44, height: 44 });
    expect(personIcons(view)).toHaveLength(0);
    expect(queryHost(view.container, "Image")).toBeNull();
  });

  it("shows the seller's photo at 44 points instead of the car mark", async () => {
    const view = await renderMobile(<SellerBlock seller={seller({ avatarKey: PHOTO_KEY })} />);
    const photo = getHost(view.container, "Image");
    expect(photo.props.source).toEqual({ uri: PHOTO_URL });
    expect(photo.props.style).toMatchObject({ width: 44, height: 44 });
    expect(hosts(view, "Svg")).toHaveLength(0);
  });

  it("goes back to the car mark when the photo does not load", async () => {
    const view = await renderMobile(<SellerBlock seller={seller({ avatarKey: PHOTO_KEY })} />);
    await fireEvent(getHost(view.container, "Image"), "error");
    expect(queryHost(view.container, "Image")).toBeNull();
    expect(marks(view)[0]).toBe(KEY_MARK);
  });

  it("is not read on its own: a screen reader hears the name once", async () => {
    const view = await renderMobile(<SellerBlock seller={seller()} />);
    expect(view.getAllByText("Merdan")).toHaveLength(1);
    expect(view.queryByRole("image")).toBeNull();
    expect(view.queryByLabelText("Merdan")).toBeNull();
    expect(avatarCircle(view)).toMatchObject({
      accessible: false, accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants",
    });
  });
});

describe("SellerBlock for a deleted seller", () => {
  it("keeps Private seller as the only name and shows the person icon, not a car", async () => {
    const view = await renderMobile(<SellerBlock seller={seller({ displayName: null, deleted: true })} />);
    expect(view.getAllByText("Private seller")).toHaveLength(1);
    expect(view.queryByText("Driver 2057")).toBeNull();
    expect(personIcons(view)).toHaveLength(1);
    expect(hosts(view, "Svg")).toHaveLength(0);
  });
});
