import type { ListingsSchemas } from "@auto-tm/contracts";
import * as Linking from "expo-linking";
import { StyleSheet } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile, fireEvent, act } from "../../../test/render";
import { useAuthIntentStore } from "../../auth/intentStore";
import { queryKeys } from "../../api/queryKeys";

import { ListingLargeCard, ListingLargeCardSkeleton, formatListingDate } from "./ListingLargeCard";
import { STRIP_GAP, stripTiles } from "./ListingPhotoStrip";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../../api/client", () => ({ apiClient: { get: api.get, post: vi.fn(), delete: vi.fn() }, ApiError: class ApiError extends Error {} }));
const conversation = vi.hoisted(() => ({ open: vi.fn(), retry: vi.fn(), isPending: false, error: null as unknown }));
vi.mock("../../conversations/useOpenListingConversation", () => ({
  useOpenListingConversation: (listingId: string) => ({ ...conversation, open: () => conversation.open(listingId) }),
}));

const listing: ListingsSchemas.ListingSummary = { id: "listing", sellerId: "seller", status: "active", brandId: "brand", modelId: "model", year: 2018, priceAmount: 2, priceCurrency: "USD", displayPriceTmt: 70000, photoKeys: ["one.jpg", "two.jpg"], photoCount: 7, cityId: "city", publishedAt: "2026-09-30T04:00:00.000Z" };
/** A feed item as the current API sends it: the gallery, contact preferences and the seller's name. */
const feedItem: ListingsSchemas.FeedListingSummary = { ...listing, galleryKeys: ["one.jpg", "two.jpg"], photoCount: 2, allowCalls: true, allowChat: true, seller: { displayName: "Aman Durdyýew", nameNumber: 4821, deleted: false } };
const returnTo = "/(tabs)/(search)/results" as const;

function renderCard(item: ListingsSchemas.ListingSummary, { isAuthenticated = false as boolean | null, viewerId = null as string | null, locale = "en" } = {}) {
  const onPress = vi.fn();
  const view = renderMobile(<ListingLargeCard listing={item} brandName="Toyota" modelName="Camry" cityName="Ashgabat" isAuthenticated={isAuthenticated} viewerId={viewerId} returnTo={returnTo} onPress={onPress} />, { locale });
  return { view, onPress };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  useAuthIntentStore.setState({ intent: null, replayAction: null, replayReturnTo: null });
  api.get.mockReset(); conversation.open.mockReset(); conversation.error = null; conversation.isPending = false;
  vi.mocked(Linking.canOpenURL).mockResolvedValue(true); vi.mocked(Linking.openURL).mockClear();
});
afterEach(() => vi.useRealTimers());

describe("Large Listing card", () => {
  it("shows the photo strip, TMT price, spec line, one-line title and city/date", () => {
    const onPress = vi.fn();
    const view = renderMobile(<ListingLargeCard listing={{ ...listing, mileageKm: 0 }} brandName="Toyota" modelName="Camry" cityName="Ashgabat" transmissionName="Automatic" engineTypeName="Petrol" isAuthenticated={false} returnTo={returnTo} onPress={onPress} />);
    expect(view.getAllByTestId("listing-photo")).toHaveLength(2); expect(view.getByLabelText("Photos: 7")).toBeTruthy();
    expect(view.getByText("70,000 TMT")).toBeTruthy(); expect(view.queryByText(/USD/)).toBeNull();
    expect(view.getByText("Toyota Camry, 2018").props.numberOfLines).toBe(1);
    expect(view.getByText("0 km · Automatic · Petrol")).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: /Toyota Camry, 2018/ })); expect(onPress).toHaveBeenCalledWith("listing");
    fireEvent.press(view.getByRole("button", { name: "Favorite" })); expect(useAuthIntentStore.getState().intent).toEqual({ returnTo, action: { kind: "favorite", listingId: "listing" } });
  });
  it.each([["en", "Photos: 2"], ["ru", "Фото: 2"], ["tk", "Suratlar: 2"]])("names the photo count without plural-dependent words in %s", (locale, label) => {
    const view = renderMobile(<ListingLargeCard listing={{ ...listing, photoCount: 2 }} isAuthenticated={false} returnTo={returnTo} onPress={vi.fn()} />, { locale });
    expect(view.getByLabelText(label)).toBeTruthy();
  });
  it("drops absent spec parts without separators or UUID placeholders", () => {
    const view = renderMobile(<ListingLargeCard listing={listing} brandName="Toyota" modelName="Camry" engineTypeName="Petrol" isAuthenticated={null} returnTo={returnTo} onPress={vi.fn()} />);
    expect(view.getByText("Petrol")).toBeTruthy(); expect(view.queryByText(/undefined|null| · Petrol/)).toBeNull();
    expect(view.queryByText(/Phone verified/)).toBeNull();
  });
  it("shows a single full-width photo, with no strip and no count, for a one-photo Listing", () => {
    const view = renderMobile(<ListingLargeCard listing={{ ...listing, photoKeys: ["one.jpg"], photoCount: 1 }} isAuthenticated={false} returnTo={returnTo} onPress={vi.fn()} />);
    expect(view.getAllByTestId("listing-photo")).toHaveLength(1); expect(view.queryByTestId("listing-photo-strip")).toBeNull();
    expect(view.queryByText(/No photo/)).toBeNull(); expect(view.queryByLabelText(/Photos:/)).toBeNull();
  });
  it("shows one No photos frame and no count when the Listing has no photos", () => {
    const view = renderMobile(<ListingLargeCard listing={{ ...listing, photoKeys: [], photoCount: 0 }} isAuthenticated={false} returnTo={returnTo} onPress={vi.fn()} />);
    expect(view.getAllByTestId("listing-photo")).toHaveLength(1); expect(view.getByText("No photos")).toBeTruthy();
    expect(view.queryByLabelText(/Photos:/)).toBeNull();
  });
  it("shows a single photo skeleton in the strip's place", () => {
    const view = renderMobile(<ListingLargeCardSkeleton />);
    expect(view.getAllByTestId("listing-photo-skeleton")).toHaveLength(1);
  });
  it.each([["2026-09-30T12:00:00Z", "Today"], ["2026-09-29T12:00:00Z", "Yesterday"], ["2026-09-12T12:00:00Z", "12 Sep"], ["2025-03-03T12:00:00Z", "3 Mar 2025"]])("formats publication %s as %s", (date, expected) => {
    const view = renderMobile(<ListingLargeCard listing={{ ...listing, publishedAt: date }} cityName="Ashgabat" isAuthenticated={false} returnTo={returnTo} onPress={vi.fn()} />);
    expect(view.getByText(`Ashgabat · ${expected}`)).toBeTruthy();
    expect(formatListingDate(date, "en", (key) => ({ resultsToday: "Today", resultsYesterday: "Yesterday" })[key] ?? key, new Date("2026-09-30T12:00:00Z"))).toBe(expected);
  });
  it("says New on the photos only when the seller stated a new car", () => {
    expect(renderCard({ ...listing, condition: "new" }).view.getByText("New")).toBeTruthy();
    expect(renderCard({ ...listing, condition: "used" }).view.queryByText("New")).toBeNull();
  });
});

