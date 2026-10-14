import { describe, expect, it } from "vitest";

import {
  FavoriteListingSummarySchema,
  FeedListingSummarySchema,
  ListingSummarySchema,
} from "./listings";

// What the Listing detail preview needs to place every field before detail
// loads (#867): all optional, so an older API's summary still parses.
const base = {
  id: "00000000-0000-4000-8000-000000000001",
  sellerId: "00000000-0000-4000-8000-000000000002",
  status: "active",
  brandId: "00000000-0000-4000-8000-000000000003",
  modelId: "00000000-0000-4000-8000-000000000004",
  priceAmount: 1000,
  priceCurrency: "TMT",
  displayPriceTmt: 1000,
  photoKeys: [],
  photoCount: 0,
  cityId: "00000000-0000-4000-8000-000000000005",
  publishedAt: "2026-10-01T00:00:00.000Z",
};
const previewFields = {
  enginePower: 150,
  driveTypeId: "00000000-0000-4000-8000-000000000006",
  bodyTypeId: "00000000-0000-4000-8000-000000000007",
  colorId: "00000000-0000-4000-8000-000000000008",
  hasVin: true,
  acceptsExchange: true,
  installmentAvailable: false,
};
const contactPreferences = { allowCalls: true, allowChat: true, hasContactPhone: false };

describe("Listing summary fields for the detail preview", () => {
  it.each([
    ["ListingSummary (My listings)", ListingSummarySchema],
    ["FeedListingSummary", FeedListingSummarySchema],
    ["FavoriteListingSummary", FavoriteListingSummarySchema],
  ] as const)("%s keeps power, drive, body, colour, VIN presence, exchange and installment", (_name, schema) => {
    expect(schema.parse({ ...base, ...contactPreferences, ...previewFields })).toMatchObject(previewFields);
  });

  it("keeps contact preferences on owner, feed and favorites summaries", () => {
    const item = { ...base, ...contactPreferences, ...previewFields };

    expect(FeedListingSummarySchema.parse(item)).toMatchObject(contactPreferences);
    expect(FavoriteListingSummarySchema.parse(item)).toMatchObject(contactPreferences);
    expect(ListingSummarySchema.parse(item)).toMatchObject({ allowCalls: true, allowChat: true });
  });

  it("still parses a summary from an older API without them", () => {
    const parsed = ListingSummarySchema.parse(base);

    for (const field of [...Object.keys(previewFields), "allowCalls", "allowChat"]) expect(parsed).not.toHaveProperty(field);
  });

  it("never carries the VIN itself or contact phone on owner summaries", () => {
    const parsed = ListingSummarySchema.parse({ ...base, vin: "JTDKB20U793456789", contactPhone: "+99365000000" });
    expect(parsed).not.toHaveProperty("vin");
    expect(parsed).not.toHaveProperty("contactPhone");
  });
});
