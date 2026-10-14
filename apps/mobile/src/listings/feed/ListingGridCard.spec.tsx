import { readFileSync } from "fs";
import { resolve } from "path";

import type { ListingsSchemas } from "@auto-tm/contracts";
import { describe, expect, it, vi } from "vitest";

import { renderMobile } from "../../../test/render";

import { ListingGridCard } from "./ListingGridCard";

vi.mock("../../api/client", () => ({ apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }, ApiError: class ApiError extends Error {} }));

const source = readFileSync(resolve(__dirname, "./ListingGridCard.tsx"), "utf-8");
// The heart on the photo is shared by every Listing card.
const photo = readFileSync(resolve(__dirname, "./ListingPhoto.tsx"), "utf-8");

describe("ListingGridCard", () => {
  it("renders the text from the pure card rules", () => {
    expect(source).toContain("listingGridCardText({");
    expect(source).toContain("{text.price}");
    expect(source).toContain("{text.title}");
    expect(source).toContain("{text.meta}");
  });

  it("keeps the price, title and meta to one line each", () => {
    expect(source.match(/numberOfLines=\{1\}/g)).toHaveLength(3);
  });

  it("shows no date, city, gearbox, fuel, or badges", () => {
    for (const absent of [
      "publishedAt",
      "cityId",
      "cityName",
      "transmissionId",
      "engineTypeId",
      "sellerTrust",
      "<Badge",
    ]) {
      expect(source).not.toContain(absent);
    }
  });

  it("shows a title placeholder only while catalog names load, then drops an unknown title", () => {
    expect(source).toContain(") : titlePending ? (");
    expect(source).toContain("titlePending = false,");
  });

  it("drops the meta line when it has nothing to show", () => {
    expect(source).toContain("{text.meta ? (");
  });

  it("puts ♡ on the rounded photo and routes it through useListingFavorite", () => {
    expect(source).toContain("rounded-2xl");
    expect(source).toContain("<PhotoFavoriteButton");
    expect(photo).toContain("absolute right-0 top-0");
    expect(source).toContain("useListingFavorite({");
    expect(source).toContain("onPress={toggle}");
    expect(source).toContain("accessibilityState={{ selected: favorited");
  });

  it("fills the saved ♥ with an explicit colour, since currentColor does not resolve natively", () => {
    expect(photo).toContain("fill-brand-500");
    expect(photo).not.toContain("fill-current");
    expect(source).not.toContain("fill-current");
  });

  it("uses the first photo key and falls back to the cover key", () => {
    expect(source).toContain("listing.photoKeys[0] ?? listing.coverMediaKey");
  });

  // `flex-1` is grow 1, shrink 1, basis 0%. Down the card (the column axis)
  // Yoga's single-flex-child shortcut leaves a flex basis of 0 on such a view
  // once its row stretches it, and reuses that 0 the next time the list
  // changes height and re-measures the untouched row: the row then measures
  // 0 tall and every such row piles up in the first one. So only the card's
  // root, which shares the row's width, may flex; the rest sizes to content.
  it("lets only the card's root flex, so a re-measured row keeps its height", () => {
    const card = source.slice(
      source.indexOf("<EnterOnce"),
      source.indexOf("</EnterOnce>"),
    );
    expect(card.match(/className="[^"]*\bflex-1\b/g)).toHaveLength(1);
    expect(card).toContain('<EnterOnce order={enterOrder} className="min-w-0 flex-1">');
  });

  it("exports a skeleton with the same photo shape", () => {
    expect(source).toContain("export function ListingGridCardSkeleton");
    expect(source.match(/aspect-photo w-full/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

const summary: ListingsSchemas.ListingSummary = { id: "listing", sellerId: "seller", status: "active", brandId: "brand", modelId: "model", year: 2018, priceAmount: 2, priceCurrency: "USD", displayPriceTmt: 70000, photoKeys: ["one.webp", "two.webp"], photoCount: 7, cityId: "city", publishedAt: "2026-09-30T04:00:00.000Z" };

describe("ListingGridCard photo count", () => {
  it.each([0, 1, 2, 7])("renders no photo count for a Listing with %i photos", async (photoCount) => {
    const photoKeys = ["one.webp", "two.webp"].slice(0, photoCount);
    for (const locale of ["en", "ru", "tk"]) {
      const view = await renderMobile(
        <ListingGridCard listing={{ ...summary, photoKeys, photoCount }} onPress={vi.fn()} brandName="Toyota" modelName="Camry" isAuthenticated={false} returnTo="/(tabs)/(search)" />,
        { locale },
      );
      expect(view.queryByLabelText(/(Photos|Фото|Suratlar): \d/)).toBeNull();
      expect(view.queryByText(String(photoCount))).toBeNull();
      expect(view.getByText("Toyota Camry")).toBeTruthy();
    }
  });
});
