import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ListingsSchemas } from "@auto-tm/contracts";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import * as Linking from "expo-linking";

import { renderMobile, fireEvent, act, routeParams, routerMock } from "../../../test/render";
import ListingDetailScreen from "../../../app/(public)/listings/[id]";
import { ListingDetailView } from "../components/ListingDetail";
import { PriceDisplay } from "../components/PriceDisplay";
import { ContactCtaBar } from "../components/ContactCtaBar";
import { PhotoGallery } from "../components/PhotoGallery";
import { InspectionInterestCta } from "../components/InspectionInterestCta";
import type * as ClientModule from "../../api/client";

import type { CatalogMaps } from "./useCatalogMaps";

const state = vi.hoisted(() => ({ data: undefined as ListingsSchemas.ListingDetail | undefined,
  error: null as unknown, isPending: false, viewer: null as { userId: string } | null,
  authenticated: true as boolean | null, refetch: vi.fn(),
  config: { inspectionInterestEnabled: true, reportEntryEnabled: true }, post: vi.fn() }));
vi.mock("../../api/listings/useListingDetail", () => ({ useListingDetail: () => state }));
vi.mock("../../auth/useViewer", () => ({ useViewer: () => state.viewer }));
vi.mock("../../auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: state.authenticated }) }));
vi.mock("../../api/admin/useConfig", () => ({ useConfig: () => ({ data: state.config }) }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(async () => null), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));
vi.mock("../../api/client", async (importOriginal) => ({ ...await importOriginal<typeof ClientModule>(), apiClient: { post: state.post, get: vi.fn(), delete: vi.fn() } }));
vi.mock("expo-linking", () => ({ canOpenURL: vi.fn(async () => true), openURL: vi.fn(async () => {}) }));
vi.mock("../../admin/components/ReportSheet", () => ({ ReportSheet: () => null }));
vi.mock("./useCatalogMaps", () => ({ useCatalogMaps: () => ({ maps }) }));

const maps: CatalogMaps = {
  brandName: () => "Toyota", modelName: () => "Camry", generationName: () => "XV70",
  colorName: () => "White", bodyTypeName: () => "Sedan", transmissionName: () => "Automatic",
  driveTypeName: () => "Front wheel", engineTypeName: () => "Petrol",
  regionName: () => "Ahal", cityName: () => "Ashgabat",
};
const fixture = (updates: Partial<ListingsSchemas.ListingDetail> = {}): ListingsSchemas.ListingDetail => ({
  id: "00000000-0000-4000-8000-000000000001", publicNumber: 1,
  sellerId: "00000000-0000-4000-8000-000000000002",
  seller: { displayName: null, nameNumber: 2057, avatarIndex: 7, avatarKey: null, deleted: false, memberSince: "2026-01-01T00:00:00Z" },
  status: "active", brandId: "brand-uuid", modelId: "model-uuid", generationId: "generation-uuid", year: 2020,
  regionId: "region-uuid", cityId: "city-uuid", priceAmount: 10000, priceCurrency: "USD", displayPriceTmt: 35000,
  allowCalls: true, allowChat: true, contactPhone: "+99361000000", acceptsExchange: false,
  installmentAvailable: false, media: [], viewCount: 1, favoriteCount: 0,
  publishedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...updates,
});
beforeEach(() => {
  state.data = fixture(); state.error = null; state.isPending = false; state.viewer = null;
  state.authenticated = true; state.refetch.mockClear(); state.post.mockReset();
  state.config = { inspectionInterestEnabled: true, reportEntryEnabled: true };
  routeParams.id = state.data.id;
});

describe("PriceDisplay", () => {
  const props = { displayPriceTmt: 35000, priceAmount: 10000, priceCurrency: "USD", acceptsExchange: true, installmentAvailable: true };
  it("shows only converted TMT to buyers and the original currency to owners", () => {
    const screen = renderMobile(<PriceDisplay {...props} />);
    expect(screen.getByText("35,000 TMT")).toBeTruthy();
    expect(screen.queryByText("10,000 USD")).toBeNull();
    expect(screen.getByText("Exchange possible")).toBeTruthy();
    expect(screen.getByText("Installment possible")).toBeTruthy();
    screen.rerender(<PriceDisplay {...props} isOwner acceptsExchange={false} installmentAvailable={false} />);
    expect(screen.getByText("10,000 USD")).toBeTruthy();
    expect(screen.queryByText("Exchange possible")).toBeNull();
  });
});

describe("ContactCtaBar", () => {
  const props = { listingId: "listing-1", status: "active" as const, allowCalls: true, allowChat: true, contactPhone: "+99361000000" };
  it("calls through tel without a warning sheet", async () => {
    const screen = renderMobile(<ContactCtaBar {...props} />);
    await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Call" })); });
    expect(Linking.openURL).toHaveBeenCalledWith("tel:+99361000000");
  });
  it("disables closed contact and a favorite while identity is unknown", () => {
    state.authenticated = null;
    const screen = renderMobile(<ContactCtaBar {...props} status="sold" />);
    expect(screen.getByRole("button", { name: "Call", disabled: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Message", disabled: true })).toBeTruthy();
  });
  it("routes signed-out Message through authentication", () => {
    state.authenticated = false;
    const screen = renderMobile(<ContactCtaBar {...props} />);
    fireEvent.press(screen.getByLabelText("Message"));
    expect(routerMock.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/(auth)/phone" }));
  });
});

describe("PhotoGallery", () => {
  it("renders the no-media fallback", () => {
    expect(renderMobile(<PhotoGallery media={[]} />).getByText("No photos")).toBeTruthy();
  });
  it("opens the viewer on the gallery's cached size and falls back to the original after a load error", () => {
    const media: ListingsSchemas.ListingMedia[] = [{ id: "image-1", kind: "image", key: "listings/a.jpg", sortOrder: 0,
      variants: { thumbnail: "https://media/thumbnail.jpg", list: "https://media/list.jpg", detail: "https://media/detail.jpg", fullscreen: "https://media/fullscreen.jpg" } }];
    const screen = renderMobile(<PhotoGallery media={media} />);
    expect(screen.UNSAFE_getByType(Image).props.source.uri).toBe("https://media/detail.jpg");
    const opener = screen.UNSAFE_getAllByType(Pressable).find((node) => node.props.onPress);
    if (!opener) throw new Error("Gallery opener missing");
    fireEvent.press(opener);
    const images = screen.UNSAFE_getAllByType(Image);
    // The 2400 px size waits for a zoom (#816); the viewer's page is the last detail image.
    expect(images.some((image) => image.props.source.uri === "https://media/fullscreen.jpg")).toBe(false);
    const page = images.filter((image) => image.props.source.uri === "https://media/detail.jpg").at(-1);
    if (!page) throw new Error("Viewer page missing");
    fireEvent(page, "error");
    expect(screen.UNSAFE_getAllByType(Image).some((image) => image.props.source.uri.endsWith("/listings/a.jpg"))).toBe(true);
  });
});

describe("ListingDetailView", () => {
  it("renders catalog names, conditional specs and description without raw catalog ids", () => {
    const screen = renderMobile(<ListingDetailView listing={fixture({ mileageKm: 12000, vin: "VIN123", colorId: "color", bodyTypeId: "body", transmissionId: "transmission", driveTypeId: "drive", engineTypeId: "engine", description: "Well maintained" })} maps={maps} />);
    expect(screen.getByText("Toyota Camry XV70, 2020")).toBeTruthy();
    for (const text of ["White", "Sedan", "Automatic", "Front wheel", "Petrol", "VIN123", "Well maintained"]) expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByText("brand-uuid")).toBeNull();
    expect(screen.queryByText("model-uuid")).toBeNull();
    expect(screen.queryByText("Engine power")).toBeNull();
  });
  it.each([true, false])("shows seller-stated damage %s and known issues", (damaged) => {
    const screen = renderMobile(<ListingDetailView listing={fixture({ conditionDisclosure: { damaged, knownIssuesText: "Rust" } })} maps={maps} />);
    expect(screen.getByText("Condition, as stated by the seller")).toBeTruthy();
    expect(screen.getByText(damaged ? "Yes" : "No")).toBeTruthy();
    expect(screen.getByText("Known issues")).toBeTruthy();
    expect(screen.getByText("Rust")).toBeTruthy();
  });
  it("omits condition disclosure without an answer", () => {
    const screen = renderMobile(<ListingDetailView listing={fixture()} maps={maps} />);
    expect(screen.queryByText("Condition, as stated by the seller")).toBeNull();
    expect(screen.queryByText("Known issues")).toBeNull();
  });
  it.each(["sold", "archived"] as const)("closes buyer contact for %s, labels the photo and offers similar listings", (status) => {
    const onSeeSimilar = vi.fn(); const onReport = vi.fn();
    const screen = renderMobile(<ListingDetailView listing={fixture({ status })} maps={maps} onSeeSimilar={onSeeSimilar} onReport={onReport} />);
    expect(screen.getByText(status === "sold" ? "Sold" : "Removed from sale")).toBeTruthy();
    expect(screen.queryByText("+99361000000")).toBeNull();
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
    expect(screen.queryByText("Request an inspection")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "See other Toyota Camry" }));
    expect(onSeeSimilar).toHaveBeenCalledOnce();
    expect(screen.getByText("35,000 TMT").props.className).toContain("text-muted-foreground");
  });
  it("shows owner price and private counts rather than seller contact", () => {
    const screen = renderMobile(<ListingDetailView listing={fixture({ status: "sold" })} maps={maps} isOwner />);
    expect(screen.getByText(/Sold|sold/)).toBeTruthy();
    expect(screen.getByText("10,000 USD")).toBeTruthy();
    expect(screen.queryByText("Private seller")).toBeNull();
    expect(screen.queryByText(/views/)).toBeNull();
    expect(screen.getByText("0 saves")).toBeTruthy();
  });
});

describe("ListingDetailScreen", () => {
  it("shows loading without listing content, unavailable for 404, and retry for a hard error", () => {
    state.isPending = true;
    const screen = renderMobile(<ListingDetailScreen />);
    expect(screen.queryByText("Toyota Camry XV70, 2020")).toBeNull();
    // The skeleton stands in for the whole screen: the photo, the title block
    // and the body (specs, description, seller). Its shapes are a visual
    // detail and are not pinned here.
    expect(screen.getByTestId("detail-skeleton")).toBeTruthy();
    expect(screen.getByTestId("detail-skeleton-body")).toBeTruthy();
    const placeholders = screen.UNSAFE_getAllByType(View)
      .filter((node) => node.props.className?.split(" ").includes("bg-accent"));
    expect(placeholders.length).toBeGreaterThanOrEqual(8);
    state.isPending = false; state.error = { status: 404 };
    screen.rerender(<ListingDetailScreen />);
    expect(screen.getByText("This listing is no longer available")).toBeTruthy();
    state.error = { status: 500 };
    screen.rerender(<ListingDetailScreen />);
    fireEvent.press(screen.getByRole("button", { name: /try again|retry/i }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("shows contact only for a buyer's active listing, and filters similar navigation on closed listings", () => {
    const screen = renderMobile(<ListingDetailScreen />);
    expect(screen.getByRole("button", { name: "Call" })).toBeTruthy();
    state.data = fixture({ status: "archived" });
    screen.rerender(<ListingDetailScreen />);
    expect(screen.queryByRole("button", { name: "Call" })).toBeNull();
    expect(screen.queryByLabelText("Message")).toBeNull();
    expect(screen.queryByLabelText("Favorite")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "See other Toyota Camry" }));
    expect(routerMock.navigate).toHaveBeenCalledWith(expect.objectContaining({ params: { brandId: "brand-uuid", modelId: "model-uuid" } }));
    state.data = fixture(); state.viewer = { userId: state.data.sellerId };
    screen.rerender(<ListingDetailScreen />);
    expect(screen.queryByRole("button", { name: "Call" })).toBeNull();
    expect(screen.getByText("10,000 USD")).toBeTruthy();
  });
  it("does not open inspection interest after publishing", () => {
    state.viewer = { userId: fixture().sellerId }; routeParams.inspectionInterest = "1";
    const screen = renderMobile(<ListingDetailScreen />);
    expect(screen.queryByText("A Carberk mechanic inspection is coming soon. Register your interest to join the pilot.")).toBeNull();
  });
});

describe("InspectionInterestCta", () => {
  it("shows a submit error and allows another attempt", async () => {
    state.post.mockRejectedValueOnce(new Error("Request failed"));
    const screen = renderMobile(<InspectionInterestCta listingId="listing-1" open onOpenChange={vi.fn()} />);
    await act(async () => { fireEvent.press(screen.getByRole("button", { name: "Register interest" })); });
    expect(await screen.findByText("Something went wrong")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Register interest", disabled: false })).toBeTruthy();
    expect(screen.queryByText("Done")).toBeNull();
  });
  it("disables the entry and routes anonymous submission to sign-in", () => {
    const onOpenChange = vi.fn();
    const screen = renderMobile(<InspectionInterestCta listingId="listing-1" open={false} disabled onOpenChange={onOpenChange} />);
    fireEvent.press(screen.getByRole("button", { name: /Request Carberk inspection/ }));
    expect(onOpenChange).not.toHaveBeenCalled();
    state.authenticated = false;
    screen.rerender(<InspectionInterestCta listingId="listing-1" open onOpenChange={onOpenChange} />);
    fireEvent.press(screen.getByRole("button", { name: "Continue with phone" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(routerMock.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/(auth)/phone" }));
    expect(state.post).not.toHaveBeenCalled();
  });
  it("submits interest and shows a success state", async () => {
    state.post.mockResolvedValue({ id: "interest-1" });
    const screen = renderMobile(<InspectionInterestCta listingId="listing-1" open onOpenChange={vi.fn()} />);
    await act(async () => { fireEvent.press(screen.getByRole("button", { name: /register interest|submit/i })); });
    expect((await screen.findAllByText("Thanks, we received your interest. We'll contact you when inspections launch.")).length).toBeGreaterThan(0);
    expect(state.post).toHaveBeenCalledWith("/listings/listing-1/inspection-interest", {}, expect.anything());
  });
});
