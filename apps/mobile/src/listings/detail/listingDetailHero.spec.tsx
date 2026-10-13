import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Native from "react-native";
import type { ListingsSchemas } from "@auto-tm/contracts";

import { fireEvent, renderMobile, routeParams, routerMock, getAllHosts } from "../../../test/render";
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
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock("expo-linking", () => ({
  canOpenURL: vi.fn(async () => true),
  openURL: vi.fn(async () => {}),
}));
vi.mock("@/components/ui/skeleton", async () => ({
  Skeleton: (await import("react-native")).View,
}));
vi.mock("../../admin/components/ReportSheet", () => ({ ReportSheet: () => null }));
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

type Screen = Awaited<ReturnType<typeof renderMobile>>;

/** A 390 dp wide screen holds a 4:3 photo frame 292.5 dp tall. */
const FRAME = { width: 390, height: 292.5 };

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

/** The first photo frame on screen, flattened to its size and fit. */
function hero(screen: Screen) {
  const frame = screen.getAllByTestId("listing-photo-frame")[0]!;
  const image = getAllHosts(frame, "Image").find((node) => "uri" in (node.props.source ?? {}));
  const { width, height } = [frame.props.style].flat().reduce((all, part) => ({ ...all, ...part }), {});
  return {
    frame: { width, height },
    contentFit: image?.props.contentFit,
    placeholderContentFit: image?.props.placeholderContentFit,
    uri: image?.props.source.uri,
  };
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
      contentFit: "contain",
      placeholderContentFit: "contain",
      uri: buildVariantUrl("listing-0/original.webp", "detail"),
    });
    expect(after).toEqual(before);
  });

  it.each([
    ["16:9", 1920, 1080],
    ["square", 1200, 1200],
    ["portrait", 900, 1600],
  ])("shows a %s photo whole inside the same frame", async (_shape, width, height) => {
    const screen = await renderMobile(<ListingDetailScreen />);
    await loadDetail(screen, fixture({ media: cardMedia({ width, height }) }));

    expect(hero(screen)).toMatchObject({ frame: FRAME, contentFit: "contain" });
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
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByText(value)).toBeTruthy();
    }
    // Power and drive are not on the card: placeholders, never invented values.
    expect(screen.getAllByTestId("spec-cell-loading")).toHaveLength(2);
    expect(screen.queryByText("Power")).toBeNull();
  });

  it.each([
    ["three columns", 1, "w-1/3"],
    ["two columns at a large font size", 1.3, "w-1/2"],
  ])("lays the placeholder grid out as the loaded grid: %s", async (_name, fontScale, column) => {
    device.fontScale = fontScale;
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
