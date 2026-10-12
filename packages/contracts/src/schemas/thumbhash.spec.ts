import { describe, expect, it } from "vitest";

import {
  ChatMessageEventSchema,
  ListMessagesResponseSchema,
  MessageSummarySchema,
  PostRefMessageMetadataSchema,
  SendMessageRequestSchema,
  SendMessageSocketRequestSchema,
  SendPostRefMessageRequestSchema,
} from "./conversations";
import {
  AttachMediaRequestSchema,
  AttachMediaResponseSchema,
  FavoriteListingSummarySchema,
  FeedListingSummarySchema,
  FeedResponseSchema,
  ListingDetailSchema,
  ListingMediaSchema,
  ListingSummarySchema,
  MyFavoritesResponseSchema,
  MyListingsResponseSchema,
} from "./listings";

// Standard base64 of ThumbHash bytes from evanw/thumbhash's reference
// encoder (`rgbaToThumbHash`), which always emits 17 to 25 bytes.
const HASH_17_BYTES = "D0odiiwIhHuIiIcLCIR3r4g=";
const HASH_WITH_SLASH = "H/gBBYBYF0tEUTWmlTEAppX5OAAl";
const HASH_WITH_PLUS = "1fsrB38I9wiIh4hwj3CI+AiIgIAICIgA";
const HASH_25_BYTES = "AAiCBQAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
const VALID_HASHES = [HASH_17_BYTES, HASH_WITH_SLASH, HASH_WITH_PLUS, HASH_25_BYTES];

