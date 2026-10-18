import type * as Native from "react-native";
import { Alert, StyleSheet } from "react-native";
import type { ListingsSchemas } from "@auto-tm/contracts";
import * as Linking from "expo-linking";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile, fireEvent, act, first, getHost, routerMock } from "../../../test/render";
import { useAuthIntentStore } from "../../auth/intentStore";
import { queryKeys } from "../../api/queryKeys";

import { ListingLargeCard, ListingLargeCardSkeleton, formatListingDate } from "./ListingLargeCard";
import { STRIP_GAP, STRIP_INSET, stripTiles } from "./ListingPhotoStrip";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../../api/client", () => ({ apiClient: { get: api.get, post: vi.fn(), delete: vi.fn() }, ApiError: class ApiError extends Error {} }));
const conversation = vi.hoisted(() => ({ open: vi.fn(), retry: vi.fn(), isPending: false, error: null as unknown }));
vi.mock("../../conversations/useOpenListingConversation", () => ({
  useOpenListingConversation: (listingId: string) => ({ ...conversation, open: () => conversation.open(listingId) }),
}));

const listing: ListingsSchemas.ListingSummary = { id: "listing", sellerId: "seller", status: "active", brandId: "brand", modelId: "model", year: 2018, priceAmount: 2, priceCurrency: "USD", displayPriceTmt: 70000, photoKeys: ["one.webp", "two.webp"], photoCount: 7, cityId: "city", publishedAt: "2026-09-30T04:00:00.000Z" };
/** A feed item as the current API sends it: the gallery, contact preferences and the seller's name. */
const feedItem: ListingsSchemas.FeedListingSummary = { ...listing, galleryKeys: ["one.webp", "two.webp"], photoCount: 2, allowCalls: true, allowChat: true, seller: { displayName: "Aman Durdyýew", nameNumber: 4821, deleted: false } };
const returnTo = "/(tabs)/(search)/results" as const;

