import { describe, it, expect } from "vitest";

import {
  decodeCursor,
  encodeCursor,
  FavoriteListingSummarySchema,
  FeedListingSummarySchema,
  FeedResponseSchema,
  ListingDetailSchema,
  MyListingsResponseSchema,
} from "./listings";

describe("decodeCursor", () => {
  it("roundtrips an encoded cursor", () => {
    const cursor = {
      timestamp: "2026-05-01T00:00:00.000Z",
      id: "00000000-0000-0000-0000-000000000001",
    };

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("rejects a token that is not base64url JSON", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrow();
  });

  it("rejects a forged cursor whose timestamp is not a datetime", () => {
    const forged = Buffer.from(
      JSON.stringify({
        timestamp: "not-a-date",
        id: "00000000-0000-0000-0000-000000000001",
      }),
      "utf8",
    ).toString("base64url");

    expect(() => decodeCursor(forged)).toThrow();
  });

  it("rejects a forged cursor whose id is not a uuid", () => {
    const forged = Buffer.from(
      JSON.stringify({ timestamp: "2026-05-01T00:00:00.000Z", id: "l1" }),
      "utf8",
    ).toString("base64url");

    expect(() => decodeCursor(forged)).toThrow();
  });
});

describe("ListingDetailSchema seller", () => {
  const SellerSchema = ListingDetailSchema.shape.seller;
  const seller = {
    displayName: null,
    nameNumber: 2057,
    avatarIndex: 7,
    avatarKey: null,
    deleted: false,
    memberSince: "2026-01-15T09:00:00.000Z",
  };

  it("carries the seller's public identity beside the join date", () => {
    expect(SellerSchema.parse(seller)).toEqual({
      displayName: null,
      nameNumber: 2057,
      avatarIndex: 7,
      avatarKey: null,
      deleted: false,
      memberSince: "2026-01-15T09:00:00.000Z",
    });
  });

  it("keeps a name the seller set and a photo key", () => {
    const parsed = SellerSchema.parse({
      ...seller,
      displayName: "Aman",
      avatarKey: "avatars/u1/photo.jpg",
    });

    expect(parsed.displayName).toBe("Aman");
    expect(parsed.avatarKey).toBe("avatars/u1/photo.jpg");
  });

  it("requires the name number, the avatar index and the deleted flag", () => {
    for (const field of ["nameNumber", "avatarIndex", "avatarKey", "deleted"]) {
      expect(
        SellerSchema.safeParse({ ...seller, [field]: undefined }).success,
        field,
      ).toBe(false);
    }
  });

  it("refuses a name number outside 1000 to 9999 and a negative avatar index", () => {
    expect(SellerSchema.safeParse({ ...seller, nameNumber: 999 }).success).toBe(false);
    expect(SellerSchema.safeParse({ ...seller, nameNumber: 10000 }).success).toBe(false);
    expect(SellerSchema.safeParse({ ...seller, avatarIndex: -1 }).success).toBe(false);
  });

  it("drops contact data, the role and the upload id even when a server sends them", () => {
    const parsed = SellerSchema.parse({
      ...seller,
      phone: "+99365000000",
      email: "a@b.tm",
      role: "seller",
      uploadId: "550e8400-e29b-41d4-a716-446655440009",
    });

    expect(Object.keys(parsed).sort()).toEqual([
      "avatarIndex",
      "avatarKey",
      "deleted",
      "displayName",
      "memberSince",
      "nameNumber",
    ]);
  });
});

describe("FeedListingSummarySchema for the Results card", () => {
  // What an API from before the Results card sends: no gallery, contact
  // preferences or seller.
  const olderSummary = {
    id: "550e8400-e29b-41d4-a716-446655440001",
    sellerId: "550e8400-e29b-41d4-a716-446655440002",
    status: "active",
    brandId: "550e8400-e29b-41d4-a716-446655440003",
    modelId: "550e8400-e29b-41d4-a716-446655440004",
    priceAmount: 125000,
    priceCurrency: "TMT",
    displayPriceTmt: 125000,
    photoKeys: ["p1", "p2"],
    photoCount: 9,
    cityId: "550e8400-e29b-41d4-a716-446655440005",
    publishedAt: "2026-10-01T08:00:00.000Z",
  };
  const cardSummary = {
    ...olderSummary,
    galleryKeys: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"],
    allowCalls: true,
    allowChat: false,
    seller: { displayName: "Aman", nameNumber: 4821, deleted: false },
  };

  it("still parses a summary from an API that sends none of the card fields", () => {
    const parsed = FeedListingSummarySchema.parse(olderSummary);

    expect(parsed).not.toHaveProperty("galleryKeys");
    expect(parsed).not.toHaveProperty("allowCalls");
    expect(parsed).not.toHaveProperty("allowChat");
    expect(parsed).not.toHaveProperty("seller");
    expect(FeedResponseSchema.parse({ items: [olderSummary], nextCursor: null }).items).toHaveLength(1);
  });

  it("carries up to eight gallery keys, the contact preferences and the seller's name", () => {
    expect(FeedListingSummarySchema.parse(cardSummary)).toMatchObject({
      galleryKeys: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"],
      allowCalls: true,
      allowChat: false,
      seller: { displayName: "Aman", nameNumber: 4821, deleted: false },
    });
  });

  it("refuses a ninth gallery key", () => {
    const nine = [...cardSummary.galleryKeys, "p9"];

    expect(FeedListingSummarySchema.safeParse({ ...cardSummary, galleryKeys: nine }).success).toBe(false);
  });

  it("keeps photoKeys at two keys for installed builds", () => {
    expect(
      FeedListingSummarySchema.safeParse({ ...cardSummary, photoKeys: ["p1", "p2", "p3"] }).success,
    ).toBe(false);
  });

  it("names a seller with no name set by number, and marks a deleted seller", () => {
    const parsed = FeedListingSummarySchema.parse({
      ...cardSummary,
      seller: { displayName: null, nameNumber: 2057, deleted: true },
    });

    expect(parsed.seller).toEqual({ displayName: null, nameNumber: 2057, deleted: true });
  });

  it("requires the seller's name number and deleted flag", () => {
    for (const field of ["displayName", "nameNumber", "deleted"]) {
      expect(
        FeedListingSummarySchema.safeParse({
          ...cardSummary,
          seller: { ...cardSummary.seller, [field]: undefined },
        }).success,
        field,
      ).toBe(false);
    }
  });

  it("drops avatar fields and contact data from the seller and the summary", () => {
    const parsed = FeedListingSummarySchema.parse({
      ...cardSummary,
      contactPhone: "+99365000000",
      seller: {
        ...cardSummary.seller,
        avatarIndex: 3,
        avatarKey: "avatars/u1/a.jpg",
        phone: "+99365000000",
      },
    });

    expect(parsed).not.toHaveProperty("contactPhone");
    expect(Object.keys(parsed.seller ?? {}).sort()).toEqual(["deleted", "displayName", "nameNumber"]);
  });

  it("still requires the contact preferences on a favorites item", () => {
    expect(FavoriteListingSummarySchema.safeParse(olderSummary).success).toBe(false);
    expect(
      FavoriteListingSummarySchema.parse({ ...olderSummary, allowCalls: false, allowChat: true }),
    ).toMatchObject({ allowCalls: false, allowChat: true });
  });

  it("keeps the card fields off favorites and My listings items", () => {
    const favorite = FavoriteListingSummarySchema.parse(cardSummary);
    const own = MyListingsResponseSchema.parse({ items: [cardSummary], nextCursor: null }).items[0];

    for (const parsed of [favorite, own]) {
      expect(parsed).not.toHaveProperty("galleryKeys");
      expect(parsed).not.toHaveProperty("seller");
    }
    expect(own).not.toHaveProperty("allowCalls");
    expect(own).not.toHaveProperty("allowChat");
  });

  it("sends the card fields through the feed response", () => {
    expect(FeedResponseSchema.parse({ items: [cardSummary], nextCursor: null }).items[0]).toMatchObject({
      galleryKeys: cardSummary.galleryKeys,
      allowCalls: true,
      allowChat: false,
      seller: { displayName: "Aman", nameNumber: 4821, deleted: false },
    });
  });
});
