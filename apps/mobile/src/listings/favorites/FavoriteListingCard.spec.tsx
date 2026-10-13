import type * as Native from "react-native";
import { Alert } from "react-native";
import type { ListingsSchemas } from "@auto-tm/contracts";
import * as Linking from "expo-linking";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile, fireEvent, act, within } from "../../../test/render";

import { FavoriteListingCard, FavoriteListingCardSkeleton } from "./FavoriteListingCard";

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

async function renderCard(listing: Partial<ListingsSchemas.FavoriteListingSummary> = {}, { isOwn = false, locale = "en" } = {}) {
  const onPress = vi.fn();
  const onRemove = vi.fn();
  const view = await renderMobile(
    <FavoriteListingCard listing={{ ...favorite, ...listing }} brandName="Toyota" modelName="Camry" cityName="Ashgabat"
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
  it("shows Call, Message and a filled ♥ on an active Listing", async () => {
    const { view } = await renderCard();
    expect(view.getByRole("button", { name: "Call" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Message" })).toBeTruthy();
    const heart = view.getByRole("button", { name: "Remove from Favorites" });
    expect(heart.props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(view.getByText("70,000 TMT")).toBeTruthy();
    expect(view.getByText("Toyota Camry, 2018")).toBeTruthy();
    expect(view.getByLabelText("Photos: 7")).toBeTruthy();
  });

  it("looks like the Results card: full width, 28 dp radius, the swipeable inset photo strip", async () => {
    const { view } = await renderCard();
    const card = view.getByTestId("favorite-card");
    expect(card.props.className).toMatch(/\brounded-3xl\b/);
    expect(card.props.className).not.toMatch(/\bmx-4\b/);
    expect(view.getByTestId("listing-photo-strip")).toBeTruthy();
    expect(view.getAllByTestId("listing-photo")).toHaveLength(2);
    // Seven photos and two keys: a "+5" tile ends the strip.
    expect(view.getByTestId("listing-photo-more")).toBeTruthy();
  });

  it("swipes through the gallery the API sends, as on Results, before the count tile", async () => {
    const galleryKeys = ["1.jpg", "2.jpg", "3.jpg", "4.jpg", "5.jpg", "6.jpg"];
    const { view } = await renderCard({ galleryKeys });
    expect(view.getAllByTestId("listing-photo")).toHaveLength(6);
    // Seven photos and six keys: one more behind a "+1" tile.
    expect(within(view.getByTestId("listing-photo-more")).getByText("+1")).toBeTruthy();
  });

  it("shows every photo and no count tile when the gallery holds them all", async () => {
    const { view } = await renderCard({ galleryKeys: ["1.jpg", "2.jpg", "3.jpg"], photoCount: 3 });
    expect(view.getAllByTestId("listing-photo")).toHaveLength(3);
    expect(view.queryByTestId("listing-photo-more")).toBeNull();
  });

  it("puts Call, a square Message and a square ♥ in one row", async () => {
    const { view } = await renderCard();
    const row = within(view.getByTestId("listing-actions"));
    expect(row.getByRole("button", { name: "Call" }).props.className).toMatch(/\bflex-1\b/);
    expect(row.getByRole("button", { name: "Message" }).props.className).toMatch(/\baspect-square\b/);
    expect(row.getByRole("button", { name: "Remove from Favorites" }).props.className).toMatch(/\baspect-square\b/);
  });

  it("gives Message the full width when there is no Call", async () => {
    const { view } = await renderCard({ allowCalls: false });
    expect(view.getByRole("button", { name: "Message" }).props.className).toMatch(/\bflex-1\b/);
  });

  it("gives Call, Message and ♥ targets of at least 44 pt", async () => {
    const { view } = await renderCard();
    for (const name of ["Call", "Message", "Remove from Favorites"]) {
      expect(view.getByRole("button", { name }).props.className).toMatch(/\bh-11\b|\bmin-h-11\b|\bh-control-(md|lg)\b|\bh-12\b/);
    }
  });

  it("opens the dialer directly with the Listing contact phone", async () => {
    const { view } = await renderCard();
    await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Call" })); });
    expect(Linking.openURL).toHaveBeenCalledWith("tel:+99365000000");
  });

  it.each([
    ["calls are off", { allowCalls: false }],
    ["there is no phone", { contactPhone: undefined }],
  ])("hides Call when %s", async (_, listing) => {
    const { view } = await renderCard(listing);
    expect(view.queryByRole("button", { name: "Call" })).toBeNull();
    expect(view.getByRole("button", { name: "Message" })).toBeTruthy();
  });

  it("opens the Conversation about the Listing from Message", async () => {
    const { view } = await renderCard();
    await fireEvent.press(view.getByRole("button", { name: "Message" }));
    expect(conversation.open).toHaveBeenCalledWith("listing");
  });

  it("hides Message when the seller turned chat off", async () => {
    const { view } = await renderCard({ allowChat: false });
    expect(view.queryByRole("button", { name: "Message" })).toBeNull();
    expect(view.getByRole("button", { name: "Call" })).toBeTruthy();
  });

  it("shows an error when the Conversation cannot open and keeps the card as it was", async () => {
    conversation.error = new Error("Network request failed");
    const { view } = await renderCard();
    expect(view.getByText("Something went wrong")).toBeTruthy();
    expect(view.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Call" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Message" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Remove from Favorites" })).toBeTruthy();
  });

  it("shows no contact buttons on the User's own Listing", async () => {
    const { view } = await renderCard({}, { isOwn: true });
    expect(view.queryByRole("button", { name: "Call" })).toBeNull();
    expect(view.queryByRole("button", { name: "Message" })).toBeNull();
    expect(within(view.getByTestId("listing-meta")).getByRole("button", { name: "Remove from Favorites" })).toBeTruthy();
  });

  it("keeps the ♥ a control-sized square on the date line, where no Call stretches it (#813)", async () => {
    const { view } = await renderCard({}, { isOwn: true });
    const heart = within(view.getByTestId("listing-meta")).getByRole("button", { name: "Remove from Favorites" });
    expect(heart.props.className).toMatch(/\baspect-square\b/);
    expect(heart.props.className).toMatch(/\bmin-w-control-md\b/);
    expect(heart.props.className).toMatch(/\bmin-h-control-md\b/);
  });

  it.each([
    ["sold", "Sold"],
    ["archived", "Removed from sale"],
  ] as const)("shows a %s Listing dimmed and labelled, with a muted price and no contact buttons", async (status, label) => {
    const { view, onPress, onRemove } = await renderCard({ status });
    expect(view.getByText(label)).toBeTruthy();
    expect(view.getByTestId("listing-photos-frame").props.className).toMatch(/opacity-50/);
    expect(view.getByText("70,000 TMT").props.className).toMatch(/text-muted-foreground/);
    expect(view.queryByRole("button", { name: "Call" })).toBeNull();
    expect(view.queryByRole("button", { name: "Message" })).toBeNull();
    await fireEvent.press(view.getByRole("button", { name: /Toyota Camry, 2018/ }));
    expect(onPress).toHaveBeenCalledWith("listing");
    await fireEvent.press(view.getByRole("button", { name: "Remove from Favorites" }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: "listing", status }));
  });

  it.each([["ru", "Продано"], ["tk", "Satylan"]])("labels a sold Listing in %s", async (locale, label) => {
    const { view } = await renderCard({ status: "sold" }, { locale });
    expect(view.getByText(label)).toBeTruthy();
  });

  it("removes the Favorite from ♥ and opens Listing detail from the card", async () => {
    const { view, onPress, onRemove } = await renderCard();
    await fireEvent.press(view.getByRole("button", { name: "Remove from Favorites" }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: "listing" }));
    await fireEvent.press(view.getByRole("button", { name: /Toyota Camry, 2018/ }));
    expect(onPress).toHaveBeenCalledWith("listing");
  });

  it("has a skeleton with the shape of the card and its buttons", async () => {
    const view = await renderMobile(<FavoriteListingCardSkeleton />);
    expect(view.getAllByTestId("listing-photo-skeleton")).toHaveLength(1);
    expect(within(view.getByTestId("listing-actions-skeleton")).getAllByTestId("skeleton-button")).toHaveLength(3);
  });
});

vi.mock("react-native", async (original) => ({
  ...await original<typeof Native>(),
  Alert: { alert: vi.fn() },
}));

describe("Android dialer", () => {
  it("dials despite a false package-visibility check", async () => {
    vi.mocked(Linking.canOpenURL).mockResolvedValueOnce(false);
    const { view } = await renderCard();
    await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Call" })); });
    expect(Linking.openURL).toHaveBeenCalledWith("tel:+99365000000");
  });
  it("shows the number when the dialer fails", async () => {
    vi.mocked(Linking.openURL).mockRejectedValueOnce(new Error("No dialer"));
    const { view } = await renderCard();
    await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Call" })); });
    expect(Alert.alert).toHaveBeenCalledWith("Call", "Could not open the dialer. Call +99365000000 manually.");
  });
});