async function renderCard(item: ListingsSchemas.FeedListingSummary, { isAuthenticated = false as boolean | null, viewerId = null as string | null, locale = "en" } = {}) {
  const onPress = vi.fn();
  const view = await renderMobile(<ListingLargeCard listing={item} brandName="Toyota" modelName="Camry" cityName="Ashgabat" isAuthenticated={isAuthenticated} viewerId={viewerId} returnTo={returnTo} onPress={onPress} />, { locale });
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
  it("opens the actual business showroom and never labels business stock a private seller", async () => {
    const business = { id: "business", name: "Ahal Motors", slug: "ahal", logoUrl: null, city: null, identityChecked: false };
    const { view } = await renderCard({ ...feedItem, businessId: "business", business });
    await fireEvent.press(view.getByRole("button", { name: "Ahal Motors" }));
    expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/showrooms/[id]", params: { id: "business" } });
    expect(view.queryByText(/Private seller/)).toBeNull();
  });
  it("shows the photo strip, TMT price, spec line, one-line title and city/date", async () => {
    const onPress = vi.fn();
    const view = await renderMobile(<ListingLargeCard listing={{ ...listing, mileageKm: 0 }} brandName="Toyota" modelName="Camry" cityName="Ashgabat" transmissionName="Automatic" engineTypeName="Petrol" isAuthenticated={false} returnTo={returnTo} onPress={onPress} />);
    expect(view.getAllByTestId("listing-photo")).toHaveLength(2); expect(view.queryByLabelText(/Photos: /)).toBeNull();
    expect(view.getByText("70,000 TMT")).toBeTruthy(); expect(view.queryByText(/USD/)).toBeNull();
    expect(view.getByText("Toyota Camry, 2018").props.numberOfLines).toBe(1);
    expect(view.getByText("0 km · Automatic · Petrol")).toBeTruthy();
    await fireEvent.press(view.getByRole("button", { name: /Toyota Camry, 2018/ })); expect(onPress).toHaveBeenCalledWith("listing");
    await fireEvent.press(view.getByRole("button", { name: "Favorite" })); expect(useAuthIntentStore.getState().intent).toEqual({ returnTo, action: { kind: "favorite", listingId: "listing" } });
  });
  it.each([[0, []], [1, ["one.webp"]], [2, ["one.webp", "two.webp"]], [7, ["one.webp", "two.webp"]]])("renders no photo count for a Listing with %i photos", async (photoCount, photoKeys) => {
    for (const locale of ["en", "ru", "tk"]) {
      const view = await renderMobile(<ListingLargeCard listing={{ ...listing, photoKeys, photoCount }} isAuthenticated={false} returnTo={returnTo} onPress={vi.fn()} />, { locale });
      expect(view.queryByLabelText(/(Photos|Фото|Suratlar): \d/)).toBeNull();
      expect(view.queryByText(String(photoCount))).toBeNull();
    }
  });
  it("drops absent spec parts without separators or UUID placeholders", async () => {
    const view = await renderMobile(<ListingLargeCard listing={listing} brandName="Toyota" modelName="Camry" engineTypeName="Petrol" isAuthenticated={null} returnTo={returnTo} onPress={vi.fn()} />);
    expect(view.getByText("Petrol")).toBeTruthy(); expect(view.queryByText(/undefined|null| · Petrol/)).toBeNull();
    expect(view.queryByText(/Phone verified/)).toBeNull();
  });
  it("shows a single full-width photo, with no strip and no count, for a one-photo Listing", async () => {
    const view = await renderMobile(<ListingLargeCard listing={{ ...listing, photoKeys: ["one.webp"], photoCount: 1 }} isAuthenticated={false} returnTo={returnTo} onPress={vi.fn()} />);
    expect(view.getAllByTestId("listing-photo")).toHaveLength(1); expect(view.queryByTestId("listing-photo-strip")).toBeNull();
    expect(view.queryByText(/No photo/)).toBeNull(); expect(view.queryByLabelText(/Photos:/)).toBeNull();
  });
  it("shows one No photos frame and no count when the Listing has no photos", async () => {
    const view = await renderMobile(<ListingLargeCard listing={{ ...listing, photoKeys: [], photoCount: 0 }} isAuthenticated={false} returnTo={returnTo} onPress={vi.fn()} />);
    expect(view.getAllByTestId("listing-photo")).toHaveLength(1); expect(view.getByText("No photos")).toBeTruthy();
    expect(view.queryByLabelText(/Photos:/)).toBeNull();
  });
  it("shows a single photo skeleton in the strip's place", async () => {
    const view = await renderMobile(<ListingLargeCardSkeleton />);
    expect(view.getAllByTestId("listing-photo-skeleton")).toHaveLength(1);
  });
  it.each([["2026-09-30T12:00:00Z", "Today"], ["2026-09-29T12:00:00Z", "Yesterday"], ["2026-09-12T12:00:00Z", "12 Sep"], ["2025-03-03T12:00:00Z", "3 Mar 2025"]])("formats publication %s as %s", async (date, expected) => {
    const view = await renderMobile(<ListingLargeCard listing={{ ...listing, publishedAt: date }} cityName="Ashgabat" isAuthenticated={false} returnTo={returnTo} onPress={vi.fn()} />);
    expect(view.getByText(`Ashgabat · ${expected}`)).toBeTruthy();
    expect(formatListingDate(date, "en", (key) => ({ resultsToday: "Today", resultsYesterday: "Yesterday" })[key] ?? key, new Date("2026-09-30T12:00:00Z"))).toBe(expected);
  });
  it("says New on the photos only when the seller stated a new car", async () => {
    const stated = (await renderCard({ ...listing, condition: "new" })).view;
    expect(stated.getByText("New")).toBeTruthy(); expect(stated.queryByLabelText(/Photos: /)).toBeNull(); expect(stated.getByTestId("listing-photos")).toBeTruthy();
    expect((await renderCard({ ...listing, condition: "used" })).view.queryByText("New")).toBeNull();
  });
});

