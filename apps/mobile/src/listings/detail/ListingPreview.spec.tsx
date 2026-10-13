import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthIntentStore } from "../../auth/intentStore";
import { fireEvent, renderMobile, getHost } from "../../../test/render";
import { summaryFixture } from "../../../test/fixtures/listing";

import { ListingPreview } from "./ListingPreview";

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
vi.mock("../../auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock("expo-linking", () => ({ canOpenURL: vi.fn(async () => true), openURL: vi.fn() }));
vi.mock("@/components/ui/skeleton", async () => ({
  Skeleton: (await import("react-native")).View,
}));

const onBack = vi.fn();
beforeEach(() => onBack.mockClear());

function preview(
  updates: Parameters<typeof summaryFixture>[0] = {},
  { isOwner = false } = {},
) {
  return renderMobile(
    <ListingPreview summary={summaryFixture(updates)} isOwner={isOwner} onBack={onBack} />,
  );
}

describe("Listing detail preview, from the tapped card's cached data", () => {
  it("shows the card's photo, title, price, city, date and known specifications at once", async () => {
    const screen = await preview();

    expect(screen.getByText("Toyota Camry, 2020")).toBeTruthy();
    expect(screen.getByText("35,000 TMT")).toBeTruthy();
    for (const value of ["2020", "12,000 km", "Automatic", "Petrol", "Used"])
      expect(screen.getByText(value)).toBeTruthy();
    expect(screen.getByText("20 Sep · Ashgabat")).toBeTruthy();
    expect(screen.getByText("1 / 12")).toBeTruthy();
    // The card already decoded the `list` size, so it shows at once while the
    // gallery's `detail` size loads behind it (#816).
    const photo = getHost(screen.container, "Image").props;
    expect(photo.placeholder).toEqual({ uri: "https://media.autotm.tm/listing-photos/listing-0/list.webp?v=webp-natural-1" });
    // Drawn whole, in the gallery's own fit, so the gallery replaces it in place (#864).
    expect(photo.placeholderContentFit).toBe("contain");
    expect(photo.contentFit).toBe("contain");
    expect(photo.source).toEqual({ uri: "https://media.autotm.tm/listing-photos/listing-0/detail.webp?v=webp-natural-1" });
    expect(photo.priority).toBe("high");
  });

  it("loads the rest behind skeletons and offers nothing it does not have yet", async () => {
    const screen = await preview();

    expect(screen.getByTestId("detail-skeleton-body")).toBeTruthy();
    expect(screen.getAllByTestId("spec-cell-loading")).toHaveLength(2);
    expect(screen.getAllByTestId("spec-row-loading")).toHaveLength(2);
    for (const heading of ["Description", "Seller", "Ask the seller", "Power", "Drive"])
      expect(screen.queryByText(heading)).toBeNull();
  });

  it("holds the owner's status card, with saves still loading, and no Seller placeholder", async () => {
    const hidden = { includeHiddenElements: true };
    const buyer = await preview();
    expect(buyer.getByTestId("seller-loading", hidden)).toBeTruthy();
    expect(buyer.queryByTestId("owner-saves-loading", hidden)).toBeNull();

    const owner = await preview({}, { isOwner: true });

    expect(owner.getByText("Your listing · Active")).toBeTruthy();
    expect(owner.getByTestId("owner-saves-loading", hidden)).toBeTruthy();
    expect(owner.queryByText(/saves?/i)).toBeNull();
    expect(owner.queryByTestId("seller-loading", hidden)).toBeNull();
    expect(owner.getByText("10,000 USD")).toBeTruthy();
  });

  it("keeps Call and Message disabled until the full detail arrives", async () => {
    const screen = await preview();

    expect(screen.getByRole("button", { name: "Call", disabled: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Message", disabled: true })).toBeTruthy();
  });

  it("goes back from the preview", async () => {
    const screen = await preview();

    await fireEvent.press(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("drops fields the card does not have, with no placeholder", async () => {
    const screen = await preview({
      mileageKm: undefined,
      transmissionId: undefined,
      engineTypeId: undefined,
      year: undefined,
    });

    expect(screen.getByText("Toyota Camry")).toBeTruthy();
    expect(screen.queryByText(/undefined|null|·\s*$/)).toBeNull();
    expect(screen.getByText("20 Sep · Ashgabat")).toBeTruthy();
  });

  it("falls back to the No photos tile for a Listing without photos", async () => {
    const screen = await preview({ photoKeys: [], coverMediaKey: undefined, photoCount: 0 });

    expect(screen.getByText("No photos")).toBeTruthy();
    expect(screen.queryByText(/\d+ \/ \d+/)).toBeNull();
  });

  it("shows no contact bar to the owner or on a closed Listing", async () => {
    for (const screen of [
      (await preview({}, { isOwner: true })),
      (await preview({ status: "sold" })),
      (await preview({ status: "archived" })),
    ]) {
      expect(screen.queryByRole("button", { name: "Call" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Message" })).toBeNull();
    }
  });

  it("leaves a replayed Message to the detail bar that replaces it", async () => {
    const summary = summaryFixture();
    useAuthIntentStore.setState({ replayAction: { kind: "message", listingId: summary.id } });

    await preview();

    expect(useAuthIntentStore.getState().replayAction).not.toBeNull();
    useAuthIntentStore.setState({ replayAction: null });
  });
});
