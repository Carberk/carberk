import { beforeEach, describe, expect, it, vi } from "vitest";
import { Image } from "react-native";

import { useAuthIntentStore } from "../../auth/intentStore";
import { fireEvent, renderMobile } from "../../../test/render";
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
  it("shows the card's photo, title, price, spec line, city and date at once", () => {
    const screen = preview();

    expect(screen.getByText("Toyota Camry, 2020")).toBeTruthy();
    expect(screen.getByText("35,000 TMT")).toBeTruthy();
    expect(screen.getByText("12,000 km · Automatic · Petrol")).toBeTruthy();
    expect(screen.getByText("20 Sep · Ashgabat")).toBeTruthy();
    expect(screen.getByText("1 / 12")).toBeTruthy();
    // The card already decoded the `list` size, so it shows at once while the
    // gallery's `detail` size loads behind it (#816).
    const photo = screen.UNSAFE_getByType(Image).props;
    expect(photo.placeholder).toEqual({ uri: "https://media.autotm.tm/listing-photos/listing-0/list.webp" });
    expect(photo.placeholderContentFit).toBe("cover");
    expect(photo.source).toEqual({ uri: "https://media.autotm.tm/listing-photos/listing-0/detail.webp" });
    expect(photo.priority).toBe("high");
  });

  it("loads the rest behind skeletons and offers nothing it does not have yet", () => {
    const screen = preview();

    expect(screen.getByTestId("detail-skeleton-body")).toBeTruthy();
    for (const heading of ["Specifications", "Description", "Seller", "Ask the seller"])
      expect(screen.queryByText(heading)).toBeNull();
  });

  it("keeps Call and Message disabled until the full detail arrives", () => {
    const screen = preview();

    expect(screen.getByRole("button", { name: "Call", disabled: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Message", disabled: true })).toBeTruthy();
  });

  it("goes back from the preview", () => {
    const screen = preview();

    fireEvent.press(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("drops fields the card does not have, with no placeholder", () => {
    const screen = preview({
      mileageKm: undefined,
      transmissionId: undefined,
      engineTypeId: undefined,
      year: undefined,
    });

    expect(screen.getByText("Toyota Camry")).toBeTruthy();
    expect(screen.queryByText(/undefined|null|·\s*$/)).toBeNull();
    expect(screen.getByText("20 Sep · Ashgabat")).toBeTruthy();
  });

  it("falls back to the No photos tile for a Listing without photos", () => {
    const screen = preview({ photoKeys: [], coverMediaKey: undefined, photoCount: 0 });

    expect(screen.getByText("No photos")).toBeTruthy();
    expect(screen.queryByText(/\d+ \/ \d+/)).toBeNull();
  });

  it("shows no contact bar to the owner or on a closed Listing", () => {
    for (const screen of [
      preview({}, { isOwner: true }),
      preview({ status: "sold" }),
      preview({ status: "archived" }),
    ]) {
      expect(screen.queryByRole("button", { name: "Call" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Message" })).toBeNull();
    }
  });

  it("leaves a replayed Message to the detail bar that replaces it", () => {
    const summary = summaryFixture();
    useAuthIntentStore.setState({ replayAction: { kind: "message", listingId: summary.id } });

    preview();

    expect(useAuthIntentStore.getState().replayAction).not.toBeNull();
    useAuthIntentStore.setState({ replayAction: null });
  });
});
