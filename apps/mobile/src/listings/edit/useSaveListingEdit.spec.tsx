// @vitest-environment happy-dom

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ListingsSchemas, WizardSchemas } from "@auto-tm/contracts";

import { server } from "../../../test/msw";
import type { StagedPhoto } from "../uploadStaging/types";

import {
  useSaveListingEdit,
  buildFieldsPatch,
  EditSessionError,
} from "./useSaveListingEdit";

vi.mock("../../auth/session", () => ({
  loadAuthSession: vi.fn(() =>
    Promise.resolve({
      accessToken: "token-123",
      refreshToken: "refresh-123",
      user: {
        id: "u1",
        phone: "+99361000000",
        displayName: null,
        role: "buyer",
      },
      storedAt: new Date().toISOString(),
    }),
  ),
  storeAuthSession: vi.fn(() => Promise.resolve()),
  clearAuthSession: vi.fn(() => Promise.resolve()),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const LISTING_ID = "550e8400-e29b-41d4-a716-446655440000";

const seedMedia: ListingsSchemas.ListingMedia[] = [
  {
    id: "550e8400-e29b-41d4-a716-446655440001",
    kind: "image",
    key: "listings/l1/m1/original.webp",
    variants: {
      thumbnail: "t.webp",
      list: "l.webp",
      detail: "d.webp",
      fullscreen: "f.webp",
    },
    sortOrder: 0,
    width: 1920,
    height: 1080,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    kind: "image",
    key: "listings/l1/m2/original.webp",
    variants: {
      thumbnail: "t.webp",
      list: "l.webp",
      detail: "d.webp",
      fullscreen: "f.webp",
    },
    sortOrder: 1,
    width: 1920,
    height: 1080,
  },
];

const basePayload = {
  priceAmount: 15000,
  priceCurrency: "USD" as const,
  description: "Great car",
  condition: "used" as const,
  mileageKm: 50000,
  allowCalls: true,
  allowChat: true,
};

function photo(p: Partial<StagedPhoto> & { photoId: string }): StagedPhoto {
  return {
    state: "uploaded",
    sortOrder: 0,
    retryCount: 0,
    ...p,
  };
}

/** Runs a real save against a recording API and returns the requests it made, in order. */
async function savedRequests(
  payload: WizardSchemas.WizardDraftPayload,
  photos: StagedPhoto[],
  seed: ListingsSchemas.ListingMedia[],
): Promise<string[]> {
  const log: string[] = [];
  server.use(
    http.patch("*/listings/:id", () => {
      log.push("fields");
      return HttpResponse.json({
        id: LISTING_ID,
        sellerId: "550e8400-e29b-41d4-a716-446655440003",
        status: "active",
        brandId: "550e8400-e29b-41d4-a716-446655440004",
        modelId: "550e8400-e29b-41d4-a716-446655440005",
        year: 2020,
        priceAmount: 15000,
        priceCurrency: "USD",
        displayPriceTmt: 52500,
        description: "Great car",
        regionId: "550e8400-e29b-41d4-a716-446655440006",
        cityId: "550e8400-e29b-41d4-a716-446655440007",
        allowCalls: true,
        allowChat: true,
        acceptsExchange: false,
        installmentAvailable: false,
        media: seed,
        viewCount: 0,
        favoriteCount: 0,
        publishedAt: "2026-05-21T12:00:00.000Z",
        createdAt: "2026-05-21T12:00:00.000Z",
        updatedAt: "2026-05-21T12:00:00.000Z",
        publicNumber: 10482,
        seller: { displayName: null, nameNumber: 2057, avatarIndex: 7, avatarKey: null, deleted: false, memberSince: "2025-01-01T00:00:00.000Z" },
      });
    }),
    http.post("*/listings/:id/media/attach", async ({ request }) => {
      const body = (await request.json()) as ListingsSchemas.AttachMediaRequest;
      log.push(`attach:${body.key}`);
      return HttpResponse.json({
        id: crypto.randomUUID(),
        listingId: LISTING_ID,
        kind: "image",
        key: body.key,
        sortOrder: body.sortOrder,
        createdAt: "2026-05-21T12:00:00.000Z",
      });
    }),
    http.delete("*/listings/:id/media/:mediaId", ({ params }) => {
      log.push(`remove:${String(params.mediaId)}`);
      return HttpResponse.json({ success: true });
    }),
    http.put("*/listings/:id/media/order", () => {
      log.push("reorder");
      return HttpResponse.json({ success: true });
    }),
  );
  const { result } = renderHook(
    () => useSaveListingEdit(LISTING_ID, payload, photos, seed),
    { wrapper },
  );
  await result.current.save();
  return log;
}

describe("useSaveListingEdit planned requests", () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it("saves fields when editable fields are present", async () => {
    expect(await savedRequests(basePayload, [], [])).toContain("fields");
  });

  it("skips the fields request when the payload has no editable fields", async () => {
    expect(await savedRequests({}, [], [])).toEqual([]);
  });

  it("attaches only photos that are not already server media", async () => {
    const photos = [
      photo({ photoId: "550e8400-e29b-41d4-a716-446655440001", key: "k1" }),
      photo({ photoId: "new1", key: "k2", sortOrder: 1 }),
    ];
    const requests = await savedRequests(basePayload, photos, seedMedia);
    expect(requests.filter((r) => r.startsWith("attach:"))).toEqual(["attach:k2"]);
  });

  it("removes server media the seller dropped and keeps the rest", async () => {
    const photos = [photo({ photoId: "550e8400-e29b-41d4-a716-446655440001", key: "k1" })];
    const requests = await savedRequests(basePayload, photos, seedMedia);
    expect(requests.filter((r) => r.startsWith("remove:"))).toEqual([
      "remove:550e8400-e29b-41d4-a716-446655440002",
    ]);
  });

  it("reorders when photos remain", async () => {
    const photos = [photo({ photoId: "550e8400-e29b-41d4-a716-446655440001", key: "k1" })];
    expect(await savedRequests(basePayload, photos, seedMedia)).toContain("reorder");
  });

  it("does not reorder when no photos remain", async () => {
    expect(await savedRequests(basePayload, [], seedMedia)).not.toContain("reorder");
  });
});

describe("buildFieldsPatch", () => {
  it("rejects an unanswered draft disclosure before it becomes an edit request", () => {
    expect(() => buildFieldsPatch({ conditionDisclosure: { knownIssuesText: "Rust" } })).toThrow();
  });

  it.each([true, false])("keeps the explicit Damaged answer %s and clears empty Known issues", (damaged) => {
    expect(buildFieldsPatch({ conditionDisclosure: { damaged, knownIssuesText: undefined } }))
      .toEqual({ conditionDisclosure: { damaged } });
  });

  it("omits locked fields", () => {
    const patch = buildFieldsPatch({
      ...basePayload,
      brandId: "b1",
      modelId: "md1",
      generationId: "g1",
      year: 2020,
      vin: "VIN123",
    });
    expect(patch).not.toHaveProperty("brandId");
    expect(patch).not.toHaveProperty("modelId");
    expect(patch).not.toHaveProperty("generationId");
    expect(patch).not.toHaveProperty("year");
    expect(patch).not.toHaveProperty("vin");
    expect(patch.priceAmount).toBe(15000);
  });

  it("omits undefined fields", () => {
    const patch = buildFieldsPatch({
      priceAmount: 15000,
    });
    expect(patch).toHaveProperty("priceAmount");
    expect(patch).not.toHaveProperty("description");
  });
});

describe("useSaveListingEdit", () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it("happy path: runs all ops in sequence", async () => {
    const callLog: string[] = [];

    server.use(
      http.patch("*/listings/:id", async ({ request }) => {
        callLog.push("fields");
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: LISTING_ID,
          sellerId: "550e8400-e29b-41d4-a716-446655440003",
          status: "active",
          brandId: "550e8400-e29b-41d4-a716-446655440004",
          modelId: "550e8400-e29b-41d4-a716-446655440005",
          year: 2020,
          priceAmount: body.priceAmount ?? 15000,
          priceCurrency: body.priceCurrency ?? "USD",
          displayPriceTmt: 52500,
          description: body.description ?? "Great car",
          regionId: "550e8400-e29b-41d4-a716-446655440006",
          cityId: "550e8400-e29b-41d4-a716-446655440007",
          allowCalls: true,
          allowChat: true,
          acceptsExchange: false,
          installmentAvailable: false,
          media: seedMedia,
          viewCount: 0,
          favoriteCount: 0,
          publishedAt: "2026-05-21T12:00:00.000Z",
          soldAt: undefined,
          createdAt: "2026-05-21T12:00:00.000Z",
          updatedAt: "2026-05-21T12:00:00.000Z",
          publicNumber: 10482,
          seller: { displayName: null, nameNumber: 2057, avatarIndex: 7, avatarKey: null, deleted: false, memberSince: "2025-01-01T00:00:00.000Z" },
        });
      }),
      http.post("*/listings/:id/media/attach", () => {
        callLog.push("attach");
        return HttpResponse.json({
          id: "550e8400-e29b-41d4-a716-446655440008",
          listingId: LISTING_ID,
          kind: "image",
          key: "listings/l1/new1/original.webp",
          sortOrder: 2,
          createdAt: "2026-05-21T12:00:00.000Z",
        });
      }),
      http.delete("*/listings/:id/media/:mediaId", () => {
        callLog.push("remove");
        return HttpResponse.json({ success: true });
      }),
      http.put("*/listings/:id/media/order", () => {
        callLog.push("reorder");
        return HttpResponse.json({ success: true });
      }),
    );

    const photos: StagedPhoto[] = [
      photo({ photoId: "550e8400-e29b-41d4-a716-446655440001", key: "k1", sortOrder: 0 }),
      photo({ photoId: "new1", key: "k-new", sortOrder: 1 }),
    ];

    const { result } = renderHook(
      () => useSaveListingEdit(LISTING_ID, basePayload, photos, seedMedia),
      { wrapper },
    );

    await result.current.save();

    await waitFor(() => expect(result.current.status).toBe("succeeded"));

    expect(callLog).toEqual(["attach", "fields", "remove", "reorder"]);
    expect(result.current.opStates["fields"]).toBe("succeeded");
    expect(result.current.opStates["attach:new1"]).toBe("succeeded");
    expect(result.current.opStates["remove:550e8400-e29b-41d4-a716-446655440002"]).toBe("succeeded");
    expect(result.current.opStates["reorder"]).toBe("succeeded");
  });

  it("mid-sequence failure: stops and exposes per-op state; retry resumes from failed op", async () => {
    let attachAttempts = 0;
    const callLog: string[] = [];

    server.use(
      http.patch("*/listings/:id", async ({ request }) => {
        callLog.push("fields");
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: LISTING_ID,
          sellerId: "550e8400-e29b-41d4-a716-446655440003",
          status: "active",
          brandId: "550e8400-e29b-41d4-a716-446655440004",
          modelId: "550e8400-e29b-41d4-a716-446655440005",
          year: 2020,
          priceAmount: body.priceAmount ?? 15000,
          priceCurrency: body.priceCurrency ?? "USD",
          displayPriceTmt: 52500,
          description: body.description ?? "Great car",
          regionId: "550e8400-e29b-41d4-a716-446655440006",
          cityId: "550e8400-e29b-41d4-a716-446655440007",
          allowCalls: true,
          allowChat: true,
          acceptsExchange: false,
          installmentAvailable: false,
          media: seedMedia,
          viewCount: 0,
          favoriteCount: 0,
          publishedAt: "2026-05-21T12:00:00.000Z",
          soldAt: undefined,
          createdAt: "2026-05-21T12:00:00.000Z",
          updatedAt: "2026-05-21T12:00:00.000Z",
          publicNumber: 10482,
          seller: { displayName: null, nameNumber: 2057, avatarIndex: 7, avatarKey: null, deleted: false, memberSince: "2025-01-01T00:00:00.000Z" },
        });
      }),
      http.post("*/listings/:id/media/attach", () => {
        attachAttempts++;
        callLog.push(`attach-${attachAttempts}`);
        if (attachAttempts === 1) {
          return HttpResponse.json({ error: "fail" }, { status: 500 });
        }
        return HttpResponse.json({
          id: "550e8400-e29b-41d4-a716-446655440008",
          listingId: LISTING_ID,
          kind: "image",
          key: "listings/l1/new1/original.webp",
          sortOrder: 2,
          createdAt: "2026-05-21T12:00:00.000Z",
        });
      }),
      http.delete("*/listings/:id/media/:mediaId", () => {
        callLog.push("remove");
        return HttpResponse.json({ success: true });
      }),
      http.put("*/listings/:id/media/order", () => {
        callLog.push("reorder");
        return HttpResponse.json({ success: true });
      }),
    );

    const photos: StagedPhoto[] = [
      photo({ photoId: "550e8400-e29b-41d4-a716-446655440001", key: "k1", sortOrder: 0 }),
      photo({ photoId: "new1", key: "k-new", sortOrder: 1 }),
    ];

    const { result } = renderHook(
      () => useSaveListingEdit(LISTING_ID, basePayload, photos, seedMedia),
      { wrapper },
    );

    await expect(result.current.save()).rejects.toBeInstanceOf(
      EditSessionError,
    );

    await waitFor(() => expect(result.current.status).toBe("failed"));

    expect(result.current.opStates["fields"]).toBe("pending");
    expect(result.current.opStates["attach:new1"]).toBe("failed");
    expect(result.current.opStates["remove:550e8400-e29b-41d4-a716-446655440002"]).toBe("pending");
    expect(result.current.opStates["reorder"]).toBe("pending");
    expect(result.current.error?.failedOpId).toBe("attach:new1");

    // Retry
    await result.current.retry();

    await waitFor(() => expect(result.current.status).toBe("succeeded"));

    expect(callLog).toEqual([
      "attach-1", // first attempt fails
      "attach-2", // retry succeeds
      "fields",
      "remove",
      "reorder",
    ]);
    expect(result.current.opStates["fields"]).toBe("succeeded");
    expect(result.current.opStates["attach:new1"]).toBe("succeeded");
    expect(result.current.opStates["remove:550e8400-e29b-41d4-a716-446655440002"]).toBe("succeeded");
    expect(result.current.opStates["reorder"]).toBe("succeeded");
  });

  it("skips empty attach and remove ops", async () => {
    const callLog: string[] = [];

    server.use(
      http.patch("*/listings/:id", async ({ request }) => {
        callLog.push("fields");
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: LISTING_ID,
          sellerId: "550e8400-e29b-41d4-a716-446655440003",
          status: "active",
          brandId: "550e8400-e29b-41d4-a716-446655440004",
          modelId: "550e8400-e29b-41d4-a716-446655440005",
          year: 2020,
          priceAmount: body.priceAmount ?? 15000,
          priceCurrency: body.priceCurrency ?? "USD",
          displayPriceTmt: 52500,
          description: body.description ?? "Great car",
          regionId: "550e8400-e29b-41d4-a716-446655440006",
          cityId: "550e8400-e29b-41d4-a716-446655440007",
          allowCalls: true,
          allowChat: true,
          acceptsExchange: false,
          installmentAvailable: false,
          media: seedMedia,
          viewCount: 0,
          favoriteCount: 0,
          publishedAt: "2026-05-21T12:00:00.000Z",
          soldAt: undefined,
          createdAt: "2026-05-21T12:00:00.000Z",
          updatedAt: "2026-05-21T12:00:00.000Z",
          publicNumber: 10482,
          seller: { displayName: null, nameNumber: 2057, avatarIndex: 7, avatarKey: null, deleted: false, memberSince: "2025-01-01T00:00:00.000Z" },
        });
      }),
      http.put("*/listings/:id/media/order", () => {
        callLog.push("reorder");
        return HttpResponse.json({ success: true });
      }),
    );

    // Same photos as seed — no attach, no remove
    const photos: StagedPhoto[] = [
      photo({ photoId: "550e8400-e29b-41d4-a716-446655440001", key: "k1", sortOrder: 0 }),
      photo({ photoId: "550e8400-e29b-41d4-a716-446655440002", key: "k2", sortOrder: 1 }),
    ];

    const { result } = renderHook(
      () => useSaveListingEdit(LISTING_ID, basePayload, photos, seedMedia),
      { wrapper },
    );

    await result.current.save();

    await waitFor(() => expect(result.current.status).toBe("succeeded"));

    expect(callLog).toEqual(["fields", "reorder"]);
    expect(Object.keys(result.current.opStates)).toEqual(["fields", "reorder"]);
  });

  it("always sends reorder when photos exist", async () => {
    let reorderCount = 0;

    server.use(
      http.patch("*/listings/:id", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: LISTING_ID,
          sellerId: "550e8400-e29b-41d4-a716-446655440003",
          status: "active",
          brandId: "550e8400-e29b-41d4-a716-446655440004",
          modelId: "550e8400-e29b-41d4-a716-446655440005",
          year: 2020,
          priceAmount: body.priceAmount ?? 15000,
          priceCurrency: body.priceCurrency ?? "USD",
          displayPriceTmt: 52500,
          description: body.description ?? "Great car",
          regionId: "550e8400-e29b-41d4-a716-446655440006",
          cityId: "550e8400-e29b-41d4-a716-446655440007",
          allowCalls: true,
          allowChat: true,
          acceptsExchange: false,
          installmentAvailable: false,
          media: seedMedia,
          viewCount: 0,
          favoriteCount: 0,
          publishedAt: "2026-05-21T12:00:00.000Z",
          soldAt: undefined,
          createdAt: "2026-05-21T12:00:00.000Z",
          updatedAt: "2026-05-21T12:00:00.000Z",
          publicNumber: 10482,
          seller: { displayName: null, nameNumber: 2057, avatarIndex: 7, avatarKey: null, deleted: false, memberSince: "2025-01-01T00:00:00.000Z" },
        });
      }),
      http.put("*/listings/:id/media/order", () => {
        reorderCount++;
        return HttpResponse.json({ success: true });
      }),
    );

    const photos: StagedPhoto[] = [
      photo({ photoId: "550e8400-e29b-41d4-a716-446655440001", key: "k1", sortOrder: 0 }),
      photo({ photoId: "550e8400-e29b-41d4-a716-446655440002", key: "k2", sortOrder: 1 }),
    ];

    const { result } = renderHook(
      () => useSaveListingEdit(LISTING_ID, basePayload, photos, seedMedia),
      { wrapper },
    );

    await result.current.save();
    await waitFor(() => expect(result.current.status).toBe("succeeded"));
    expect(reorderCount).toBe(1);

    // Save again — reorder should fire again (idempotent)
    await result.current.save();
    await waitFor(() => expect(result.current.status).toBe("succeeded"));
    expect(reorderCount).toBe(2);
  });
});