describe("Results photo strip", () => {
  it.each([1, 2, 5, 8])("shows all %i gallery photos in the seller's order", (length) => {
    const keys = Array.from({ length }, (_, index) => `photo-${index}.jpg`);
    const { view } = renderCard({ ...feedItem, galleryKeys: keys, photoCount: length });
    const frames = view.getAllByTestId("listing-photo");
    expect(frames).toHaveLength(length);
    expect(view.queryByTestId("listing-photo-more")).toBeNull();
    expect(view.queryByTestId("listing-photo-strip") === null).toBe(length === 1);
  });
  it("snaps one photo per swipe, at a photo's width plus the seam, without stealing the vertical scroll", () => {
    const { view } = renderCard({ ...feedItem, galleryKeys: ["a.jpg", "b.jpg", "c.jpg"], photoCount: 3 });
    const strip = view.getByTestId("listing-photo-strip");
    const width = StyleSheet.flatten(view.getAllByTestId("listing-photo")[0]?.props.style).width as number;
    expect(strip.props.horizontal).toBe(true);
    expect(strip.props.snapToInterval).toBe(width + STRIP_GAP);
    expect(strip.props.decelerationRate).toBe("fast");
    expect(strip.props.disableIntervalMomentum).toBe(true);
    expect(strip.props.nestedScrollEnabled).toBe(true);
  });
  it("ends with a +N photos tile when the Listing has more photos than keys, and the tile opens the Listing", () => {
    const { view, onPress } = renderCard({ ...feedItem, galleryKeys: Array.from({ length: 8 }, (_, index) => `photo-${index}.jpg`), photoCount: 12 });
    expect(view.getAllByTestId("listing-photo")).toHaveLength(8);
    expect(view.getByText("+4")).toBeTruthy(); expect(view.getByText("Photos")).toBeTruthy();
    fireEvent.press(view.getByTestId("listing-photo-more"));
    expect(onPress).toHaveBeenCalledWith("listing");
  });
  it("falls back to the two list photos and counts the rest when the API sends no gallery", () => {
    const { view } = renderCard(listing);
    expect(view.getAllByTestId("listing-photo")).toHaveLength(2);
    expect(view.getByText("+5")).toBeTruthy();
  });
  it("builds no +N tile without a photo to show, nor when every photo is shown", () => {
    expect(stripTiles([], 3)).toEqual([]);
    expect(stripTiles(["a"], 1)).toEqual([{ kind: "photo", key: "a" }]);
    expect(stripTiles(["a", "b"], 5).at(-1)).toEqual({ kind: "more", count: 3 });
  });
});

