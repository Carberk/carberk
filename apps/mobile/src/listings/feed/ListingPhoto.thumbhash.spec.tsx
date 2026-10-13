import type { ListingsSchemas } from "@auto-tm/contracts";
import { describe, expect, it, vi } from "vitest";

import { renderMobile, getAllHosts } from "../../../test/render";

import { ListingCard } from "./ListingCard";
import { ListingGridCard } from "./ListingGridCard";
import { ListingLargeCard } from "./ListingLargeCard";
import { ListingPhoto } from "./ListingPhoto";

vi.mock("../../api/client", () => ({ apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }, ApiError: class ApiError extends Error {} }));
vi.mock("../../conversations/useOpenListingConversation", () => ({
  useOpenListingConversation: () => ({ open: vi.fn(), retry: vi.fn(), isPending: false, error: null }),
}));

const H1 = "1fsDBYCIiIiHiIdweIeHh4d4cIgH";
const H2 = "2yMBBYCIh4iHiHeAiId4dXh3f4f4";

const listing: ListingsSchemas.ListingSummary = {
  id: "listing", sellerId: "seller", status: "active", brandId: "brand", modelId: "model", year: 2018,
  priceAmount: 2, priceCurrency: "USD", displayPriceTmt: 70000, coverMediaKey: "one.webp",
  photoKeys: ["one.webp", "two.webp"], photoThumbHashes: [H1, H2], photoCount: 2, cityId: "city",
  publishedAt: "2026-09-30T04:00:00.000Z",
};

const placeholders = (screen: Awaited<ReturnType<typeof renderMobile>>) =>
  getAllHosts(screen.container, "Image").map((image) => image.props.placeholder as unknown);

describe("Listing photo blurred preview", () => {
  it("shows the photo's ThumbHash while the photo loads", async () => {
    const screen = await renderMobile(<ListingPhoto mediaKey="one.webp" thumbHash={H1} emptyLabel="No photo" />);

    expect(placeholders(screen)).toEqual([{ thumbhash: H1 }]);
  });

  it("has no placeholder for a photo without a ThumbHash", async () => {
    const screen = await renderMobile(<ListingPhoto mediaKey="one.webp" emptyLabel="No photo" />);

    expect(placeholders(screen)).toEqual([undefined]);
  });

  it("previews every photo of the Results strip with its own ThumbHash, none where the feed sent null", async () => {
    const item: ListingsSchemas.FeedListingSummary = {
      ...listing, photoCount: 3, galleryKeys: ["one.webp", "two.webp", "three.webp"], galleryThumbHashes: [H1, null, H2],
    };
    const screen = await renderMobile(
      <ListingLargeCard listing={item} brandName="Toyota" modelName="Camry" isAuthenticated={false} returnTo="/(tabs)/(search)/results" onPress={vi.fn()} />,
    );

    expect(placeholders(screen)).toEqual([{ thumbhash: H1 }, undefined, { thumbhash: H2 }]);
  });

  it("previews the grid card's first photo with its ThumbHash", async () => {
    const screen = await renderMobile(
      <ListingGridCard listing={listing} brandName="Toyota" modelName="Camry" isAuthenticated={false} returnTo="/(tabs)/(search)/results" onPress={vi.fn()} />,
    );

    expect(placeholders(screen)).toEqual([{ thumbhash: H1 }]);
  });

  it("previews an owner card's cover with the first photo's ThumbHash when the cover is that photo", async () => {
    const screen = await renderMobile(<ListingCard listing={listing} onPress={vi.fn()} />);

    expect(placeholders(screen)).toEqual([{ thumbhash: H1 }]);
  });

  it("gives an owner card's video cover no photo's ThumbHash", async () => {
    const screen = await renderMobile(<ListingCard listing={{ ...listing, coverMediaKey: "clip.mp4" }} onPress={vi.fn()} />);

    expect(placeholders(screen)).toEqual([undefined]);
  });
});
