import type { ListingsSchemas } from "@auto-tm/contracts";
import * as Linking from "expo-linking";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile, fireEvent, act, within } from "../../../test/render";

import { ListingLargeCard, ListingLargeCardSkeleton } from "./ListingLargeCard";

const conversation = vi.hoisted(() => ({ open: vi.fn(), retry: vi.fn(), isPending: false, error: null as unknown }));
vi.mock("../../conversations/useOpenListingConversation", () => ({
  useOpenListingConversation: (listingId: string) => ({ ...conversation, open: () => conversation.open(listingId) }),
}));
vi.mock("../../api/client", () => ({ apiClient: { post: vi.fn(), delete: vi.fn() }, ApiError: class ApiError extends Error {} }));

const favorite: ListingsSchemas.FavoriteListingSummary = {
  id: "listing", sellerId: "seller", status: "active", brandId: "brand", modelId: "model", year: 2018,
  priceAmount: 2, priceCurrency: "USD", displayPriceTmt: 70000, photoKeys: ["one.jpg", "two.jpg"], photoCount: 7,
  cityId: "city", publishedAt: "2026-09-30T04:00:00.000Z", isFavorited: true,
  contactPhone: "+99365000000", allowCalls: true, allowChat: true,
};

function renderCard(listing: Partial<ListingsSchemas.FavoriteListingSummary> = {}, { isOwn = false, locale = "en" } = {}) {
  const onPress = vi.fn();
  const onRemove = vi.fn();
  const view = renderMobile(
    <ListingLargeCard listing={{ ...favorite, ...listing }} brandName="Toyota" modelName="Camry" cityName="Ashgabat"
      onPress={onPress} isOwn={isOwn} onRemoveFavorite={onRemove} />,
    { locale },
  );
  return { view, onPress, onRemove };
}

beforeEach(() => {
  conversation.open.mockReset();
  conversation.error = null;
  conversation.isPending = false;
  vi.mocked(Linking.canOpenURL).mockResolvedValue(true);
  vi.mocked(Linking.openURL).mockClear();
});

describe("Favorites large card", () => {
  it("shows Call, Message and a filled ♥ on an active Listing", () => {
    const { view } = renderCard();
    expect(view.getByRole("button", { name: "Call" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Message" })).toBeTruthy();
    const heart = view.getByRole("button", { name: "Remove from Favorites" });
    expect(heart.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(view.getByText("70,000 TMT")).toBeTruthy();
    expect(view.getByText("Toyota Camry, 2018")).toBeTruthy();
    expect(view.getAllByTestId("listing-photo")).toHaveLength(2);
    expect(view.getByLabelText("Photos: 7")).toBeTruthy();
  });

  it("gives Call, Message and ♥ targets of at least 44 pt", () => {
    const { view } = renderCard();
    for (const name of ["Call", "Message", "Remove from Favorites"]) {
      expect(view.getByRole("button", { name }).props.className).toMatch(/\bh-11\b|\bmin-h-11\b|\bh-control-(md|lg)\b|\bh-12\b/);
    }
  });

  it("opens the dialer directly with the Listing contact phone", async () => {
    const { view } = renderCard();
    await act(async () => { fireEvent.press(view.getByRole("button", { name: "Call" })); });
    expect(Linking.openURL).toHaveBeenCalledWith("tel:+99365000000");
  });

  it.each([
    ["calls are off", { allowCalls: false }],
    ["there is no phone", { contactPhone: undefined }],
  ])("hides Call when %s", (_, listing) => {
    const { view } = renderCard(listing);
    expect(view.queryByRole("button", { name: "Call" })).toBeNull();
    expect(view.getByRole("button", { name: "Message" })).toBeTruthy();
  });

  it("opens the Conversation about the Listing from Message", () => {
    const { view } = renderCard();
    fireEvent.press(view.getByRole("button", { name: "Message" }));
    expect(conversation.open).toHaveBeenCalledWith("listing");
  });

  it("hides Message when the seller turned chat off", () => {
    const { view } = renderCard({ allowChat: false });
    expect(view.queryByRole("button", { name: "Message" })).toBeNull();
    expect(view.getByRole("button", { name: "Call" })).toBeTruthy();
  });

  it("shows an error when the Conversation cannot open and keeps the card as it was", () => {
    conversation.error = new Error("Network request failed");
    const { view } = renderCard();
    expect(view.getByText("Something went wrong")).toBeTruthy();
    expect(view.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Call" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Message" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Remove from Favorites" })).toBeTruthy();
  });

  it("shows no contact buttons on the User's own Listing", () => {
    const { view } = renderCard({}, { isOwn: true });
    expect(view.queryByRole("button", { name: "Call" })).toBeNull();
    expect(view.queryByRole("button", { name: "Message" })).toBeNull();
    expect(view.getByRole("button", { name: "Remove from Favorites" })).toBeTruthy();
  });

  it.each([
    ["sold", "Sold"],
    ["archived", "Removed from sale"],
  ] as const)("shows a %s Listing dimmed and labelled, with a muted price and no contact buttons", (status, label) => {
    const { view, onPress, onRemove } = renderCard({ status });
    expect(view.getByText(label)).toBeTruthy();
    expect(view.getByTestId("listing-photos").props.className).toMatch(/opacity-50/);
    expect(view.getByText("70,000 TMT").props.className).toMatch(/text-muted-foreground/);
    expect(view.queryByRole("button", { name: "Call" })).toBeNull();
    expect(view.queryByRole("button", { name: "Message" })).toBeNull();
    fireEvent.press(view.getByRole("button", { name: /Toyota Camry, 2018/ }));
    expect(onPress).toHaveBeenCalledWith("listing");
    fireEvent.press(view.getByRole("button", { name: "Remove from Favorites" }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: "listing", status }));
  });

  it.each([["ru", "Продано"], ["tk", "Satylan"]])("labels a sold Listing in %s", (locale, label) => {
    const { view } = renderCard({ status: "sold" }, { locale });
    expect(view.getByText(label)).toBeTruthy();
  });

  it("removes the Favorite from ♥ and opens Listing detail from the card", () => {
    const { view, onPress, onRemove } = renderCard();
    fireEvent.press(view.getByRole("button", { name: "Remove from Favorites" }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: "listing" }));
    fireEvent.press(view.getByRole("button", { name: /Toyota Camry, 2018/ }));
    expect(onPress).toHaveBeenCalledWith("listing");
  });

  it("keeps the Results card without contact buttons", () => {
    const view = renderMobile(<ListingLargeCard listing={favorite} isAuthenticated returnTo="/(tabs)/(search)/results" onPress={vi.fn()} />);
    expect(view.queryByRole("button", { name: "Call" })).toBeNull();
    expect(view.queryByRole("button", { name: "Message" })).toBeNull();
    expect(view.getByRole("button", { name: "Favorite" })).toBeTruthy();
  });

  it("has a skeleton with the shape of the card and its buttons", () => {
    const view = renderMobile(<ListingLargeCardSkeleton withActions />);
    expect(view.getAllByTestId("listing-photo-skeleton")).toHaveLength(1);
    expect(within(view.getByTestId("listing-actions-skeleton")).getAllByTestId("skeleton-button")).toHaveLength(2);
  });
});
