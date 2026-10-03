import { describe, it, expect } from "vitest";

import {
  OtpRequestRequestSchema,
  OtpVerifyRequestSchema,
  SignInMethodChangeRequestSchema,
  SignInMethodChangeVerifyRequestSchema,
  SignInMethodChangeResponseSchema,
  AccountDeletionRequestSchema,
  AccountDeletionRequestResponseSchema,
  AccountDeletionConfirmRequestSchema,
  EmailCodeJobSchema,
} from "../src/schemas/auth";
import { SignInCodePurpose } from "../src/enums";
import {
  ListingSummarySchema,
  ListingDetailSchema,
  ListingMediaSchema,
  ListingDraftPayloadSchema,
  ListingDraftSchema,
  EditListingRequestSchema,
  FeedQuerySchema,
  FeedResponseSchema,
  FavoriteListingSummarySchema,
  MyFavoritesQuerySchema,
  MyFavoritesResponseSchema,
  ListingFilterSchema,
  encodeCursor,
  decodeCursor,
  encodeFeedCursor,
  decodeFeedCursor,
  FEED_SORT_VALUES,
  ListingCountQuerySchema,
  ListingCountResponseSchema,
  ListingBrandCountQuerySchema,
  ListingBrandCountResponseSchema,
  MyListingCountsResponseSchema,
  ListingsErrorCode,
  ConditionDisclosureSchema,
  DraftConditionDisclosureSchema,
  VerifiedContactPhoneSchema,
  ContactPhoneCodeRequestSchema,
  ContactPhoneCodeRequestResponseSchema,
  ContactPhoneVerifyRequestSchema,
  ContactPhoneVerifyResponseSchema,
  MyContactPhonesResponseSchema,
  ContactPhoneNotConfirmedDetailsSchema,
} from "../src/schemas/listings";
import {
  PresignRequestSchema,
  PresignResponseSchema,
} from "../src/schemas/uploads";
import {
  ExchangeRateSchema,
  ExchangeRatesResponseSchema,
} from "../src/schemas/exchange-rates";
import {
  OpenConversationRequestSchema,
  SendTextMessageRequestSchema,
  ConversationSummarySchema,
  MessageSummarySchema,
  ConversationListingCardSchema,
  ListMessagesQuerySchema,
  ListConversationsQuerySchema,
  ListMessagesResponseSchema,
  ListConversationsResponseSchema,
} from "../src/schemas/conversations";
import { ErrorResponseSchema, InvalidOtpDetailsSchema } from "../src/errors";
import { generateOpenApiDocument } from "../src/openapi";
import {
  WizardStepSchema,
  validateStep,
  isWizardErrorKey,
  getStepDependencies,
  getInvalidatedSteps,
  WIZARD_STEPS,
  StepPhotosSchema,
  StepVehicleSchema,
  StepSpecsSchema,
  StepPriceSchema,
  StepLocationSchema,
  StepContactSchema,
  ValidateStepRequestSchema,
  ValidateStepResponseSchema,
} from "../src/schemas/wizard";