describe("Results card contact actions", () => {
  it.each([
    [true, true, ["Call", "Message"]],
    [true, false, ["Call"]],
    [false, true, ["Message"]],
    [false, false, []],
  ] as const)("calls %s, chat %s: shows %j and always the Favorite", (allowCalls, allowChat, shown) => {
    const { view } = renderCard({ ...feedItem, allowCalls, allowChat } as ListingsSchemas.FeedListingSummary);
    for (const name of ["Call", "Message"]) expect(view.queryByRole("button", { name }) !== null).toBe((shown as readonly string[]).includes(name));
    expect(view.getByRole("button", { name: "Favorite" })).toBeTruthy();
  });
  it("shows neither Call nor Message for an older API, on the User's own Listing, or while the viewer is unknown", () => {
    for (const [item, options] of [
      [listing, {}],
      [feedItem, { isAuthenticated: true, viewerId: "seller" }],
      [feedItem, { isAuthenticated: null }],
    ] as const) {
      const { view } = renderCard(item, options);
      expect(view.queryByRole("button", { name: "Call" })).toBeNull();
      expect(view.queryByRole("button", { name: "Message" })).toBeNull();
      expect(view.getByRole("button", { name: "Favorite" })).toBeTruthy();
      view.unmount();
    }
  });
  it("gives Call, Message and ♡ targets of at least 44 pt", () => {
    const { view } = renderCard(feedItem);
    for (const name of ["Call", "Message", "Favorite"]) {
      expect(view.getByRole("button", { name }).props.className).toMatch(/\bh-control-(md|lg)\b/);
    }
  });
  it("reads the phone through the Listing detail query on tap and dials it, as detail does, without sign-in", async () => {
    api.get.mockResolvedValue({ ...feedItem, status: "active", allowCalls: true, contactPhone: "+99365000000" });
    const { view } = renderCard(feedItem);
    expect(view.queryByText(/\+99365000000/)).toBeNull();
    await act(async () => { fireEvent.press(view.getByRole("button", { name: "Call" })); });
    expect(api.get).toHaveBeenCalledWith("/listings/listing", expect.anything());
    expect(view.queryClient.getQueryData(queryKeys.listings.detail("listing"))).toEqual(expect.objectContaining({ contactPhone: "+99365000000" }));
    expect(Linking.openURL).toHaveBeenCalledWith("tel:+99365000000");
    expect(useAuthIntentStore.getState().intent).toBeNull();
  });
  it.each([
    ["calls are off now", { allowCalls: false, contactPhone: "+99365000000" }],
    ["there is no phone", { allowCalls: true }],
    ["the Listing was sold", { allowCalls: true, contactPhone: "+99365000000", status: "sold" }],
  ])("dials nothing when detail says %s", async (_, detail) => {
    api.get.mockResolvedValue({ ...feedItem, status: "active", ...detail });
    const { view } = renderCard(feedItem);
    await act(async () => { fireEvent.press(view.getByRole("button", { name: "Call" })); });
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
  it("shows an error with Retry when the phone cannot be read", async () => {
    api.get.mockRejectedValue(new Error("Network request failed"));
    const { view } = renderCard(feedItem);
    await act(async () => { fireEvent.press(view.getByRole("button", { name: "Call" })); });
    expect(view.getByText("Something went wrong")).toBeTruthy();
    expect(view.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
  it("opens the Conversation from Message when signed in", () => {
    const { view } = renderCard(feedItem, { isAuthenticated: true, viewerId: "buyer" });
    fireEvent.press(view.getByRole("button", { name: "Message" }));
    expect(conversation.open).toHaveBeenCalledWith("listing");
  });
  it("asks for sign-in with a pending Message that returns to Results when signed out", () => {
    const { view } = renderCard(feedItem);
    fireEvent.press(view.getByRole("button", { name: "Message" }));
    expect(conversation.open).not.toHaveBeenCalled();
    expect(useAuthIntentStore.getState().intent).toEqual({ returnTo, action: { kind: "message", listingId: "listing" } });
  });
  it("gives Message the full width, tonal, when the seller takes no calls", () => {
    const { view } = renderCard({ ...feedItem, allowCalls: false });
    expect(view.getByRole("button", { name: "Message" }).props.className).toMatch(/\bflex-1\b/);
    expect(view.getByText("Message")).toBeTruthy();
  });
});

describe("Results card seller line", () => {
  it("names the seller, then Private seller, the city and the date", () => {
    const { view } = renderCard(feedItem);
    expect(view.getByText("Aman Durdyýew").props.className).toMatch(/font-semibold/);
    expect(view.getByText("Private seller · Ashgabat · Today")).toBeTruthy();
  });
  it("uses the Generated Name of a seller who set none", () => {
    const { view } = renderCard({ ...feedItem, seller: { displayName: null, nameNumber: 4821, deleted: false } }, { locale: "ru" });
    expect(view.getByText(/4821/)).toBeTruthy();
  });
  it("shows Private seller alone for a deleted seller, as detail does", () => {
    const { view } = renderCard({ ...feedItem, seller: { displayName: "Gone", nameNumber: 4821, deleted: true } });
    expect(view.queryByText("Gone")).toBeNull();
    expect(view.getByText("Private seller")).toBeTruthy();
    expect(view.getByText("Ashgabat · Today")).toBeTruthy();
  });
  it("shows only the city and date when the API sends no seller", () => {
    const { view } = renderCard(listing);
    expect(view.queryByText(/Private seller/)).toBeNull();
    expect(view.getByText("Ashgabat · Today")).toBeTruthy();
  });
});