describe("Results photo strip", () => {
  it("keeps the strip responder separate from photo and card taps", async () => {
    const { view, onPress } = await renderCard(feedItem);
    // Android may deliver the drag's release at the scrolling container.
    // That container must not find a detail-opening ancestor press handler.
    // RNTL also bubbles to composite callback props named onPress. Only a
    // rendered native host can receive the Android responder release here.
    let parent = view.getByTestId("listing-photo-strip").parent;
    while (parent) {
      if (typeof parent.type === "string" && parent.props.onPress) {
        const release = parent.props.onPress;
        await act(() => release());
        break;
      }
      parent = parent.parent;
    }
    expect(onPress).not.toHaveBeenCalled();
    await fireEvent.press(first(view.getAllByTestId("listing-photo")));
    expect(onPress).toHaveBeenCalledOnce();
    await fireEvent.press(view.getByRole("button", { name: /Toyota Camry, 2018/ }));
    expect(onPress).toHaveBeenCalledTimes(2);
  });
  it.each([1, 2, 5, 8])("shows all %i gallery photos in the seller's order", async (length) => {
    const keys = Array.from({ length }, (_, index) => `photo-${index}.webp`);
    const { view } = await renderCard({ ...feedItem, galleryKeys: keys, photoCount: length });
    const frames = view.getAllByTestId("listing-photo");
    expect(frames).toHaveLength(length);
    expect(frames.map((frame) => getHost(frame, "Image").props.source)).toEqual([
      { uri: "https://media.autotm.tm/listing-photos/photo-0.webp/detail.webp?v=webp-natural-1" },
      { uri: "https://media.autotm.tm/listing-photos/photo-1.webp/detail.webp?v=webp-natural-1" },
      { uri: "https://media.autotm.tm/listing-photos/photo-2.webp/detail.webp?v=webp-natural-1" },
      { uri: "https://media.autotm.tm/listing-photos/photo-3.webp/detail.webp?v=webp-natural-1" },
      { uri: "https://media.autotm.tm/listing-photos/photo-4.webp/detail.webp?v=webp-natural-1" },
      { uri: "https://media.autotm.tm/listing-photos/photo-5.webp/detail.webp?v=webp-natural-1" },
      { uri: "https://media.autotm.tm/listing-photos/photo-6.webp/detail.webp?v=webp-natural-1" },
      { uri: "https://media.autotm.tm/listing-photos/photo-7.webp/detail.webp?v=webp-natural-1" },
    ].slice(0, length));
    expect(view.queryByTestId("listing-photo-more")).toBeNull();
    expect(view.queryByTestId("listing-photo-strip") === null).toBe(length === 1);
  });
  it("snaps one photo per swipe, at a photo's width plus the seam, without stealing the vertical scroll", async () => {
    const { view } = await renderCard({ ...feedItem, galleryKeys: ["a.webp", "b.webp", "c.webp"], photoCount: 3 });
    const strip = view.getByTestId("listing-photo-strip");
    const width = StyleSheet.flatten(view.getAllByTestId("listing-photo")[0]?.props.style).width as number;
    expect(strip.props.horizontal).toBe(true);
    expect(strip.props.snapToInterval).toBe(width + STRIP_GAP);
    expect(strip.props.decelerationRate).toBe("fast");
    expect(strip.props.disableIntervalMomentum).toBe(true);
    expect(strip.props.nestedScrollEnabled).toBe(true);
  });
  it("sets the photos in from the card's top and left edges, and lets a swipe carry them through that gap", async () => {
    const { view } = await renderCard({ ...feedItem, galleryKeys: ["a.webp", "b.webp", "c.webp"], photoCount: 3 });
    const strip = view.getByTestId("listing-photo-strip");
    const frame = StyleSheet.flatten(view.getByTestId("listing-photos").props.style);
    // The gap is padding on the scrolling content. The frame around it keeps the card's full width, so nothing clips a moving photo short of the card's edges.
    expect(StyleSheet.flatten(strip.props.contentContainerStyle).paddingHorizontal).toBe(STRIP_INSET);
    expect(frame.marginTop).toBe(STRIP_INSET);
    expect(frame.marginLeft ?? frame.marginHorizontal ?? frame.paddingLeft ?? frame.paddingHorizontal).toBeUndefined();
    // Snapped photos line up on the gap: each one's offset is the gap plus whole swipes.
    const interval = strip.props.snapToInterval as number;
    expect(strip.props.getItemLayout(null, 2).offset).toBe(STRIP_INSET + interval * 2);
  });
  it("shows about three fifths of the first photo, so over a third of the second shows at rest", async () => {
    const { view } = await renderCard({ ...feedItem, galleryKeys: ["a.webp", "b.webp", "c.webp"], photoCount: 3 });
    const cardWidth = 390; // The window the test host reports (test/native-host.cjs); the card spans it.
    const photo = StyleSheet.flatten(view.getAllByTestId("listing-photo")[0]?.props.style) as { width: number; height: number };
    const secondShown = cardWidth - STRIP_INSET - photo.width - STRIP_GAP;
    expect(photo.width / cardWidth).toBeGreaterThan(0.58); expect(photo.width / cardWidth).toBeLessThan(0.64);
    expect(secondShown / cardWidth).toBeGreaterThan(0.33);
    // The frame stays 4:3, as before, so a car is cropped no harder than it was.
    expect(photo.width / photo.height).toBeCloseTo(4 / 3, 1);
  });
  it("ends with a +N photos tile when the Listing has more photos than keys, and the tile opens the Listing", async () => {
    const { view, onPress } = await renderCard({ ...feedItem, galleryKeys: Array.from({ length: 8 }, (_, index) => `photo-${index}.webp`), photoCount: 12 });
    expect(view.getAllByTestId("listing-photo")).toHaveLength(8);
    expect(view.getByText("+4")).toBeTruthy(); expect(view.getByText("Photos")).toBeTruthy();
    await fireEvent.press(view.getByTestId("listing-photo-more"));
    expect(onPress).toHaveBeenCalledWith("listing");
  });
  it("falls back to the two list photos and counts the rest when the API sends no gallery", async () => {
    const { view } = await renderCard(listing);
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
  ] as const)("calls %s, chat %s: shows %j and always the Favorite", async (allowCalls, allowChat, shown) => {
    const { view } = await renderCard({ ...feedItem, allowCalls, allowChat } as ListingsSchemas.FeedListingSummary);
    for (const name of ["Call", "Message"]) expect(view.queryByRole("button", { name }) !== null).toBe((shown as readonly string[]).includes(name));
    expect(view.getByRole("button", { name: "Favorite" })).toBeTruthy();
  });
  it("shows neither Call nor Message for an older API, on the User's own Listing, or while the viewer is unknown", async () => {
    for (const [item, options] of [
      [listing, {}],
      [feedItem, { isAuthenticated: true, viewerId: "seller" }],
      [feedItem, { isAuthenticated: null }],
    ] as const) {
      const { view } = await renderCard(item, options);
      expect(view.queryByRole("button", { name: "Call" })).toBeNull();
      expect(view.queryByRole("button", { name: "Message" })).toBeNull();
      expect(view.getByRole("button", { name: "Favorite" })).toBeTruthy();
      await view.unmount();
    }
  });
  it("gives Call, Message and ♡ targets of at least 44 pt", async () => {
    const { view } = await renderCard(feedItem);
    for (const name of ["Call", "Message", "Favorite"]) {
      expect(view.getByRole("button", { name }).props.className).toMatch(/\bh-control-(md|lg)\b/);
    }
  });
  it("reads the phone through the Listing detail query on tap and dials it, as detail does, without sign-in", async () => {
    api.get.mockResolvedValue({ ...feedItem, status: "active", allowCalls: true, contactPhone: "+99365000000" });
    const { view } = await renderCard(feedItem);
    expect(view.queryByText(/\+99365000000/)).toBeNull();
    await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Call" })); });
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
    const { view } = await renderCard(feedItem);
    await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Call" })); });
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
  it("shows an error with Retry when the phone cannot be read", async () => {
    api.get.mockRejectedValue(new Error("Network request failed"));
    const { view } = await renderCard(feedItem);
    await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Call" })); });
    expect(await view.findByText("Something went wrong")).toBeTruthy();
    expect(view.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
  it("opens the Conversation from Message when signed in", async () => {
    const { view } = await renderCard(feedItem, { isAuthenticated: true, viewerId: "buyer" });
    await fireEvent.press(view.getByRole("button", { name: "Message" }));
    expect(conversation.open).toHaveBeenCalledWith("listing");
  });
  it("asks for sign-in with a pending Message that returns to Results when signed out", async () => {
    const { view } = await renderCard(feedItem);
    await fireEvent.press(view.getByRole("button", { name: "Message" }));
    expect(conversation.open).not.toHaveBeenCalled();
    expect(useAuthIntentStore.getState().intent).toEqual({ returnTo, action: { kind: "message", listingId: "listing" } });
  });
  it("gives Message the full width, tonal, when the seller takes no calls", async () => {
    const { view } = await renderCard({ ...feedItem, allowCalls: false });
    expect(view.getByRole("button", { name: "Message" }).props.className).toMatch(/\bflex-1\b/);
    expect(view.getByText("Message")).toBeTruthy();
  });
});

describe("Results card seller line", () => {
  it("names the seller, then Private seller, the city and the date", async () => {
    const { view } = await renderCard(feedItem);
    expect(view.getByText("Aman Durdyýew").props.className).toMatch(/font-semibold/);
    expect(view.getByText("Private seller · Ashgabat · Today")).toBeTruthy();
  });
  it("uses the Generated Name of a seller who set none", async () => {
    const { view } = await renderCard({ ...feedItem, seller: { displayName: null, nameNumber: 4821, deleted: false } }, { locale: "ru" });
    expect(view.getByText(/4821/)).toBeTruthy();
  });
  it("shows Private seller alone for a deleted seller, as detail does", async () => {
    const { view } = await renderCard({ ...feedItem, seller: { displayName: "Gone", nameNumber: 4821, deleted: true } });
    expect(view.queryByText("Gone")).toBeNull();
    expect(view.getByText("Private seller")).toBeTruthy();
    expect(view.getByText("Ashgabat · Today")).toBeTruthy();
  });
  it("shows only the city and date when the API sends no seller", async () => {
    const { view } = await renderCard(listing);
    expect(view.queryByText(/Private seller/)).toBeNull();
    expect(view.getByText("Ashgabat · Today")).toBeTruthy();
  });
});

vi.mock("react-native", async (original) => ({
  ...await original<typeof Native>(),
  Alert: { alert: vi.fn() },
}));

describe("Android dialer", () => {
  it("dials despite a false package-visibility check", async () => {
    vi.mocked(Linking.canOpenURL).mockResolvedValueOnce(false);
    api.get.mockResolvedValue({ ...feedItem, contactPhone: "+99365000000" });
    const { view } = await renderCard(feedItem);
    await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Call" })); });
    expect(Linking.openURL).toHaveBeenCalledWith("tel:+99365000000");
  });
  it("shows the number when the dialer fails", async () => {
    vi.mocked(Linking.openURL).mockRejectedValueOnce(new Error("No dialer"));
    api.get.mockResolvedValue({ ...feedItem, contactPhone: "+99365000000" });
    const { view } = await renderCard(feedItem);
    await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Call" })); });
    expect(Alert.alert).toHaveBeenCalledWith("Call", "Could not open the dialer. Call +99365000000 manually.");
  });
});