describe("OTP request schema", () => {
  it("accepts a valid TM mobile phone (+99362001122)", () => {
    const result = OtpRequestRequestSchema.safeParse({
      phone: "+99362001122",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-TM phone (+15551234567)", () => {
    const result = OtpRequestRequestSchema.safeParse({
      phone: "+15551234567",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a TM landline prefix (+99312001122)", () => {
    const result = OtpRequestRequestSchema.safeParse({
      phone: "+99312001122",
    });
    expect(result.success).toBe(false);
  });

  it("accepts and normalizes an email address", () => {
    const result = OtpRequestRequestSchema.safeParse({
      email: " Buyer@Example.COM ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ email: "buyer@example.com" });
  });

  it("rejects both destinations and rejects neither", () => {
    expect(OtpRequestRequestSchema.safeParse({}).success).toBe(false);
    expect(OtpRequestRequestSchema.safeParse({
      phone: "+99362001122",
      email: "buyer@example.com",
    }).success).toBe(false);
  });
});

describe("OTP verify schema", () => {
  it("accepts valid phone + 6-digit code", () => {
    const result = OtpVerifyRequestSchema.safeParse({
      phone: "+99365001122",
      code: "123456",
    });
    expect(result.success).toBe(true);
  });

  it("rejects 5-digit code", () => {
    const result = OtpVerifyRequestSchema.safeParse({
      phone: "+99365001122",
      code: "12345",
    });
    expect(result.success).toBe(false);
  });

  it("accepts email plus a 6-digit code and rejects both destinations", () => {
    expect(OtpVerifyRequestSchema.safeParse({
      email: "buyer@example.com",
      code: "123456",
    }).success).toBe(true);
    expect(OtpVerifyRequestSchema.safeParse({
      phone: "+99365001122",
      email: "buyer@example.com",
      code: "123456",
    }).success).toBe(false);
  });
});

describe("Sign-in Method change schemas", () => {
  it("accepts exactly one normalized destination on request and verify", () => {
    expect(SignInMethodChangeRequestSchema.parse({
      email: " New@Example.COM ",
    })).toEqual({ email: "new@example.com" });
    expect(SignInMethodChangeVerifyRequestSchema.parse({
      phone: "+99365001122",
      code: "123456",
    })).toEqual({ phone: "+99365001122", code: "123456" });
    expect(SignInMethodChangeVerifyRequestSchema.safeParse({
      phone: "+99365001122",
      email: "new@example.com",
      code: "123456",
    }).success).toBe(false);
  });

  it("returns the current nullable Sign-in Methods", () => {
    expect(SignInMethodChangeResponseSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      phone: null,
      email: "new@example.com",
      phoneVerified: false,
      displayName: null,
      role: "buyer",
      avatarUrl: null,
      locale: "ru",
      createdAt: "2026-09-24T00:00:00.000Z",
      deletionScheduledAt: null,
    }).success).toBe(true);
  });

  it("accepts the runtime SIGN_IN_METHOD_TAKEN error envelope", () => {
    expect(ErrorResponseSchema.safeParse({
      statusCode: 409,
      code: "SIGN_IN_METHOD_TAKEN",
      message: "This Sign-in Method belongs to another User.",
      timestamp: "2026-09-24T00:00:00.000Z",
      requestId: "550e8400-e29b-41d4-a716-446655440000",
    }).success).toBe(true);
  });

  it.each([
    "OTP_EXPIRED",
    "OTP_ALREADY_USED",
    "INVALID_OTP",
    "OTP_LOCKED",
    "OTP_NOT_FOUND",
  ])("accepts the runtime %s error envelope", (code) => {
    expect(ErrorResponseSchema.safeParse({
      statusCode: 400,
      code,
      message: "The verification code could not be used.",
      timestamp: "2026-09-24T00:00:00.000Z",
      requestId: "550e8400-e29b-41d4-a716-446655440000",
    }).success).toBe(true);
  });

  it.each([
    { statusCode: 401, code: "UNAUTHORIZED" },
    { statusCode: 404, code: "USER_NOT_FOUND" },
  ])("accepts the runtime $code error envelope", ({ statusCode, code }) => {
    expect(ErrorResponseSchema.safeParse({
      statusCode,
      code,
      message: "The request could not be completed.",
      timestamp: "2026-09-24T00:00:00.000Z",
      requestId: "550e8400-e29b-41d4-a716-446655440000",
    }).success).toBe(true);
  });
});

// ── Listings schemas ──

const validListingSummary = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  sellerId: "550e8400-e29b-41d4-a716-446655440001",
  status: "active" as const,
  brandId: "550e8400-e29b-41d4-a716-446655440002",
  modelId: "550e8400-e29b-41d4-a716-446655440003",
  priceAmount: 1890000,
  priceCurrency: "TMT" as const,
  displayPriceTmt: 1890000,
  photoKeys: [] as string[],
  photoCount: 0,
  cityId: "550e8400-e29b-41d4-a716-446655440004",
  publishedAt: "2026-05-17T14:32:01Z",
};

function without<T extends object>(obj: T, key: keyof T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => k !== key),
  ) as Partial<T>;
}

describe("ListingSummarySchema", () => {
  it("accepts a valid summary", () => {
    const result = ListingSummarySchema.safeParse(validListingSummary);
    expect(result.success).toBe(true);
  });

  it("rejects negative priceAmount", () => {
    const result = ListingSummarySchema.safeParse({
      ...validListingSummary,
      priceAmount: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status", () => {
    const result = ListingSummarySchema.safeParse({
      ...validListingSummary,
      status: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("does not carry a per-Listing seller trust signal", () => {
    const result = ListingSummarySchema.safeParse({
      ...validListingSummary,
      sellerTrust: { phoneVerified: true },
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("sellerTrust");
  });

  it("accepts card fields and a signed-in isFavorited flag", () => {
    const result = ListingSummarySchema.safeParse({
      ...validListingSummary,
      photoKeys: ["listings/a/0.jpg", "listings/a/1.jpg"],
      photoCount: 7,
      mileageKm: 120000,
      condition: "used",
      transmissionId: "550e8400-e29b-41d4-a716-446655440010",
      engineTypeId: "550e8400-e29b-41d4-a716-446655440011",
      isFavorited: true,
    });
    expect(result.success).toBe(true);
  });

  it("requires photoKeys and photoCount", () => {
    const withoutKeys = without(validListingSummary, "photoKeys");
    const withoutCount = without(validListingSummary, "photoCount");
    expect(ListingSummarySchema.safeParse(withoutKeys).success).toBe(false);
    expect(ListingSummarySchema.safeParse(withoutCount).success).toBe(false);
  });

  it("rejects more than two photoKeys", () => {
    const result = ListingSummarySchema.safeParse({
      ...validListingSummary,
      photoKeys: ["a", "b", "c"],
      photoCount: 3,
    });
    expect(result.success).toBe(false);
  });
});

describe("FavoriteListingSummarySchema", () => {
  const validFavorite = {
    ...validListingSummary,
    contactPhone: "+99365000000",
    allowCalls: true,
    allowChat: false,
  };

  it("accepts a summary with contact preferences", () => {
    expect(FavoriteListingSummarySchema.safeParse(validFavorite).success).toBe(true);
  });

  it("allows contactPhone to be absent", () => {
    const withoutPhone = without(validFavorite, "contactPhone");
    expect(FavoriteListingSummarySchema.safeParse(withoutPhone).success).toBe(true);
  });

  it("requires allowCalls and allowChat", () => {
    const withoutCalls = without(validFavorite, "allowCalls");
    const withoutChat = without(validFavorite, "allowChat");
    expect(FavoriteListingSummarySchema.safeParse(withoutCalls).success).toBe(false);
    expect(FavoriteListingSummarySchema.safeParse(withoutChat).success).toBe(false);
  });

  it("is the MyFavoritesResponse item shape", () => {
    const result = MyFavoritesResponseSchema.safeParse({
      items: [validListingSummary],
      nextCursor: null,
    });
    expect(result.success).toBe(false);
    expect(
      MyFavoritesResponseSchema.safeParse({
        items: [validFavorite],
        nextCursor: null,
        counts: { total: 1, inactive: 0 },
      }).success,
    ).toBe(true);
  });

  it("requires counts with non-negative whole numbers", () => {
    const page = { items: [validFavorite], nextCursor: null };
    expect(MyFavoritesResponseSchema.safeParse(page).success).toBe(false);
    expect(
      MyFavoritesResponseSchema.safeParse({ ...page, counts: { total: 3 } }).success,
    ).toBe(false);
    expect(
      MyFavoritesResponseSchema.safeParse({ ...page, counts: { total: 3, inactive: -1 } })
        .success,
    ).toBe(false);
    expect(
      MyFavoritesResponseSchema.safeParse({ ...page, counts: { total: 2.5, inactive: 1 } })
        .success,
    ).toBe(false);
  });
});

describe("MyFavoritesQuerySchema", () => {
  it("defaults to all visible Favorites, 20 per page", () => {
    expect(MyFavoritesQuerySchema.parse({})).toEqual({ limit: 20, activeOnly: false });
  });

  it("reads activeOnly from the query strings true and false", () => {
    expect(MyFavoritesQuerySchema.parse({ activeOnly: "true" }).activeOnly).toBe(true);
    expect(MyFavoritesQuerySchema.parse({ activeOnly: "false" }).activeOnly).toBe(false);
  });

  it("rejects other activeOnly values instead of coercing them", () => {
    expect(MyFavoritesQuerySchema.safeParse({ activeOnly: "yes" }).success).toBe(false);
    expect(MyFavoritesQuerySchema.safeParse({ activeOnly: "1" }).success).toBe(false);
    expect(MyFavoritesQuerySchema.safeParse({ activeOnly: "" }).success).toBe(false);
  });

  it("keeps the cursor and the 1 to 50 limit", () => {
    expect(MyFavoritesQuerySchema.parse({ cursor: "abc", limit: "5" })).toMatchObject({
      cursor: "abc",
      limit: 5,
    });
    expect(MyFavoritesQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(MyFavoritesQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
  });
});

describe("ListingDetailSchema", () => {
  const sellerFields = {
    publicNumber: 10482,
    seller: {
      displayName: null,
      memberSince: "2025-01-01T00:00:00.000Z",
    },
  };

  it("accepts a valid detail", () => {
    const result = ListingDetailSchema.safeParse({
      ...validListingSummary,
      ...sellerFields,
      media: [],
      allowCalls: true,
      allowChat: true,
      viewCount: 0,
      favoriteCount: 0,
      regionId: "550e8400-e29b-41d4-a716-446655440005",
      createdAt: "2026-05-17T14:32:01Z",
      updatedAt: "2026-05-17T14:32:01Z",
      acceptsExchange: false,
      installmentAvailable: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects description over 2000 chars", () => {
    const result = ListingDetailSchema.safeParse({
      ...validListingSummary,
      ...sellerFields,
      media: [],
      allowCalls: true,
      allowChat: true,
      viewCount: 0,
      favoriteCount: 0,
      regionId: "550e8400-e29b-41d4-a716-446655440005",
      createdAt: "2026-05-17T14:32:01Z",
      updatedAt: "2026-05-17T14:32:01Z",
      description: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("does not carry a per-Listing seller trust signal", () => {
    const result = ListingDetailSchema.safeParse({
      ...validListingSummary,
      ...sellerFields,
      sellerTrust: { phoneVerified: true },
      media: [],
      allowCalls: true,
      allowChat: true,
      viewCount: 0,
      favoriteCount: 0,
      regionId: "550e8400-e29b-41d4-a716-446655440005",
      createdAt: "2026-05-17T14:32:01Z",
      updatedAt: "2026-05-17T14:32:01Z",
      acceptsExchange: false,
      installmentAvailable: false,
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("sellerTrust");
  });

  it("requires the public number and seller join date", () => {
    const base = {
      ...validListingSummary,
      ...sellerFields,
      media: [],
      allowCalls: true,
      allowChat: true,
      viewCount: 0,
      favoriteCount: 0,
      regionId: "550e8400-e29b-41d4-a716-446655440005",
      createdAt: "2026-05-17T14:32:01Z",
      updatedAt: "2026-05-17T14:32:01Z",
      acceptsExchange: false,
      installmentAvailable: false,
    };
    expect(ListingDetailSchema.safeParse({ ...base, publicNumber: undefined }).success).toBe(false);
    expect(ListingDetailSchema.safeParse({
      ...base,
      seller: { displayName: null },
    }).success).toBe(false);
  });
});

describe("ListingMediaSchema", () => {
  it("accepts a valid image media", () => {
    const result = ListingMediaSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      kind: "image" as const,
      key: "listings/abc/123/original.jpg",
      variants: {
        thumbnail: "listings/abc/123/thumbnail.jpg",
        list: "listings/abc/123/list.jpg",
        detail: "listings/abc/123/detail.jpg",
        fullscreen: "listings/abc/123/fullscreen.jpg",
      },
      sortOrder: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid video media with optional fields", () => {
    const result = ListingMediaSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      kind: "video" as const,
      key: "listings/abc/123/original.mp4",
      variants: {
        thumbnail: "listings/abc/123/thumbnail.jpg",
        list: "listings/abc/123/list.jpg",
        detail: "listings/abc/123/detail.jpg",
        fullscreen: "listings/abc/123/fullscreen.jpg",
      },
      sortOrder: 1,
      width: 1920,
      height: 1080,
      durationMs: 30000,
      posterKey: "listings/abc/123/poster.jpg",
    });
    expect(result.success).toBe(true);
  });
});

describe("ListingDraftPayloadSchema", () => {
  it("accepts a partial payload (any subset)", () => {
    const result = ListingDraftPayloadSchema.safeParse({
      currentStep: 3,
      brandId: "550e8400-e29b-41d4-a716-446655440002",
      modelId: "550e8400-e29b-41d4-a716-446655440003",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty payload", () => {
    const result = ListingDraftPayloadSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects currentStep outside 1..7", () => {
    const result = ListingDraftPayloadSchema.safeParse({
      currentStep: 8,
    });
    expect(result.success).toBe(false);
  });

  it("accepts validatedSteps in payload", () => {
    const result = ListingDraftPayloadSchema.safeParse({
      vin: "WBA123",
      validatedSteps: ["vin", "photos"],
    });
    expect(result.success).toBe(true);
  });
});

describe("ListingDraftSchema", () => {
  it("accepts a valid draft", () => {
    const result = ListingDraftSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      userId: "550e8400-e29b-41d4-a716-446655440001",
      payload: { currentStep: 2, photos: [] },
      createdAt: "2026-05-17T14:32:01Z",
      updatedAt: "2026-05-17T14:32:01Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("EditListingRequestSchema", () => {
  it("accepts valid editable fields", () => {
    const result = EditListingRequestSchema.safeParse({
      priceAmount: 2000000,
      priceCurrency: "USD",
      description: "Great car",
    });
    expect(result.success).toBe(true);
  });

  it("rejects locked fields via strict()", () => {
    const result = EditListingRequestSchema.safeParse({
      brandId: "550e8400-e29b-41d4-a716-446655440002",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields via strict()", () => {
    const result = EditListingRequestSchema.safeParse({
      unknownField: "value",
    });
    expect(result.success).toBe(false);
  });
});

describe("Feed cursor helpers", () => {
  it("encode + decode round-trips", () => {
    const cursor = {
      timestamp: "2026-05-17T14:32:01Z",
      id: "550e8400-e29b-41d4-a716-446655440000",
    };
    const encoded = encodeCursor(cursor);
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual(cursor);
  });

  it("rejects malformed cursor on decode", () => {
    expect(() => decodeCursor("not-valid-base64")).toThrow();
  });
});

describe("Sort-aware feed cursor helpers", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";

  it("round-trips a cursor for every order", () => {
    const cursors = [
      { sort: "newest", value: "2026-05-17T14:32:01.000Z", id },
      { sort: "price_asc", value: 35000.5, id },
      { sort: "price_desc", value: null, id },
      { sort: "year_desc", value: 2018, id },
      { sort: "year_asc", value: null, id },
      { sort: "mileage_asc", value: 0, id },
    ] as const;
    for (const cursor of cursors) {
      expect(decodeFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor);
    }
  });

  it("rejects a value that does not fit the cursor's order", () => {
    const token = (payload: unknown) =>
      Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    expect(() => decodeFeedCursor(token({ sort: "newest", value: null, id }))).toThrow();
    expect(() => decodeFeedCursor(token({ sort: "year_asc", value: 2018.5, id }))).toThrow();
    expect(() => decodeFeedCursor(token({ sort: "price_asc", value: "cheap", id }))).toThrow();
    expect(() => decodeFeedCursor(token({ sort: "best_deal", value: 1, id }))).toThrow();
  });

  it("rejects the sortless cursor shape", () => {
    expect(() =>
      decodeFeedCursor(encodeCursor({ timestamp: "2026-05-17T14:32:01Z", id })),
    ).toThrow();
  });
});

describe("FeedQuerySchema", () => {
  it("accepts valid query with defaults", () => {
    const result = FeedQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  it("defaults sort to newest and accepts every approved order", () => {
    const parsed = FeedQuerySchema.parse({});
    expect(parsed.sort).toBe("newest");
    for (const sort of FEED_SORT_VALUES) {
      expect(FeedQuerySchema.parse({ sort }).sort).toBe(sort);
    }
  });

  it("rejects an unknown sort", () => {
    expect(FeedQuerySchema.safeParse({ sort: "best_deal" }).success).toBe(false);
  });

  it("rejects limit over 50", () => {
    const result = FeedQuerySchema.safeParse({ limit: 100 });
    expect(result.success).toBe(false);
  });

  it("accepts query with filter fields", () => {
    const result = FeedQuerySchema.safeParse({
      cursor: "abc123",
      limit: 10,
      brandId: "550e8400-e29b-41d4-a716-446655440002",
      priceMin: 50000,
      yearMin: 2018,
      condition: "used",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.brandId).toBe("550e8400-e29b-41d4-a716-446655440002");
      expect(result.data.priceMin).toBe(50000);
      expect(result.data.yearMin).toBe(2018);
      expect(result.data.condition).toBe("used");
    }
  });

  it("coerces string query values to numbers", () => {
    const result = FeedQuerySchema.safeParse({
      priceMin: "150000",
      priceMax: "300000",
      yearMin: "2015",
      yearMax: "2022",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceMin).toBe(150000);
      expect(result.data.priceMax).toBe(300000);
      expect(result.data.yearMin).toBe(2015);
      expect(result.data.yearMax).toBe(2022);
    }
  });

  it("rejects negative priceMin", () => {
    const result = FeedQuerySchema.safeParse({ priceMin: -100 });
    expect(result.success).toBe(false);
  });

  it("rejects yearMin below 1900", () => {
    const result = FeedQuerySchema.safeParse({ yearMin: 1899 });
    expect(result.success).toBe(false);
  });

  it("rejects yearMax above 2100", () => {
    const result = FeedQuerySchema.safeParse({ yearMax: 2101 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid condition", () => {
    const result = FeedQuerySchema.safeParse({ condition: "broken" });
    expect(result.success).toBe(false);
  });
});

describe("ListingCountQuerySchema / ListingCountResponseSchema", () => {
  it("accepts an optional sort and rejects an unknown one", () => {
    expect(ListingCountQuerySchema.parse({}).sort).toBeUndefined();
    expect(ListingCountQuerySchema.parse({ sort: "price_desc" }).sort).toBe("price_desc");
    expect(ListingCountQuerySchema.safeParse({ sort: "relevance" }).success).toBe(false);
  });

  it("keeps the model-filter rules", () => {
    expect(
      ListingCountQuerySchema.safeParse({
        modelIds: ["550e8400-e29b-41d4-a716-446655440001"],
      }).success,
    ).toBe(false);
  });

  it("requires the price range, null when nothing matches", () => {
    expect(
      ListingCountResponseSchema.safeParse({
        totalMatching: 0,
        priceMinTmt: null,
        priceMaxTmt: null,
      }).success,
    ).toBe(true);
    expect(
      ListingCountResponseSchema.safeParse({
        totalMatching: 3,
        priceMinTmt: 35000,
        priceMaxTmt: 350000,
      }).success,
    ).toBe(true);
    expect(ListingCountResponseSchema.safeParse({ totalMatching: 3 }).success).toBe(false);
  });
});

describe("ListingBrandCountQuerySchema / ListingBrandCountResponseSchema", () => {
  it("accepts scalar filters and rejects brand or model filters", () => {
    expect(
      ListingBrandCountQuerySchema.safeParse({ cityId: "550e8400-e29b-41d4-a716-446655440003" })
        .success,
    ).toBe(true);
    expect(
      ListingBrandCountQuerySchema.safeParse({ brandId: "550e8400-e29b-41d4-a716-446655440002" })
        .success,
    ).toBe(false);
    expect(
      ListingBrandCountQuerySchema.safeParse({ modelId: "550e8400-e29b-41d4-a716-446655440001" })
        .success,
    ).toBe(false);
  });

  it("parses brand counts", () => {
    expect(
      ListingBrandCountResponseSchema.safeParse({
        items: [{ brandId: "550e8400-e29b-41d4-a716-446655440002", totalMatching: 4 }],
      }).success,
    ).toBe(true);
  });
});

describe("MyListingCountsResponseSchema", () => {
  const counts = { active: 2, sold: 1, archived: 1, banned: 0, drafts: 1, total: 5 };

  it("parses the six counts", () => {
    expect(MyListingCountsResponseSchema.parse(counts)).toEqual(counts);
  });

  it("rejects a missing, negative, or fractional count", () => {
    expect(MyListingCountsResponseSchema.safeParse({ ...counts, drafts: undefined }).success).toBe(false);
    expect(MyListingCountsResponseSchema.safeParse({ ...counts, banned: -1 }).success).toBe(false);
    expect(MyListingCountsResponseSchema.safeParse({ ...counts, total: 1.5 }).success).toBe(false);
  });
});

describe("ListingFilterSchema", () => {
  it("accepts empty filter", () => {
    const result = ListingFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial filter", () => {
    const result = ListingFilterSchema.safeParse({
      brandId: "550e8400-e29b-41d4-a716-446655440002",
      priceMin: 100000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts full filter", () => {
    const result = ListingFilterSchema.safeParse({
      brandId: "550e8400-e29b-41d4-a716-446655440002",
      modelId: "550e8400-e29b-41d4-a716-446655440003",
      cityId: "550e8400-e29b-41d4-a716-446655440004",
      priceMin: 50000,
      priceMax: 200000,
      yearMin: 2010,
      yearMax: 2023,
      condition: "new",
    });
    expect(result.success).toBe(true);
  });

  it("coerces string numbers", () => {
    const result = ListingFilterSchema.safeParse({
      priceMin: "150000",
      yearMin: "2018",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceMin).toBe(150000);
      expect(result.data.yearMin).toBe(2018);
    }
  });

  it("rejects negative priceMin", () => {
    const result = ListingFilterSchema.safeParse({ priceMin: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects yearMin below 1900", () => {
    const result = ListingFilterSchema.safeParse({ yearMin: 1899 });
    expect(result.success).toBe(false);
  });

  it("rejects yearMax above 2100", () => {
    const result = ListingFilterSchema.safeParse({ yearMax: 2101 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid condition", () => {
    const result = ListingFilterSchema.safeParse({ condition: "repaired" });
    expect(result.success).toBe(false);
  });
});

describe("ConditionDisclosureSchema", () => {
  const validDisclosure = {
    damaged: true,
    knownIssuesText: "Small scratch",
  };

  it("accepts a valid full disclosure", () => {
    const result = ConditionDisclosureSchema.safeParse(validDisclosure);
    expect(result.success).toBe(true);
  });

  it("accepts damaged: false without Known issues", () => {
    const result = ConditionDisclosureSchema.safeParse({ damaged: false });
    expect(result.success).toBe(true);
  });

  it("requires the Damaged answer", () => {
    const result = ConditionDisclosureSchema.safeParse({ knownIssuesText: "Rust" });
    expect(result.success).toBe(false);
  });

  it("drops the removed S9a fields", () => {
    const result = ConditionDisclosureSchema.safeParse({
      damaged: false,
      accidentReported: true,
      ownerCount: 2,
    });
    expect(result.success && result.data).toEqual({ damaged: false });
  });

  it("lets a draft hold Known issues before the Damaged answer", () => {
    const result = DraftConditionDisclosureSchema.safeParse({ knownIssuesText: "Rust" });
    expect(result.success).toBe(true);
  });

  it("rejects knownIssuesText over 1000 characters", () => {
    const result = ConditionDisclosureSchema.safeParse({
      ...validDisclosure,
      knownIssuesText: "x".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("trims knownIssuesText whitespace", () => {
    const result = ConditionDisclosureSchema.safeParse({
      ...validDisclosure,
      knownIssuesText: "  small scratch  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.knownIssuesText).toBe("small scratch");
    }
  });
});

describe("FeedResponseSchema", () => {
  it("accepts a valid response", () => {
    const result = FeedResponseSchema.safeParse({
      items: [validListingSummary],
      nextCursor: null,
    });
    expect(result.success).toBe(true);
  });
});

// ── Uploads schemas ──

describe("PresignRequestSchema", () => {
  it("accepts a valid image presign request", () => {
    const result = PresignRequestSchema.safeParse({
      kind: "image",
      contentType: "image/jpeg",
      sizeBytes: 4_000_000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero sizeBytes", () => {
    const result = PresignRequestSchema.safeParse({
      kind: "video",
      contentType: "video/mp4",
      sizeBytes: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("PresignResponseSchema", () => {
  it("accepts a valid presign response", () => {
    const result = PresignResponseSchema.safeParse({
      uploadUrl: "https://minio.auto.tm/bucket/key?X-Amz-...",
      key: "uploads/abc/123.jpg",
      expiresIn: 300,
      maxSizeBytes: 5_242_880,
    });
    expect(result.success).toBe(true);
  });
});

// ── Exchange-rates schemas ──

describe("ExchangeRateSchema", () => {
  it("accepts a valid rate", () => {
    const result = ExchangeRateSchema.safeParse({
      fromCurrency: "USD",
      toCurrency: "TMT",
      rate: 3.5,
      updatedAt: "2026-05-17T14:32:01Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative rate", () => {
    const result = ExchangeRateSchema.safeParse({
      fromCurrency: "USD",
      toCurrency: "TMT",
      rate: -1,
      updatedAt: "2026-05-17T14:32:01Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("ExchangeRatesResponseSchema", () => {
  it("accepts a valid response", () => {
    const result = ExchangeRatesResponseSchema.safeParse({
      rates: [
        {
          fromCurrency: "USD",
          toCurrency: "TMT",
          rate: 3.5,
          updatedAt: "2026-05-17T14:32:01Z",
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

// ── Wizard schemas ──

const validUuid = "550e8400-e29b-41d4-a716-446655440000";
const validPhoto = { photoId: validUuid, key: "uploads/abc.jpg", sortOrder: 0 };

describe("WizardStepSchema", () => {
  it("lists the seven steps in the Sell wizard order", () => {
    expect(WIZARD_STEPS).toEqual([
      "vehicle",
      "specs",
      "photos",
      "price",
      "location",
      "contact",
      "review",
    ]);
  });

  it("no longer has a VIN step", () => {
    expect(WizardStepSchema.safeParse("vin").success).toBe(false);
  });

  it("accepts valid steps", () => {
    expect(WizardStepSchema.safeParse("vehicle").success).toBe(true);
    expect(WizardStepSchema.safeParse("photos").success).toBe(true);
    expect(WizardStepSchema.safeParse("contact").success).toBe(true);
    expect(WizardStepSchema.safeParse("review").success).toBe(true);
  });

  it("rejects invalid step", () => {
    expect(WizardStepSchema.safeParse("publish").success).toBe(false);
    expect(WizardStepSchema.safeParse("unknown").success).toBe(false);
  });
});

describe("StepPhotosSchema", () => {
  it("accepts photos with at least one key", () => {
    expect(StepPhotosSchema.safeParse({ photos: [validPhoto] }).success).toBe(
      true,
    );
  });

  it("rejects empty photos array", () => {
    expect(StepPhotosSchema.safeParse({ photos: [] }).success).toBe(false);
  });

  it("rejects photos with no uploaded keys", () => {
    expect(
      StepPhotosSchema.safeParse({ photos: [{ photoId: validUuid, sortOrder: 0 }] }).success,
    ).toBe(false);
  });
});

describe("StepVehicleSchema", () => {
  it("accepts valid vehicle data", () => {
    expect(
      StepVehicleSchema.safeParse({
        brandId: validUuid,
        modelId: validUuid,
        year: 2020,
      }).success,
    ).toBe(true);
  });

  it("rejects missing brandId", () => {
    expect(
      StepVehicleSchema.safeParse({ modelId: validUuid, year: 2020 }).success,
    ).toBe(false);
  });

  it("rejects year below 1900", () => {
    expect(
      StepVehicleSchema.safeParse({
        brandId: validUuid,
        modelId: validUuid,
        year: 1899,
      }).success,
    ).toBe(false);
  });

  it("rejects year too far in future", () => {
    expect(
      StepVehicleSchema.safeParse({
        brandId: validUuid,
        modelId: validUuid,
        year: new Date().getFullYear() + 2,
      }).success,
    ).toBe(false);
  });

  it("accepts an optional VIN of up to 17 characters", () => {
    const car = { brandId: validUuid, modelId: validUuid, year: 2020 };
    expect(StepVehicleSchema.safeParse(car).success).toBe(true);
    expect(
      StepVehicleSchema.safeParse({ ...car, vin: "WBA1234567890ABCD" }).success,
    ).toBe(true);
  });

  it("rejects a VIN over 17 characters with vinTooLong under the field", () => {
    const result = validateStep("vehicle", {
      brandId: validUuid,
      modelId: validUuid,
      year: 2020,
      vin: "A".repeat(18),
    });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors["vin"]).toBe("wizardErrors.vinTooLong");
  });
});

describe("StepSpecsSchema", () => {
  const answered = { conditionDisclosure: { damaged: false } };

  it("accepts new vehicle without mileage", () => {
    expect(
      StepSpecsSchema.safeParse({ condition: "new", ...answered }).success,
    ).toBe(true);
  });

  it("requires the Damaged answer", () => {
    const result = StepSpecsSchema.safeParse({
      condition: "new",
      conditionDisclosure: { knownIssuesText: "Rust" },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      message: "wizardErrors.damagedRequired",
      path: ["conditionDisclosure", "damaged"],
    });
  });

  it("accepts either Damaged answer", () => {
    for (const damaged of [true, false]) {
      expect(
        StepSpecsSchema.safeParse({ condition: "new", conditionDisclosure: { damaged } }).success,
      ).toBe(true);
    }
  });

  it("rejects used vehicle without mileage", () => {
    expect(
      StepSpecsSchema.safeParse({ condition: "used" }).success,
    ).toBe(false);
  });

  it("accepts used vehicle with mileage", () => {
    expect(
      StepSpecsSchema.safeParse({ condition: "used", mileageKm: 50000, ...answered }).success,
    ).toBe(true);
  });

  it("rejects negative mileage", () => {
    expect(
      StepSpecsSchema.safeParse({
        condition: "used",
        mileageKm: -1,
      }).success,
    ).toBe(false);
  });
});

describe("StepPriceSchema", () => {
  it("accepts valid TMT price", () => {
    expect(
      StepPriceSchema.safeParse({ priceAmount: 100000, priceCurrency: "TMT" })
        .success,
    ).toBe(true);
  });

  it("rejects zero price", () => {
    expect(
      StepPriceSchema.safeParse({ priceAmount: 0, priceCurrency: "TMT" })
        .success,
    ).toBe(false);
  });

  it("rejects price over max", () => {
    expect(
      StepPriceSchema.safeParse({
        priceAmount: 1_000_000_000,
        priceCurrency: "TMT",
      }).success,
    ).toBe(false);
  });
});

describe("StepLocationSchema", () => {
  it("accepts a description with a valid place", () => {
    expect(
      StepLocationSchema.safeParse({
        description: "Great car",
        regionId: validUuid,
        cityId: validUuid,
      }).success,
    ).toBe(true);
  });

  it("requires the description", () => {
    const result = validateStep("location", {
      regionId: validUuid,
      cityId: validUuid,
    });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors["description"]).toBe(
      "wizardErrors.descriptionRequired",
    );
  });

  it("rejects an empty description", () => {
    expect(
      StepLocationSchema.safeParse({
        description: "",
        regionId: validUuid,
        cityId: validUuid,
      }).success,
    ).toBe(false);
  });

  it("rejects a description over 2000 chars", () => {
    const result = validateStep("location", {
      description: "a".repeat(2001),
      regionId: validUuid,
      cityId: validUuid,
    });
    expect(result.fieldErrors["description"]).toBe(
      "wizardErrors.descriptionTooLong",
    );
  });

  it("rejects missing regionId", () => {
    expect(
      StepLocationSchema.safeParse({ description: "Great car", cityId: validUuid })
        .success,
    ).toBe(false);
  });

  it("rejects location text over 200 chars", () => {
    expect(
      StepLocationSchema.safeParse({
        description: "Great car",
        regionId: validUuid,
        cityId: validUuid,
        locationText: "a".repeat(201),
      }).success,
    ).toBe(false);
  });
});

describe("StepContactSchema", () => {
  it("accepts both contact methods without a description", () => {
    expect(
      StepContactSchema.safeParse({
        contactPhone: "+99361234567",
        allowCalls: true,
        allowChat: true,
      }).success,
    ).toBe(true);
  });

  it("accepts one contact method and today's contact phone", () => {
    expect(
      StepContactSchema.safeParse({
        contactPhone: "+99361234567",
        allowCalls: false,
        allowChat: true,
      }).success,
    ).toBe(true);
  });

  it("rejects when both contact methods disabled", () => {
    const result = validateStep("contact", { contactPhone: "+99361234567", allowCalls: false, allowChat: false });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors["allowCalls"]).toBe(
      "wizardErrors.contactChannelRequired",
    );
  });
});

describe("validateStep", () => {
  it("returns valid for complete vehicle step", () => {
    const result = validateStep("vehicle", {
      brandId: validUuid,
      modelId: validUuid,
      year: 2020,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("returns errors for incomplete vehicle step", () => {
    const result = validateStep("vehicle", { brandId: validUuid });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns errors for used vehicle without mileage", () => {
    const result = validateStep("specs", { condition: "used" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("wizardErrors.mileageRequiredForUsed");
    expect(result.fieldErrors["mileageKm"]).toBe(
      "wizardErrors.mileageRequiredForUsed",
    );
  });

  it("returns valid for photos with uploaded key", () => {
    const result = validateStep("photos", { photos: [validPhoto] });
    expect(result.valid).toBe(true);
    expect(result.fieldErrors).toEqual({});
  });

  it("returns errors for photos without key", () => {
    const result = validateStep("photos", {
      photos: [{ photoId: validUuid, sortOrder: 0 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("wizardErrors.photosUploading");
  });

  it("returns per-field error map for vehicle step", () => {
    const result = validateStep("vehicle", {});
    expect(result.valid).toBe(false);
    expect(result.fieldErrors["brandId"]).toBe("wizardErrors.brandRequired");
    expect(result.fieldErrors["modelId"]).toBe("wizardErrors.modelRequired");
    expect(result.fieldErrors["year"]).toBe("wizardErrors.yearRequired");
  });

  it("returns valid for review when invoked directly", () => {
    const result = validateStep("review", {});
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  // Messages cross the API boundary and land in a Turkmen or Russian UI, so
  // none of them may be English prose — clients translate the keys (ADR-0050).
  it.each([
    ["vehicle", { vin: "x".repeat(18) }],
    ["photos", {}],
    ["vehicle", {}],
    ["specs", { condition: "used" }],
    ["specs", {}],
    ["price", {}],
    ["price", { priceAmount: -1, priceCurrency: "TMT" }],
    ["location", {}],
    ["contact", {}],
    ["contact", { allowCalls: false, allowChat: false }],
    ["location", { regionId: "", cityId: "", description: "x".repeat(2001) }],
    // Zod built-ins the schemas never spell out a message for.
    ["vehicle", { brandId: null, modelId: "no", year: 2020 }],
    ["specs", { condition: "used", mileageKm: 12.5, enginePower: 1.5 }],
    ["specs", { condition: "new", colorId: "not-a-uuid" }],
    ["specs", { condition: "salvaged" }],
    ["price", { priceAmount: 100, priceCurrency: "XYZ" }],
    ["location", { regionId: null, cityId: null }],
  ] as const)("emits only translation keys for %s", (step, payload) => {
    const result = validateStep(step, payload as never);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    for (const message of [...result.errors, ...Object.values(result.fieldErrors)]) {
      expect(isWizardErrorKey(message), message).toBe(true);
    }
  });

  it("asks for a photo whether the list is missing or empty", () => {
    expect(validateStep("photos", {}).fieldErrors["photos"]).toBe(
      "wizardErrors.photosRequired",
    );
    expect(validateStep("photos", { photos: [] }).fieldErrors["photos"]).toBe(
      "wizardErrors.photosRequired",
    );
  });

  it("reports a missing field as required and a wrong value as invalid", () => {
    expect(validateStep("specs", {}).fieldErrors["condition"]).toBe(
      "wizardErrors.required",
    );
    expect(
      validateStep("specs", { condition: "salvaged" } as never).fieldErrors["condition"],
    ).toBe("wizardErrors.invalidValue");
    expect(
      validateStep("price", { priceAmount: 100, priceCurrency: "XYZ" } as never)
        .fieldErrors["priceCurrency"],
    ).toBe("wizardErrors.invalidValue");
  });
});

describe("getStepDependencies", () => {
  it("Car has no dependencies", () => {
    expect(getStepDependencies("vehicle")).toEqual([]);
  });

  it("photos depends on Car and Details", () => {
    expect(getStepDependencies("photos")).toEqual(["vehicle", "specs"]);
  });

  it("contact depends on all previous steps", () => {
    expect(getStepDependencies("contact")).toEqual([
      "vehicle",
      "specs",
      "photos",
      "price",
      "location",
    ]);
  });
});

describe("getInvalidatedSteps", () => {
  it("changing brandId invalidates Car and every later step", () => {
    expect(getInvalidatedSteps(["brandId"])).toEqual([
      "vehicle",
      "specs",
      "photos",
      "price",
      "location",
      "contact",
      "review",
    ]);
  });

  it("changing the VIN invalidates Car, which now owns it", () => {
    expect(getInvalidatedSteps(["vin"])).toEqual([
      "vehicle",
      "specs",
      "photos",
      "price",
      "location",
      "contact",
      "review",
    ]);
  });

  it("changing photos invalidates photos and the steps after it", () => {
    expect(getInvalidatedSteps(["photos"])).toEqual([
      "photos",
      "price",
      "location",
      "contact",
      "review",
    ]);
  });

  it("changing description invalidates Description and place and the steps after it", () => {
    expect(getInvalidatedSteps(["description"])).toEqual([
      "location",
      "contact",
      "review",
    ]);
  });

  it("changing a contact switch only invalidates contact and review", () => {
    expect(getInvalidatedSteps(["allowChat"])).toEqual(["contact", "review"]);
  });

  it("unknown fields are ignored", () => {
    expect(getInvalidatedSteps(["unknownField"])).toEqual([]);
  });
});

describe("ValidateStepRequestSchema", () => {
  it("accepts valid request", () => {
    const result = ValidateStepRequestSchema.safeParse({
      step: "vehicle",
      payload: { brandId: validUuid, modelId: validUuid, year: 2020 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid step", () => {
    const result = ValidateStepRequestSchema.safeParse({
      step: "publish",
      payload: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("ValidateStepResponseSchema", () => {
  it("accepts valid response", () => {
    const result = ValidateStepResponseSchema.safeParse({
      valid: true,
      errors: [],
      invalidatedSteps: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts response with errors", () => {
    const result = ValidateStepResponseSchema.safeParse({
      valid: false,
      errors: ["Missing brandId"],
      invalidatedSteps: ["vehicle"],
    });
    expect(result.success).toBe(true);
  });
});

describe("Account deletion schemas", () => {
  it("accepts exactly one normalized destination on request and confirm", () => {
    expect(AccountDeletionRequestSchema.parse({
      email: " Seller@Example.COM ",
    })).toEqual({ email: "seller@example.com" });
    expect(AccountDeletionConfirmRequestSchema.parse({
      phone: "+99365001122",
      code: "123456",
    })).toEqual({ phone: "+99365001122", code: "123456" });
    expect(AccountDeletionConfirmRequestSchema.safeParse({
      phone: "+99365001122",
      email: "seller@example.com",
      code: "123456",
    }).success).toBe(false);
    expect(AccountDeletionConfirmRequestSchema.safeParse({
      email: "seller@example.com",
      code: "123456",
      deviceLabel: "web",
    }).success).toBe(false);
  });

  it("answers a request with the Sign-in Code request shape", () => {
    expect(AccountDeletionRequestResponseSchema.safeParse({
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      resendInSeconds: 60,
    }).success).toBe(true);
  });
});

describe("Sign-in Code purposes", () => {
  it("names the four flows that issue a code (ADR-0081)", () => {
    expect(Object.values(SignInCodePurpose).sort()).toEqual([
      "account-deletion",
      "listing-contact-phone",
      "sign-in",
      "sign-in-method",
    ]);
  });

  it("queues email codes only for the three email flows", () => {
    const job = { to: "seller@example.com", code: "123456", locale: "ru" };
    for (const purpose of ["sign-in", "sign-in-method", "account-deletion"]) {
      expect(EmailCodeJobSchema.safeParse({ ...job, purpose }).success).toBe(true);
    }
    expect(EmailCodeJobSchema.safeParse({
      ...job,
      purpose: "listing-contact-phone",
    }).success).toBe(false);
  });
});

// ── OpenAPI document ──

describe("OpenAPI document", () => {
  it("contains auth OTP request and verify paths", () => {
    const doc = generateOpenApiDocument() as {
      paths: Record<string, unknown>;
    };
    expect(doc.paths).toHaveProperty("/api/v1/auth/otp/request");
    expect(doc.paths).toHaveProperty("/api/v1/auth/otp/verify");
    expect(doc.paths).toHaveProperty("/api/v1/me/sign-in-methods/request");
    expect(doc.paths).toHaveProperty("/api/v1/me/sign-in-methods/verify");
  });

  it("documents every reachable Sign-in Method route status", () => {
    const doc = generateOpenApiDocument() as {
      paths: Record<string, {
        post?: { responses?: Record<string, unknown> };
      }>;
    };
    for (const path of [
      "/api/v1/me/sign-in-methods/request",
      "/api/v1/me/sign-in-methods/verify",
    ]) {
      expect(doc.paths[path]?.post?.responses).toHaveProperty("401");
      expect(doc.paths[path]?.post?.responses).toHaveProperty("404");
    }
    expect(doc.paths["/api/v1/me/sign-in-methods/verify"]?.post?.responses)
      .toHaveProperty("409");
  });

  it("documents the public account deletion routes", () => {
    const doc = generateOpenApiDocument() as {
      paths: Record<string, {
        post?: { responses?: Record<string, unknown> };
      }>;
    };
    expect(doc.paths["/api/v1/account-deletion/request"]?.post?.responses)
      .toHaveProperty("201");
    const confirm = doc.paths["/api/v1/account-deletion/confirm"]?.post?.responses;
    expect(confirm).toHaveProperty("204");
    expect(confirm).toHaveProperty("400");
    expect(confirm).not.toHaveProperty("404");
  });

  it("contains new listings schemas", () => {
    const doc = generateOpenApiDocument() as {
      components: { schemas: Record<string, unknown> };
    };
    expect(doc.components.schemas).toHaveProperty("ListingSummary");
    expect(doc.components.schemas).toHaveProperty("ListingDetail");
    expect(doc.components.schemas).toHaveProperty("ListingMedia");
    expect(doc.components.schemas).toHaveProperty("ListingDraft");
    expect(doc.components.schemas).toHaveProperty("FeedResponse");
    expect(doc.components.schemas).toHaveProperty("FavoriteListingSummary");
    expect(doc.components.schemas).toHaveProperty("MyFavoritesResponse");
  });

  it("contains uploads and exchange-rates schemas", () => {
    const doc = generateOpenApiDocument() as {
      components: { schemas: Record<string, unknown> };
    };
    expect(doc.components.schemas).toHaveProperty("PresignRequest");
    expect(doc.components.schemas).toHaveProperty("PresignResponse");
    expect(doc.components.schemas).toHaveProperty("ExchangeRate");
    expect(doc.components.schemas).toHaveProperty("ExchangeRatesResponse");
  });

  it("contains conversation schemas", () => {
    const doc = generateOpenApiDocument() as {
      components: { schemas: Record<string, unknown> };
    };
    expect(doc.components.schemas).toHaveProperty("OpenConversationRequest");
    expect(doc.components.schemas).toHaveProperty("OpenConversationResponse");
    expect(doc.components.schemas).toHaveProperty("ConversationSummary");
    expect(doc.components.schemas).toHaveProperty("MessageSummary");
    expect(doc.components.schemas).toHaveProperty("ConversationListingCard");
    expect(doc.components.schemas).toHaveProperty("ListConversationsResponse");
    expect(doc.components.schemas).toHaveProperty("ListMessagesResponse");
    expect(doc.components.schemas).toHaveProperty("SendTextMessageRequest");
    expect(doc.components.schemas).toHaveProperty("SendTextMessageResponse");
  });

  it("contains conversation paths", () => {
    const doc = generateOpenApiDocument() as {
      paths: Record<string, unknown>;
    };
    expect(doc.paths).toHaveProperty("/api/v1/conversations");
    expect(doc.paths).toHaveProperty("/api/v1/conversations/{id}/messages");
  });
});

// ── Conversation schemas ──

const validConversationListingCard = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  brandId: "550e8400-e29b-41d4-a716-446655440001",
  modelId: "550e8400-e29b-41d4-a716-446655440002",
  year: 2020,
  displayPriceTmt: 1890000,
  priceCurrency: "TMT" as const,
  coverMediaKey: "listings/abc/123/cover.jpg",
  status: "active" as const,
};

const validMessageSummary = {
  id: "550e8400-e29b-41d4-a716-446655440003",
  conversationId: "550e8400-e29b-41d4-a716-446655440004",
  senderId: "550e8400-e29b-41d4-a716-446655440005",
  text: "Is it still available?",
  createdAt: "2026-05-17T14:32:01Z",
};

const validConversationSummary = {
  id: "550e8400-e29b-41d4-a716-446655440004",
  listing: validConversationListingCard,
  buyerId: "550e8400-e29b-41d4-a716-446655440005",
  sellerId: "550e8400-e29b-41d4-a716-446655440006",
  myRole: "buyer" as const,
  peer: {
    id: "550e8400-e29b-41d4-a716-446655440006",
    displayName: "Aman",
  },
  blockedByMe: false,
  lastMessage: validMessageSummary,
  updatedAt: "2026-05-17T14:32:01Z",
};

describe("ConversationListingCardSchema", () => {
  it("accepts a valid listing card", () => {
    const result = ConversationListingCardSchema.safeParse(
      validConversationListingCard,
    );
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = ConversationListingCardSchema.safeParse({
      ...validConversationListingCard,
      status: "invalid_status",
    });
    expect(result.success).toBe(false);
  });
});

describe("MessageSummarySchema", () => {
  it("accepts a valid message summary", () => {
    const result = MessageSummarySchema.safeParse(validMessageSummary);
    expect(result.success).toBe(true);
  });

  it("accepts a message with optional deliveryStatus", () => {
    const result = MessageSummarySchema.safeParse({
      ...validMessageSummary,
      deliveryStatus: "sent" as const,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid datetime", () => {
    const result = MessageSummarySchema.safeParse({
      ...validMessageSummary,
      createdAt: "not-a-datetime",
    });
    expect(result.success).toBe(false);
  });
});

describe("ConversationSummarySchema", () => {
  it("accepts a valid conversation summary", () => {
    const result = ConversationSummarySchema.safeParse(validConversationSummary);
    expect(result.success).toBe(true);
  });

  it("accepts without lastMessage", () => {
    const result = ConversationSummarySchema.safeParse({
      ...validConversationSummary,
      lastMessage: undefined,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a null listing when the listing is unavailable", () => {
    const result = ConversationSummarySchema.safeParse({
      ...validConversationSummary,
      listing: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("OpenConversationRequestSchema", () => {
  it("accepts a valid request", () => {
    const result = OpenConversationRequestSchema.safeParse({
      listingId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-uuid listingId", () => {
    const result = OpenConversationRequestSchema.safeParse({
      listingId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("SendTextMessageRequestSchema", () => {
  it("accepts a valid text message", () => {
    const result = SendTextMessageRequestSchema.safeParse({
      text: "Hello, is it still available?",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty text", () => {
    const result = SendTextMessageRequestSchema.safeParse({
      text: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects text over 1000 chars", () => {
    const result = SendTextMessageRequestSchema.safeParse({
      text: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

describe("ListMessagesResponseSchema", () => {
  it("accepts a valid paginated response", () => {
    const result = ListMessagesResponseSchema.safeParse({
      items: [validMessageSummary],
      nextCursor: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a response with a cursor", () => {
    const result = ListMessagesResponseSchema.safeParse({
      items: [validMessageSummary],
      nextCursor: "next-page-token",
    });
    expect(result.success).toBe(true);
  });
});

describe("ListMessagesQuerySchema", () => {
  it("accepts a valid query with defaults", () => {
    const result = ListMessagesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ limit: 20 });
  });

  it("accepts cursor and limit", () => {
    const result = ListMessagesQuerySchema.safeParse({
      cursor: "next-page",
      limit: 10,
    });
    expect(result.success).toBe(true);
  });

  it("rejects limit over 50", () => {
    const result = ListMessagesQuerySchema.safeParse({ limit: 51 });
    expect(result.success).toBe(false);
  });
});

describe("ListConversationsQuerySchema", () => {
  it("accepts a valid query with defaults", () => {
    const result = ListConversationsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ limit: 20 });
  });

  it("accepts cursor and limit", () => {
    const result = ListConversationsQuerySchema.safeParse({
      cursor: "next-page",
      limit: 10,
    });
    expect(result.success).toBe(true);
  });
});

describe("ListConversationsResponseSchema", () => {
  it("accepts a valid paginated response", () => {
    const result = ListConversationsResponseSchema.safeParse({
      items: [validConversationSummary],
      nextCursor: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("Listings error codes", () => {
  it("publishes the required Damaged answer code returned by edit", () => {
    expect(ListingsErrorCode).toHaveProperty("DamagedRequired", "DAMAGED_REQUIRED");
  });
});

describe("Contact phone confirmation (ADR-0081)", () => {
  const confirmed = {
    phone: "+99365123456",
    source: "confirmed",
    confirmedAt: "2026-10-03T10:00:00.000Z",
    reusableUntil: "2026-10-10T10:00:00.000Z",
  };

  it("describes an account phone with null dates and a confirmed number with both", () => {
    expect(
      VerifiedContactPhoneSchema.safeParse({
        phone: "+99361234567",
        source: "account",
        confirmedAt: null,
        reusableUntil: null,
      }).success,
    ).toBe(true);
    expect(VerifiedContactPhoneSchema.safeParse(confirmed).success).toBe(true);
    expect(
      VerifiedContactPhoneSchema.safeParse({ ...confirmed, phone: "+79161234567" }).success,
    ).toBe(false);
  });

  it("takes a strict TM mobile number to request a code", () => {
    expect(ContactPhoneCodeRequestSchema.safeParse({ phone: "+99365123456" }).success).toBe(true);
    expect(ContactPhoneCodeRequestSchema.safeParse({ phone: "+99312123456" }).success).toBe(false);
    expect(
      ContactPhoneCodeRequestSchema.safeParse({ phone: "+99365123456", purpose: "sign-in" }).success,
    ).toBe(false);
  });

  it("answers confirmed or code_sent to a request", () => {
    expect(
      ContactPhoneCodeRequestResponseSchema.safeParse({
        status: "confirmed",
        contactPhone: confirmed,
      }).success,
    ).toBe(true);
    expect(
      ContactPhoneCodeRequestResponseSchema.safeParse({
        status: "code_sent",
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        resendInSeconds: 60,
        testCode: "123456",
      }).success,
    ).toBe(true);
    expect(
      ContactPhoneCodeRequestResponseSchema.safeParse({ status: "code_sent" }).success,
    ).toBe(false);
  });

  it("takes a strict number and six-digit code to verify", () => {
    expect(
      ContactPhoneVerifyRequestSchema.safeParse({ phone: "+99365123456", code: "123456" }).success,
    ).toBe(true);
    expect(
      ContactPhoneVerifyRequestSchema.safeParse({ phone: "+99365123456", code: "12345" }).success,
    ).toBe(false);
    expect(
      ContactPhoneVerifyRequestSchema.safeParse({
        phone: "+99365123456",
        code: "123456",
        userId: "x",
      }).success,
    ).toBe(false);
  });

  it("answers verify with a confirmed number and lists items", () => {
    expect(ContactPhoneVerifyResponseSchema.safeParse({ contactPhone: confirmed }).success).toBe(true);
    expect(
      ContactPhoneVerifyResponseSchema.safeParse({
        contactPhone: { ...confirmed, source: "account" },
      }).success,
    ).toBe(false);
    expect(MyContactPhonesResponseSchema.safeParse({ items: [confirmed] }).success).toBe(true);
  });

  it("publishes the new listing error codes and their details", () => {
    expect(ListingsErrorCode).toHaveProperty("ContactPhoneRequired", "CONTACT_PHONE_REQUIRED");
    expect(ListingsErrorCode).toHaveProperty(
      "ContactPhoneNotConfirmed",
      "CONTACT_PHONE_NOT_CONFIRMED",
    );
    expect(ContactPhoneNotConfirmedDetailsSchema.safeParse({ reason: "expired" }).success).toBe(true);
    expect(
      ContactPhoneNotConfirmedDetailsSchema.safeParse({ reason: "not_confirmed" }).success,
    ).toBe(true);
    expect(ContactPhoneNotConfirmedDetailsSchema.safeParse({ reason: "missing" }).success).toBe(false);
  });

  it("reports attempts left from 4 down to 1 on INVALID_OTP", () => {
    for (const attemptsLeft of [1, 2, 3, 4]) {
      expect(InvalidOtpDetailsSchema.safeParse({ attemptsLeft }).success).toBe(true);
    }
    expect(InvalidOtpDetailsSchema.safeParse({ attemptsLeft: 0 }).success).toBe(false);
    expect(InvalidOtpDetailsSchema.safeParse({ attemptsLeft: 5 }).success).toBe(false);
  });

  it("requires a TM mobile contact phone on the Contact step and on edit", () => {
    const base = { description: "Great car", allowCalls: true, allowChat: true };
    expect(StepContactSchema.safeParse(base).success).toBe(false);
    expect(StepContactSchema.safeParse({ ...base, contactPhone: "8 800 555" }).success).toBe(false);
    expect(StepContactSchema.safeParse({ ...base, contactPhone: "+99365123456" }).success).toBe(true);

    expect(EditListingRequestSchema.safeParse({ contactPhone: "+99365123456" }).success).toBe(true);
    expect(EditListingRequestSchema.safeParse({ contactPhone: "8 800 555" }).success).toBe(false);
    expect(EditListingRequestSchema.safeParse({ priceAmount: 1 }).success).toBe(true);
  });

  it("emits translatable keys when the Contact step phone is missing or malformed", () => {
    const base = { description: "Great car", allowCalls: true, allowChat: true };
    for (const payload of [base, { ...base, contactPhone: "123" }]) {
      const result = validateStep("contact", payload);
      expect(result.valid).toBe(false);
      for (const message of [...result.errors, ...Object.values(result.fieldErrors)]) {
        expect(isWizardErrorKey(message), message).toBe(true);
      }
    }
  });

  it("documents the three contact-phone endpoints", () => {
    const doc = generateOpenApiDocument() as {
      paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
      components: { schemas: Record<string, unknown> };
    };
    expect(doc.paths["/api/v1/me/contact-phones/request"]?.["post"]?.responses).toHaveProperty("400");
    expect(doc.paths["/api/v1/me/contact-phones/verify"]?.["post"]?.responses).toHaveProperty("400");
    expect(doc.paths["/api/v1/me/contact-phones"]?.["get"]?.responses).toHaveProperty("200");
    for (const name of ["VerifiedContactPhone", "InvalidOtpDetails", "ContactPhoneNotConfirmedDetails"]) {
      expect(doc.components.schemas).toHaveProperty(name);
    }
  });
});
