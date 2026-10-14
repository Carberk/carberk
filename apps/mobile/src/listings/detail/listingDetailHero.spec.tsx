import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Native from "react-native";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { fireEvent, first, getHost, renderMobile, routeParams, routerMock, queryAllHosts, within } from "../../../test/render";
import ListingDetailScreen from "../../../app/(public)/listings/[id]";
import {
  fixture,
  maps,
  mediaFixture,
  summaryFixture,
} from "../../../test/fixtures/listing";

import { buildVariantUrl } from "./buildVariantUrl";

const device = vi.hoisted(() => ({ width: 390, height: 844, fontScale: 1 }));
const state = vi.hoisted(() => ({
  data: undefined as ListingsSchemas.ListingDetail | undefined,
  preview: undefined as (ListingsSchemas.ListingSummary & { galleryKeys?: string[] }) | undefined,
  isPending: true,
}));

vi.mock("react-native", async (original) => ({
  ...await original<typeof Native>(),
  useWindowDimensions: () => ({ ...device, scale: 3 }),
}));
vi.mock("../../api/listings/useListingDetail", () => ({
  useListingDetail: () => ({
    data: state.data,
    error: null,
    isPending: state.isPending,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../api/listings/useListingPreview", () => ({
  useListingPreview: () => state.preview,
}));
vi.mock("../../auth/useViewer", () => ({ useViewer: () => null }));
vi.mock("../../auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("../../api/admin/useConfig", () => ({ useConfig: () => ({ data: {} }) }));
vi.mock("./useCatalogMaps", () => ({ useCatalogMaps: () => ({ maps }) }));
vi.mock("../feed/useFeedCatalogMaps", () => ({
  useFeedCatalogMaps: () => ({
    brandName: () => "Toyota",
    modelName: () => "Camry",
    cityName: () => "Ashgabat",
    namesPending: false,
  }),
}));
vi.mock("../../api/catalog/useTransmissions", () => ({
  useTransmissions: () => ({ data: { items: [{ id: "transmission", name: "Automatic" }] } }),
}));
vi.mock("../../api/catalog/useEngineTypes", () => ({
  useEngineTypes: () => ({ data: { items: [{ id: "engine", name: "Petrol" }] } }),
}));
vi.mock("../../api/catalog/useDriveTypes", () => ({
  useDriveTypes: () => ({ data: { items: [{ id: "drive", name: "Front wheel" }] } }),
}));
vi.mock("../../api/catalog/useBodyTypes", () => ({
  useBodyTypes: () => ({ data: { items: [{ id: "body", name: "Sedan" }] } }),
}));
vi.mock("../../api/catalog/useColors", () => ({
  useColors: () => ({ data: { items: [{ id: "color", name: "White" }] } }),
}));

type Screen = Awaited<ReturnType<typeof renderMobile>>;
type Node = ReturnType<Screen["getByTestId"]>;

/**
 * On a 390 dp wide screen every tile is 390 - 16 - 16 = 358 dp wide and
 * 358 x 3/4 = 268.5 dp tall; one swipe moves one tile and its 2 dp seam.
 */
const TILE = { width: 358, height: 268.5 };
const HASH = "1fsDBYCIiIiHiIdweIeHh4d4cIgH";

/** The tapped card's photos, as the loaded detail returns them. */
function cardMedia(dimensions?: { width: number; height: number }, count = 3) {
  return mediaFixture(count).map((photo) => ({
    ...photo,
    ...dimensions,
    variants: {
      thumbnail: buildVariantUrl(photo.key, "thumbnail"),
      list: buildVariantUrl(photo.key, "list"),
      detail: buildVariantUrl(photo.key, "detail"),
      fullscreen: buildVariantUrl(photo.key, "fullscreen"),
    },
  }));
}

/** The `detail` size the Results card strip loads for the cover (`ListingPhotoStrip`). */
const COVER_DETAIL = buildVariantUrl("listing-0/original.webp", "detail");
const COVER_LIST = buildVariantUrl("listing-0/original.webp", "list");

const styleOf = (node: Node): Record<string, unknown> =>
  [node.props.style].flat(Infinity).reduce((all, part) => ({ ...all, ...part }), {});

/** The rounded ends a tile's classes give it. */
const endsOf = (node: Node) => String(node.props.className).split(" ").filter((name) => /^rounded-(l-|r-)?xl$/.test(name));

/** The photo tiles of the strip, photo or still loading. */
const tilesOf = (screen: Screen) => screen.getAllByTestId(/^listing-photo-tile/, { includeHiddenElements: true });

/**
 * The top of Listing detail, flattened: whether the header row floats over
 * the page, the strip's offset, snapping and padding, every tile's size and
 * rounded ends, and how the cover photo is drawn.
 */
function top(screen: Screen) {
  const header = screen.getByTestId("detail-header");
  const photos = screen.getByTestId("detail-photos");
  const strip = queryAllHosts(photos, "RCTScrollView")[0];
  const cover = queryAllHosts(photos, "Image").find((node) => node.props.source?.uri === COVER_DETAIL);
  return {
    header: {
      floating: String(header.props.className).split(" ").includes("absolute"),
      surface: String(header.props.className).split(" ").includes("bg-background"),
    },
    photos: styleOf(photos),
    strip: strip && {
      snapToInterval: strip.props.snapToInterval,
      content: strip.props.contentContainerStyle,
      scrollEnabled: strip.props.scrollEnabled,
    },
    tiles: tilesOf(screen).map((tile) => {
      const { width, height } = styleOf(tile);
      return { width, height, ends: endsOf(tile) };
    }),
    cover: cover && {
      contentFit: cover.props.contentFit,
      contentPosition: cover.props.contentPosition,
      placeholder: cover.props.placeholder,
      priority: cover.props.priority,
      cachePolicy: cover.props.cachePolicy,
    },
  };
}

/** What the first tile shows under its photo until the photo loads. */
function underlay(screen: Screen) {
  return queryAllHosts(first(tilesOf(screen)), "Image")
    .filter((node) => node.props.source?.uri !== COVER_DETAIL)
    .map((node) => ({
      source: node.props.source?.thumbhash ? "blur" : node.props.source?.uri === COVER_LIST ? "list" : node.props.source?.uri,
      contentFit: node.props.contentFit,
    }));
}

async function loadCover(screen: Screen) {
  const photo = queryAllHosts(first(tilesOf(screen)), "Image").find((node) => node.props.source?.uri === COVER_DETAIL);
  if (!photo) throw new Error("no cover photo");
  await fireEvent(photo, "load", { source: { url: COVER_DETAIL, width: 1200, height: 900 } });
}

/** The loaded detail's media, its cover carrying `thumbHash`. */
function mediaWithCoverHash(thumbHash: string) {
  return cardMedia().map((photo, index) => (index === 0 ? { ...photo, thumbHash } : photo));
}

/** Each Specifications cell and row, in order, as its testID and layout class. */
function specLayout(screen: Screen) {
  return screen.container
    .queryAll((node) => typeof node.type === "string"
      && typeof node.props.testID === "string" && /^spec-(cell|row)/.test(node.props.testID))
    .map((node) => `${node.props.testID.replace(/-loading$/, "")} ${node.props.className}`);
}

async function loadDetail(screen: Screen, data: ListingsSchemas.ListingDetail) {
  state.isPending = false;
  state.data = data;
  await screen.rerender(<ListingDetailScreen />);
}

beforeEach(() => {
  Object.assign(device, { width: 390, height: 844, fontScale: 1 });
  state.data = undefined;
  state.preview = summaryFixture();
  state.isPending = true;
  routeParams.id = fixture().id;
});

describe("the Listing detail photo strip from tap to loaded (#864)", () => {
  it("keeps the plain header row and the inset 4:3 strip, cover-fit on the card's photo, when detail replaces the preview", async () => {
    state.preview = summaryFixture({ photoCount: 3 });
    const screen = await renderMobile(<ListingDetailScreen />);
    const before = top(screen);

    await loadDetail(screen, fixture({ media: cardMedia({ width: 1600, height: 1200 }) }));

    expect(before).toEqual({
      header: { floating: false, surface: true },
      photos: { paddingTop: 8 },
      strip: { snapToInterval: TILE.width + 2, content: { paddingHorizontal: 16 }, scrollEnabled: true },
      tiles: [
        { ...TILE, ends: ["rounded-l-xl"] },
        { ...TILE, ends: [] },
        { ...TILE, ends: ["rounded-r-xl"] },
      ],
      // The card loaded this size at cover 4:3, so it paints from memory at once (#816).
      cover: { contentFit: "cover", contentPosition: undefined, placeholder: undefined, priority: "high", cachePolicy: "memory-disk" },
    });
    expect(top(screen)).toEqual(before);
  });

  it.each([
    ["16:9", 1920, 1080],
    ["square", 1200, 1200],
    ["portrait", 900, 1600],
  ])("cover-fits a %s photo into its 4:3 tile before and after detail loads, and the viewer still shows it whole", async (_shape, width, height) => {
    const screen = await renderMobile(<ListingDetailScreen />);
    const before = top(screen).cover;

    await loadDetail(screen, fixture({ media: cardMedia({ width, height }) }));

    expect(before).toMatchObject({ contentFit: "cover" });
    expect(top(screen).cover).toEqual(before);
    await fireEvent.press(screen.getByRole("button", { name: "Photo 1 of 3" }));
    const viewer = getHost(screen.container, "Modal");
    const page = queryAllHosts(viewer, "Image").find((node) => node.props.source?.uri === COVER_DETAIL);
    expect(page?.props.contentFit).toBe("contain");
  });

  it("shows a cover's blurred colours under its tile, cover-fit, until the photo loads, and never the card's 3:2 crop", async () => {
    state.preview = summaryFixture({ photoThumbHashes: [HASH, null] });
    const screen = await renderMobile(<ListingDetailScreen />);
    expect(underlay(screen)).toEqual([{ source: "blur", contentFit: "cover" }]);
    await loadCover(screen);
    expect(underlay(screen)).toEqual([]);

    await loadDetail(screen, fixture({ media: mediaWithCoverHash(HASH) }));
    expect(underlay(screen)).toEqual([{ source: "blur", contentFit: "cover" }]);
    await loadCover(screen);
    expect(underlay(screen)).toEqual([]);
  });

  it("shows every photo the card knows, and holds the rest of the Listing's photos as grey tiles", async () => {
    state.preview = {
      ...summaryFixture({ photoCount: 4 }),
      galleryKeys: ["listing-0/original.webp", "listing-1/original.webp", "listing-2/original.webp"],
    };
    const screen = await renderMobile(<ListingDetailScreen />);

    expect(tilesOf(screen).map((tile) => tile.props.testID)).toEqual([
      "listing-photo-tile", "listing-photo-tile", "listing-photo-tile", "listing-photo-tile-pending",
    ]);
  });

  it("shows no photo counter on detail, while each photo is still read as Photo n of N", async () => {
    const screen = await renderMobile(<ListingDetailScreen />);
    expect(screen.queryByText(/^\d+ \/ \d+$/)).toBeNull();
    expect(screen.getByLabelText("Photo 1 of 12")).toBeTruthy();

    await loadDetail(screen, fixture({ media: cardMedia() }));

    expect(screen.queryByText(/^\d+ \/ \d+$/)).toBeNull();
    expect(screen.getByRole("button", { name: "Photo 1 of 3" })).toBeTruthy();
  });

  it("gives one photo one tile from margin to margin that does not scroll, before and after detail loads", async () => {
    state.preview = summaryFixture({ photoKeys: ["listing-0/original.webp"], photoCount: 1 });
    const screen = await renderMobile(<ListingDetailScreen />);
    const before = top(screen);

    await loadDetail(screen, fixture({ media: cardMedia(undefined, 1) }));

    expect(before.tiles).toEqual([{ ...TILE, ends: ["rounded-xl"] }]);
    expect(before.strip?.scrollEnabled).toBe(false);
    expect(top(screen)).toEqual(before);
  });

  it("gives a Listing without photos the same grey tile saying No photos, before and after detail loads", async () => {
    state.preview = summaryFixture({ photoKeys: [], coverMediaKey: undefined, photoCount: 0 });
    const screen = await renderMobile(<ListingDetailScreen />);
    const before = top(screen);
    expect(before.tiles).toEqual([{ ...TILE, ends: ["rounded-xl"] }]);
    expect(first(tilesOf(screen)).props.className).toContain("bg-muted");
    expect(within(first(tilesOf(screen))).getByText("No photos")).toBeTruthy();

    await loadDetail(screen, fixture({ media: [] }));

    expect(top(screen)).toEqual(before);
    expect(within(first(tilesOf(screen))).getByText("No photos")).toBeTruthy();
  });

  it.each([
    ["sold", "Sold"],
    ["archived", "Removed from sale"],
  ] as const)("runs the %s banner across the bottom of each tile, inside its rounded corners", async (status, label) => {
    state.preview = summaryFixture({ status, photoCount: 3 });
    const screen = await renderMobile(<ListingDetailScreen />);
    const banners = () => tilesOf(screen).map((tile) => within(tile).queryAllByText(label, { includeHiddenElements: true }).length);
    expect(banners()).toEqual([1, 1, 1]);

    await loadDetail(screen, fixture({ status, media: cardMedia() }));

    expect(banners()).toEqual([1, 1, 1]);
    // A screen reader hears the status with the photo, after "Photo n of N".
    expect(screen.getByRole("button", { name: "Photo 1 of 3" }).props.accessibilityValue).toEqual({ text: label });
  });

  it("sets every section 16 dp from the screen edges, as the photos are", async () => {
    const screen = await renderMobile(<ListingDetailScreen />);
    expect(screen.getByTestId("detail-body").props.className.split(" ")).toContain("px-4");

    await loadDetail(screen, fixture({ media: cardMedia() }));
    expect(screen.getByTestId("detail-body").props.className.split(" ")).toContain("px-4");

    state.preview = undefined;
    state.isPending = true;
    state.data = undefined;
    await screen.rerender(<ListingDetailScreen />);
    expect(screen.getByTestId("detail-body").props.className.split(" ")).toContain("px-4");
  });

  it("draws the header's hairline only once scrolled, and its price and title once the photos have scrolled away", async () => {
    const screen = await renderMobile(<ListingDetailScreen />);
    await loadDetail(screen, fixture({ media: cardMedia() }));
    const header = () => screen.getByTestId("detail-header");
    // The page's own scroll view holds the strip's, so it comes first.
    const page = first(queryAllHosts(screen.container, "RCTScrollView"));
    const hairline = () => String(header().props.className).split(" ").includes("border-border");
    expect(hairline()).toBe(false);

    await fireEvent.scroll(page, { nativeEvent: { contentOffset: { x: 0, y: 1 } } });
    expect(hairline()).toBe(true);
    expect(within(header()).queryByText("35,000 TMT")).toBeNull();

    // The photos end 8 + 268.5 dp down the page.
    await fireEvent.scroll(page, { nativeEvent: { contentOffset: { x: 0, y: 277 } } });
    expect(within(header()).getByText("35,000 TMT")).toBeTruthy();
  });

  it("opens a deep link on the loaded top: the header row with a working Back, one grey tile, then title, price and date", async () => {
    state.preview = undefined;
    const screen = await renderMobile(<ListingDetailScreen />);

    expect(screen.getByTestId("detail-skeleton")).toBeTruthy();
    const skeleton = top(screen);
    expect(skeleton).toMatchObject({
      header: { floating: false, surface: true },
      photos: { paddingTop: 8 },
      tiles: [{ ...TILE, ends: ["rounded-xl"] }],
    });
    for (const placeholder of ["title-loading", "price-loading", "date-loading", "description-loading", "seller-loading"])
      expect(screen.getByTestId(placeholder, { includeHiddenElements: true })).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(routerMock.back).toHaveBeenCalledTimes(1);

    await loadDetail(screen, fixture({ media: cardMedia(undefined, 1) }));
    expect(top(screen)).toMatchObject({ header: skeleton.header, photos: skeleton.photos, tiles: skeleton.tiles });
  });
});

describe("loading placeholders in the loaded detail's shape (#864)", () => {
  const complete = () => fixture({
    media: cardMedia(),
    mileageKm: 12000,
    transmissionId: "transmission",
    engineTypeId: "engine",
    enginePower: 150,
    driveTypeId: "drive",
    condition: "used",
    bodyTypeId: "body",
    colorId: "color",
  });

  it("puts what the card knows in its final Specifications cells, and holds the rest as placeholders", async () => {
    const screen = await renderMobile(<ListingDetailScreen />);

    expect(screen.queryByText("12,000 km · Automatic · Petrol")).toBeNull();
    expect(screen.getByText("Specifications")).toBeTruthy();
    for (const [label, value] of [
      ["Year", "2020"],
      ["Mileage", "12,000 km"],
      ["Transmission", "Automatic"],
      ["Engine type", "Petrol"],
      ["Condition", "Used"],
    ] as const) {
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByText(value)).toBeTruthy();
    }
    // Power and drive are not on the card: placeholders, never invented values.
    expect(screen.getAllByTestId("spec-cell-loading")).toHaveLength(2);
    expect(screen.queryByText("Power")).toBeNull();
  });

  it.each([
    ["the card preview", "three columns", 1, "w-1/3"],
    ["the card preview", "two columns at a large font size", 1.3, "w-1/2"],
    ["a deep link", "three columns", 1, "w-1/3"],
    ["a deep link", "two columns at a large font size", 1.3, "w-1/2"],
  ])("lays %s's placeholder grid out as the loaded grid: %s", async (entry, _name, fontScale, column) => {
    device.fontScale = fontScale;
    if (entry === "a deep link") state.preview = undefined;
    const screen = await renderMobile(<ListingDetailScreen />);
    const loading = specLayout(screen);

    await loadDetail(screen, complete());
    const loaded = specLayout(screen);

    expect(loading).toEqual(loaded);
    expect(loaded.filter((cell) => cell.startsWith("spec-cell"))).toHaveLength(6);
    expect(loaded[0]).toContain(column);
  });

  it("gives a deep link the same Specifications grid, all placeholders", async () => {
    state.preview = undefined;
    const screen = await renderMobile(<ListingDetailScreen />);
    const loading = specLayout(screen);
    expect(screen.getAllByTestId("spec-cell-loading")).toHaveLength(6);
    expect(screen.getAllByTestId("spec-row-loading")).toHaveLength(3);

    await loadDetail(screen, complete());

    expect(loading).toEqual(specLayout(screen));
  });
});

describe("a card summary that carries the preview's fields (#867)", () => {
  /** Every Specifications entry, as its layout and what it shows, or "loading". */
  function specEntries(screen: Screen) {
    return screen.container
      .queryAll((node) => typeof node.type === "string"
        && typeof node.props.testID === "string" && /^spec-(cell|row)/.test(node.props.testID))
      .map((node) => {
        const loading = node.props.testID.endsWith("-loading");
        const texts = queryAllHosts(node, "Text").flatMap((text) => [text.props.children].flat()).join(" ");
        return `${node.props.testID.replace(/-loading$/, "")} ${node.props.className} ${loading ? "loading" : texts}`;
      });
  }
  /** The badges under the price and the contact buttons on screen. */
  function chrome(screen: Screen) {
    return {
      badges: ["Exchange possible", "Installment possible"].filter((badge) => screen.queryByText(badge)),
      contact: ["Call", "Message"].filter((name) => screen.queryAllByRole("button", { name }).length > 0),
    };
  }

  it.each([
    [
      "a complete Listing",
      { enginePower: 150, driveTypeId: "drive", bodyTypeId: "body", colorId: "color", hasVin: false,
        acceptsExchange: true, installmentAvailable: false, allowCalls: false, allowChat: true },
      { enginePower: 150, driveTypeId: "drive", bodyTypeId: "body", colorId: "color",
        acceptsExchange: true, installmentAvailable: false, allowCalls: false, allowChat: true },
    ],
    [
      "a sparse Listing",
      { hasVin: false, acceptsExchange: false, installmentAvailable: true, allowCalls: true, allowChat: true },
      { acceptsExchange: false, installmentAvailable: true, allowCalls: true, allowChat: true },
    ],
    [
      "a Listing that takes calls but has no contact phone",
      { hasVin: false, allowCalls: true, allowChat: true, hasContactPhone: false },
      { allowCalls: true, allowChat: true, contactPhone: undefined },
    ],
  ] as const)("keeps every Specifications entry, badge and contact button in place when detail loads: %s", async (_name, card, detail) => {
    state.preview = summaryFixture(card);
    const screen = await renderMobile(<ListingDetailScreen />);
    const before = { specs: specEntries(screen), ...chrome(screen) };

    await loadDetail(screen, fixture({
      media: cardMedia(), mileageKm: 12000, transmissionId: "transmission", engineTypeId: "engine", condition: "used", ...detail,
    }));

    expect(before).toEqual({ specs: specEntries(screen), ...chrome(screen) });
  });

  it("holds a VIN row only for a Listing that has a VIN, and never shows the VIN before detail", async () => {
    state.preview = summaryFixture({ hasVin: true, enginePower: 150, driveTypeId: "drive", bodyTypeId: "body", colorId: "color" });
    const screen = await renderMobile(<ListingDetailScreen />);
    const loading = specLayout(screen);
    expect(screen.getAllByTestId("spec-row-loading")).toHaveLength(1);

    await loadDetail(screen, fixture({
      media: cardMedia(), mileageKm: 12000, transmissionId: "transmission", engineTypeId: "engine", condition: "used",
      enginePower: 150, driveTypeId: "drive", bodyTypeId: "body", colorId: "color", vin: "JTDKB20U793456789",
    }));

    expect(specLayout(screen)).toEqual(loading);
    expect(screen.getByText("JTDKB20U793456789")).toBeTruthy();
  });
});