const MALFORMED_HASHES: Array<[string, unknown]> = [
  ["an empty string", ""],
  ["base64url instead of standard base64", "H_gBBYBYF0tEUTWmlTEAppX5OAAl"],
  ["missing padding", "D0odiiwIhHuIiIcLCIR3r4g"],
  ["16 decoded bytes (below the 17-byte minimum)", "AAAAAAAAAAAAAAAAAAAAAA=="],
  ["26 decoded bytes (above the 25-byte maximum)", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="],
  ["a data URI", `data:image/png;base64,${HASH_WITH_PLUS}`],
  ["embedded whitespace", "1fsrB38I9wiIh4hw j3CI+AiIgIAICIgA"],
  ["a misplaced padding character", "1fsrB38I9wiI=4hwj3CI+AiIgIAICIgA"],
  ["a number", 42],
];

const ID = (n: number) => `550e8400-e29b-41d4-a716-4466554400${String(n).padStart(2, "0")}`;

const media = {
  id: ID(10),
  kind: "image",
  key: "listings/l1/p1/original.webp",
  variants: { thumbnail: "t", list: "l", detail: "d", fullscreen: "f" },
  width: 1280,
  height: 960,
  sortOrder: 0,
};

const summary = {
  id: ID(1),
  sellerId: ID(2),
  status: "active",
  brandId: ID(3),
  modelId: ID(4),
  priceAmount: 125000,
  priceCurrency: "TMT",
  displayPriceTmt: 125000,
  photoKeys: ["p1", "p2"],
  photoCount: 9,
  cityId: ID(5),
  publishedAt: "2026-10-01T08:00:00.000Z",
};

const galleryKeys = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
const galleryThumbHashes = [
  HASH_17_BYTES,
  null,
  HASH_WITH_SLASH,
  HASH_WITH_PLUS,
  null,
  HASH_25_BYTES,
  HASH_17_BYTES,
  null,
];
const favorite = { ...summary, allowCalls: true, allowChat: true };

const detail = {
  id: ID(1),
  publicNumber: 1001,
  sellerId: ID(2),
  seller: {
    displayName: "Aman",
    nameNumber: 4821,
    avatarIndex: 0,
    avatarKey: null,
    deleted: false,
    memberSince: "2026-01-01T00:00:00.000Z",
  },
  status: "active",
  brandId: ID(3),
  modelId: ID(4),
  priceAmount: 125000,
  priceCurrency: "TMT",
  displayPriceTmt: 125000,
  regionId: ID(6),
  cityId: ID(5),
  allowCalls: true,
  allowChat: true,
  acceptsExchange: false,
  installmentAvailable: false,
  media: [media],
  viewCount: 0,
  favoriteCount: 0,
  publishedAt: "2026-10-01T08:00:00.000Z",
  createdAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "2026-10-01T08:00:00.000Z",
};

const imageMessage = {
  id: ID(20),
  conversationId: ID(21),
  senderId: ID(2),
  kind: "image",
  text: null,
  metadata: { key: `chat/${ID(21)}/a.webp`, width: 800, height: 600 },
  createdAt: "2026-10-01T08:00:00.000Z",
};

const postRef = {
  listingId: ID(1),
  brandId: ID(3),
  modelId: ID(4),
  year: 2021,
  displayPriceTmt: 200000,
  priceCurrency: "TMT",
  coverMediaKey: "listings/l1/p1/original.webp",
  status: "active",
  available: true,
};

describe("ThumbHash encoding on ListingMedia", () => {
  it.each(VALID_HASHES)("carries the server hash %s unchanged", (thumbHash) => {
    expect(ListingMediaSchema.parse({ ...media, thumbHash })).toMatchObject({ thumbHash });
  });

  it.each(MALFORMED_HASHES)("rejects %s", (_label, thumbHash) => {
    expect(ListingMediaSchema.safeParse({ ...media, thumbHash }).success).toBe(false);
  });

  it("still parses legacy media that has no hash", () => {
    expect(ListingMediaSchema.parse(media)).not.toHaveProperty("thumbHash");
  });

  it("carries the hash through Listing detail and rejects a malformed one there", () => {
    const parsed = ListingDetailSchema.parse({
      ...detail,
      media: [{ ...media, thumbHash: HASH_WITH_PLUS }, { ...media, id: ID(11), sortOrder: 1 }],
    });
    expect(parsed.media[0]).toMatchObject({ thumbHash: HASH_WITH_PLUS });
    expect(parsed.media[1]).not.toHaveProperty("thumbHash");
    expect(
      ListingDetailSchema.safeParse({ ...detail, media: [{ ...media, thumbHash: "nope" }] }).success,
    ).toBe(false);
  });

  it("carries the hash on the attach response, which still parses without one", () => {
    const attached = {
      id: ID(10),
      listingId: ID(1),
      kind: "image",
      key: media.key,
      sortOrder: 0,
      createdAt: "2026-10-01T08:00:00.000Z",
    };
    expect(AttachMediaResponseSchema.parse(attached)).not.toHaveProperty("thumbHash");
    expect(AttachMediaResponseSchema.parse({ ...attached, thumbHash: HASH_17_BYTES })).toMatchObject({
      thumbHash: HASH_17_BYTES,
    });
    expect(AttachMediaResponseSchema.safeParse({ ...attached, thumbHash: "x" }).success).toBe(false);
  });
});

describe("photoThumbHashes on ListingSummary", () => {
  it("still parses a summary without hashes", () => {
    expect(ListingSummarySchema.parse(summary)).not.toHaveProperty("photoThumbHashes");
  });

  it("keeps the hashes in photoKeys order with null for a photo that has none", () => {
    const parsed = ListingSummarySchema.parse({
      ...summary,
      photoThumbHashes: [null, HASH_WITH_SLASH],
    });
    expect(parsed).toMatchObject({ photoKeys: ["p1", "p2"], photoThumbHashes: [null, HASH_WITH_SLASH] });

    const swapped = ListingSummarySchema.parse({
      ...summary,
      photoKeys: ["p2", "p1"],
      photoThumbHashes: [HASH_WITH_SLASH, null],
    });
    expect(swapped).toMatchObject({ photoKeys: ["p2", "p1"], photoThumbHashes: [HASH_WITH_SLASH, null] });
  });

  it("accepts an empty hash list for a Listing without photos", () => {
    expect(
      ListingSummarySchema.parse({ ...summary, photoKeys: [], photoCount: 0, photoThumbHashes: [] }),
    ).toMatchObject({ photoThumbHashes: [] });
  });

  it.each([
    ["fewer hashes than keys", [HASH_17_BYTES]],
    ["more hashes than keys", [HASH_17_BYTES, null, HASH_WITH_PLUS]],
  ])("rejects %s", (_label, photoThumbHashes) => {
    expect(ListingSummarySchema.safeParse({ ...summary, photoThumbHashes }).success).toBe(false);
  });

  it("rejects a malformed hash slot", () => {
    expect(
      ListingSummarySchema.safeParse({ ...summary, photoThumbHashes: [HASH_17_BYTES, "not-a-hash"] }).success,
    ).toBe(false);
  });

  it("applies the same rules to My listings", () => {
    expect(
      MyListingsResponseSchema.parse({
        items: [{ ...summary, photoThumbHashes: [HASH_17_BYTES, null] }],
        nextCursor: null,
      }).items[0],
    ).toMatchObject({ photoThumbHashes: [HASH_17_BYTES, null] });
    expect(
      MyListingsResponseSchema.safeParse({
        items: [{ ...summary, photoThumbHashes: [HASH_17_BYTES] }],
        nextCursor: null,
      }).success,
    ).toBe(false);
  });
});

describe.each([
  ["feed item", FeedListingSummarySchema, summary],
  ["Favorites item", FavoriteListingSummarySchema, favorite],
] as const)("galleryThumbHashes on a %s", (_label, schema, base) => {
  it("still parses an item without gallery hashes", () => {
    const parsed = schema.parse({ ...base, galleryKeys });
    expect(parsed).not.toHaveProperty("galleryThumbHashes");
    expect(parsed).not.toHaveProperty("photoThumbHashes");
  });

  it("keeps gallery and photo hashes in key order with nullable slots", () => {
    const parsed = schema.parse({
      ...base,
      photoThumbHashes: galleryThumbHashes.slice(0, 2),
      galleryKeys,
      galleryThumbHashes,
    });
    expect(parsed).toMatchObject({
      photoKeys: ["p1", "p2"],
      photoThumbHashes: [HASH_17_BYTES, null],
      galleryKeys,
      galleryThumbHashes,
    });
  });

  it.each([
    ["fewer gallery hashes than keys", galleryKeys, galleryThumbHashes.slice(0, 7)],
    ["more gallery hashes than keys", galleryKeys.slice(0, 7), galleryThumbHashes],
    ["gallery hashes without gallery keys", undefined, [HASH_17_BYTES, null]],
  ])("rejects %s", (_label, keys, hashes) => {
    expect(schema.safeParse({ ...base, galleryKeys: keys, galleryThumbHashes: hashes }).success).toBe(false);
  });

  it("rejects a malformed gallery hash slot", () => {
    const hashes = [...galleryThumbHashes];
    hashes[3] = "H_gBBYBYF0tEUTWmlTEAppX5OAAl";
    expect(schema.safeParse({ ...base, galleryKeys, galleryThumbHashes: hashes }).success).toBe(false);
  });

  it("still checks photoThumbHashes against photoKeys", () => {
    expect(schema.safeParse({ ...base, photoThumbHashes: [null] }).success).toBe(false);
  });
});

describe("gallery hashes in page responses", () => {
  it("carries them through the feed and Favorites pages and rejects a mismatch", () => {
    const item = { ...summary, galleryKeys, galleryThumbHashes };
    expect(FeedResponseSchema.parse({ items: [item], nextCursor: null }).items[0]).toMatchObject({
      galleryThumbHashes,
    });
    expect(
      FeedResponseSchema.safeParse({
        items: [{ ...item, galleryThumbHashes: galleryThumbHashes.slice(1) }],
        nextCursor: null,
      }).success,
    ).toBe(false);

    const favoriteItem = { ...favorite, galleryKeys, galleryThumbHashes };
    const counts = { total: 1, inactive: 0 };
    expect(
      MyFavoritesResponseSchema.parse({ items: [favoriteItem], nextCursor: null, counts }).items[0],
    ).toMatchObject({ galleryThumbHashes });
    expect(
      MyFavoritesResponseSchema.safeParse({
        items: [{ ...favoriteItem, galleryThumbHashes: galleryThumbHashes.slice(1) }],
        nextCursor: null,
        counts,
      }).success,
    ).toBe(false);
  });
});

describe("thumbHash on image Message metadata", () => {
  it("still parses an image Message without a hash", () => {
    expect(MessageSummarySchema.parse(imageMessage).metadata).not.toHaveProperty("thumbHash");
  });

  it("carries the server hash on a Message, a page and the socket event", () => {
    const message = { ...imageMessage, metadata: { ...imageMessage.metadata, thumbHash: HASH_WITH_SLASH } };
    expect(MessageSummarySchema.parse(message).metadata).toMatchObject({ thumbHash: HASH_WITH_SLASH });
    expect(
      ListMessagesResponseSchema.parse({ items: [message], nextCursor: null }).items[0]?.metadata,
    ).toMatchObject({ thumbHash: HASH_WITH_SLASH });
    expect(ChatMessageEventSchema.parse({ message }).message.metadata).toMatchObject({
      thumbHash: HASH_WITH_SLASH,
    });
  });

  it.each(MALFORMED_HASHES)("rejects %s", (_label, thumbHash) => {
    const message = { ...imageMessage, metadata: { ...imageMessage.metadata, thumbHash } };
    expect(MessageSummarySchema.safeParse(message).success).toBe(false);
  });
});

describe("coverThumbHash on a listing-reference Message", () => {
  it("still parses a snapshot without a cover hash", () => {
    expect(PostRefMessageMetadataSchema.parse(postRef)).not.toHaveProperty("coverThumbHash");
  });

  it("carries the cover hash beside coverMediaKey", () => {
    expect(PostRefMessageMetadataSchema.parse({ ...postRef, coverThumbHash: HASH_25_BYTES })).toMatchObject({
      coverMediaKey: postRef.coverMediaKey,
      coverThumbHash: HASH_25_BYTES,
    });
    expect(
      MessageSummarySchema.parse({
        ...imageMessage,
        kind: "post_ref",
        metadata: { ...postRef, coverThumbHash: HASH_25_BYTES },
      }).metadata,
    ).toMatchObject({ coverThumbHash: HASH_25_BYTES });
  });

  it.each(MALFORMED_HASHES)("rejects %s", (_label, coverThumbHash) => {
    expect(PostRefMessageMetadataSchema.safeParse({ ...postRef, coverThumbHash }).success).toBe(false);
  });
});

describe("client input cannot supply a hash", () => {
  it("drops a hash from an image send over HTTP and keeps the legacy send working", () => {
    const parsed = SendMessageRequestSchema.parse({
      kind: "image",
      metadata: { key: imageMessage.metadata.key, width: 800, height: 600, thumbHash: HASH_WITH_PLUS },
      clientMessageId: "c1",
    });
    expect(parsed).toEqual({
      kind: "image",
      metadata: { key: imageMessage.metadata.key, width: 800, height: 600 },
      clientMessageId: "c1",
    });
  });

  it("drops a hash, even a malformed one, from an image send over the socket", () => {
    const parsed = SendMessageSocketRequestSchema.parse({
      conversationId: ID(21),
      kind: "image",
      metadata: { key: imageMessage.metadata.key, thumbHash: "client-made" },
    });
    expect(parsed).toEqual({
      conversationId: ID(21),
      kind: "image",
      metadata: { key: imageMessage.metadata.key },
    });
  });

  it("refuses a cover hash on a listing-reference send, which takes only the Listing id", () => {
    expect(
      SendPostRefMessageRequestSchema.safeParse({
        metadata: { listingId: ID(1), coverThumbHash: HASH_WITH_PLUS },
      }).success,
    ).toBe(false);
  });

  it("drops a hash from an attach request", () => {
    const parsed = AttachMediaRequestSchema.parse({
      key: media.key,
      kind: "image",
      sortOrder: 0,
      thumbHash: HASH_WITH_PLUS,
    });
    expect(parsed).toEqual({ key: media.key, kind: "image", sortOrder: 0 });
  });
});
