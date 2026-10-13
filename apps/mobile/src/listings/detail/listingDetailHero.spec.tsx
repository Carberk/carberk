import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Native from "react-native";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { fireEvent, first, getHost, renderMobile, routeParams, routerMock, queryAllHosts } from "../../../test/render";
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
  preview: undefined as ListingsSchemas.ListingSummary | undefined,
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

/** A 390 dp wide screen holds a 4:3 photo frame 292.5 dp tall. */
const FRAME = { width: 390, height: 292.5 };
const HASH = "1fsDBYCIiIiHiIdweIeHh4d4cIgH";
/** ThumbHashes of covers that are not about 4:3, made with `thumbhash` 0.1.1. */
const OTHER_SHAPES = [
  ["16:9", "HggKNJpwd4dweHiIiIdwcAf3eA=="],
  ["square", "HwgKNxpwd4dwiHiHiHiIeIiHCAiIgI8I"],
  ["portrait", "H/gJNRpwd4CIiId4h3h4d3BwCPd3"],
] as const;

/** The tapped card's photos, as the loaded detail returns them. */
function cardMedia(dimensions?: { width: number; height: number }) {
  return mediaFixture(3).map((photo) => ({
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

const COVER_DETAIL = buildVariantUrl("listing-0/original.webp", "detail");
const COVER_LIST = buildVariantUrl("listing-0/original.webp", "list");

/** The first photo frame on screen, flattened to its size and its photo's fit. */
function hero(screen: Screen) {
  const frame = first(screen.getAllByTestId("listing-photo-frame"));
  const image = queryAllHosts(frame, "Image").find((node) => node.props.source?.uri === COVER_DETAIL);
  const { width, height } = [frame.props.style].flat().reduce((all, part) => ({ ...all, ...part }), {});
  return {
    frame: { width, height },
    surface: frame.props.className,
    contentFit: image?.props.contentFit,
    contentPosition: image?.props.contentPosition,
    placeholder: image?.props.placeholder,
    uri: image?.props.source.uri,
  };
}

/** What the first photo frame shows under its photo until the photo loads. */
function underlay(screen: Screen) {
  const frame = first(screen.getAllByTestId("listing-photo-frame"));
  return queryAllHosts(frame, "Image")
    .filter((node) => node.props.source?.uri !== COVER_DETAIL)
    .map((node) => ({
      source: node.props.source?.thumbhash ? "blur" : node.props.source?.uri === COVER_LIST ? "list" : node.props.source?.uri,
      contentFit: node.props.contentFit,
      contentPosition: node.props.contentPosition,
    }));
}

async function loadPhoto(screen: Screen) {
  const frame = first(screen.getAllByTestId("listing-photo-frame"));
  const photo = queryAllHosts(frame, "Image").find((node) => node.props.source?.uri === COVER_DETAIL);
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

describe("the Listing detail photo frame from tap to loaded (#864)", () => {
  it("keeps one full-width 4:3 frame, the same contain fit and the same photo when detail replaces the preview", async () => {
    const screen = await renderMobile(<ListingDetailScreen />);
    const before = hero(screen);

    await loadDetail(screen, fixture({ media: cardMedia({ width: 1600, height: 1200 }) }));
    const after = hero(screen);

    expect(before).toEqual({
      frame: FRAME,
      surface: "bg-muted",
      contentFit: "contain",
      contentPosition: "bottom",
      placeholder: undefined,
      uri: COVER_DETAIL,
    });
    expect(after).toEqual(before);
  });

  it.each([
    ["16:9", 1920, 1080],
    ["square", 1200, 1200],
    ["portrait", 900, 1600],
  ])("shows a %s photo whole, in the same frame and fit before and after detail loads", async (_shape, width, height) => {
    const screen = await renderMobile(<ListingDetailScreen />);
    const before = hero(screen);

    await loadDetail(screen, fixture({ media: cardMedia({ width, height }) }));

    expect(before).toMatchObject({ frame: FRAME, surface: "bg-muted", contentFit: "contain" });
    expect(hero(screen)).toEqual(before);
  });

  it("fills the preview frame with the cover's blurred colours until its photo loads, then shows the photo's own shape", async () => {
    state.preview = summaryFixture({ photoThumbHashes: [HASH, null] });
    const screen = await renderMobile(<ListingDetailScreen />);
    const frame = first(screen.getAllByTestId("listing-photo-frame"));
    const blur = () => queryAllHosts(frame, "Image").filter((node) => node.props.source?.thumbhash === HASH);
    expect(blur().map((node) => node.props.contentFit)).toEqual(["cover"]);

    const photo = getHost(frame, "Image", { priority: "high" });
    await fireEvent(photo, "load", { source: { url: photo.props.source.uri, width: 1067, height: 800 } });

    expect(blur()).toHaveLength(0);
  });

  it("shows an about 4:3 cover's blurred colours across the frame and the card's 3:2 crop at the centre, where that part of the photo lands", async () => {
    state.preview = summaryFixture({ photoThumbHashes: [HASH, null] });
    const screen = await renderMobile(<ListingDetailScreen />);
    const expected = [
      { source: "blur", contentFit: "cover", contentPosition: undefined },
      { source: "list", contentFit: "contain", contentPosition: undefined },
    ];
    expect(underlay(screen)).toEqual(expected);
    await loadPhoto(screen);
    expect(underlay(screen)).toEqual([]);

    await loadDetail(screen, fixture({ media: mediaWithCoverHash(HASH) }));
    expect(underlay(screen)).toEqual(expected);
    await loadPhoto(screen);
    expect(underlay(screen)).toEqual([]);
  });

  it.each(OTHER_SHAPES)("never shows the card's 3:2 crop of a %s cover: its blurred colours take its own shape, pinned as the photo is", async (_shape, hash) => {
    state.preview = summaryFixture({ photoThumbHashes: [hash, null] });
    const screen = await renderMobile(<ListingDetailScreen />);
    const expected = [{ source: "blur", contentFit: "contain", contentPosition: "bottom" }];
    expect(underlay(screen)).toEqual(expected);

    await loadDetail(screen, fixture({ media: mediaWithCoverHash(hash) }));
    expect(underlay(screen)).toEqual(expected);
    expect(hero(screen)).toMatchObject({ contentFit: "contain", contentPosition: "bottom", placeholder: undefined });
  });

  it("gives a Listing without photos the same frame, before and after detail loads", async () => {
    state.preview = summaryFixture({ photoKeys: [], coverMediaKey: undefined, photoCount: 0 });
    const screen = await renderMobile(<ListingDetailScreen />);
    expect(hero(screen).frame).toEqual(FRAME);
    expect(screen.getByText("No photos")).toBeTruthy();

    await loadDetail(screen, fixture({ media: [] }));

    expect(hero(screen).frame).toEqual(FRAME);
    expect(screen.getByText("No photos")).toBeTruthy();
  });

  it("opens a deep link on the same frame, with a Back button while it loads", async () => {
    state.preview = undefined;
    const screen = await renderMobile(<ListingDetailScreen />);

    expect(screen.getByTestId("detail-skeleton")).toBeTruthy();
    expect(hero(screen).frame).toEqual(FRAME);
    for (const placeholder of ["title-loading", "price-loading", "date-loading", "description-loading", "seller-loading"])
      expect(screen.getByTestId(placeholder, { includeHiddenElements: true })).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(routerMock.back).toHaveBeenCalledTimes(1);
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
