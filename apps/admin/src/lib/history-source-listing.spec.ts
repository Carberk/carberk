import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
  cookies: async () => { throw new Error("Public reads must not read cookies"); } }));

import { readHistorySourceListing } from "./history-source-listing";

const id = "10000000-0000-4000-8000-000000001255";
const other = "10000000-0000-4000-8000-000000001256";
const at = "2026-11-15T00:00:00.000Z";
const variants = { thumbnail: "https://photos.test/thumbnail.webp", list: "https://photos.test/list.webp",
  detail: "https://photos.test/detail.webp", fullscreen: "https://photos.test/fullscreen.webp" };
const allowed = {
  id, publicNumber: 1255, status: "active", brandId: id, modelId: id, generationId: id, year: 2020,
  vin: "JTDKN3DU0A0000001", condition: "used", mileageKm: 50000, colorId: id, bodyTypeId: id,
  transmissionId: id, driveTypeId: id, engineTypeId: id, enginePower: 150,
  priceAmount: 100000, priceCurrency: "TMT", displayPriceTmt: 100000, description: "Great car",
  regionId: id, cityId: id, locationText: "City centre", acceptsExchange: true, installmentAvailable: false,
  seller: { displayName: "Aýna", nameNumber: 1255, avatarIndex: 2, avatarKey: "profiles/photo.webp", deleted: false, memberSince: at },
  media: [{ id, kind: "image", key: "listings/photo/original.webp", variants, width: 1200, height: 900, sortOrder: 0, thumbHash: "AAAAAAAAAAAAAAAAAAAAAAA=" }],
  conditionDisclosure: { damaged: true, knownIssuesText: "Small scratch" },
  vinHistory: { decoded: true, brand: "Toyota", model: "Prius", year: 2020, bodyType: "Hatchback", engineType: "Hybrid", confidence: 0.9 },
  publishedAt: at, soldAt: at, createdAt: at, updatedAt: at,
};
let server: Server, origin: string, body: unknown, status: number;
let seen: string[];
beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); vi.unstubAllEnvs(); });
beforeEach(() => { vi.stubEnv("API_BASE_URL", origin); body = allowed; status = 200; seen = []; });

it("returns every allowed public fact and strips authority and nested extras over anonymous HTTP", async () => {
  body = { ...allowed, sellerId: other, contactPhone: "private", allowCalls: true, allowChat: true,
    isFavorited: true, favoriteCount: 10, viewCount: 20, pendingVideo: { private: true }, video: { private: true }, owner: true,
    seller: { ...allowed.seller, id: other, phone: "private", role: "admin" },
    media: [{ ...allowed.media[0], ownerId: other, posterKey: "private", durationMs: 10, variants: { ...variants, private: "secret" } }],
    conditionDisclosure: { ...allowed.conditionDisclosure, report: "private" }, vinHistory: { ...allowed.vinHistory, report: "private" } };
  let continuations = 0;
  expect(await readHistorySourceListing(id, async () => { continuations += 1; })).toEqual(allowed);
  expect(continuations).toBe(1);
  expect(seen).toEqual([`GET /api/v1/listings/${id}`]);
});

it.each([
  { id: other }, { publicNumber: 0 }, { status: "banned" }, { brandId: "bad" },
  { seller: { ...allowed.seller, nameNumber: 1 } }, { seller: { ...allowed.seller, deleted: "false" } },
  { media: [{ ...allowed.media[0], id: "bad" }] }, { media: [allowed.media[0], allowed.media[0]] },
  { media: [{ ...allowed.media[0], kind: "video" }] }, { media: [{ ...allowed.media[0], width: -1 }] },
  { media: [{ ...allowed.media[0], variants: { ...variants, detail: "not-a-url" } }] },
  { media: [{ ...allowed.media[0], variants: { ...variants, detail: "javascript:alert(1)" } }] },
  { media: [{ ...allowed.media[0], variants: { ...variants, detail: "https://user:pass@photos.test/photo" } }] },
  { conditionDisclosure: { damaged: "yes" } }, { vinHistory: { decoded: true, confidence: 2 } },
])("refuses malformed identity or display data: %j", async (patch) => {
  body = { ...allowed, ...patch };
  await expect(readHistorySourceListing(id, async () => {})).rejects.toMatchObject({ status: 502, code: "INVALID_PUBLIC_LISTING", responseBody: null });
});

it("preserves public lifecycle, absent optional facts, empty photos and decoder meaning", async () => {
  for (const listingStatus of ["active", "sold", "archived"]) {
    body = { ...allowed, status: listingStatus, media: [], conditionDisclosure: undefined,
      vinHistory: { decoded: false, report: "private" }, seller: { ...allowed.seller, displayName: null, avatarKey: null, deleted: true } };
    expect(await readHistorySourceListing(id, async () => {})).toMatchObject({ status: listingStatus, media: [], vinHistory: { decoded: false }, seller: { displayName: null, deleted: true } });
  }
});

it("continues after failed reads and lets current authority discard success or failure", async () => {
  let continuations = 0;
  status = 404;
  await expect(readHistorySourceListing(id, async () => { continuations += 1; })).rejects.toMatchObject({ status: 404 });
  expect(continuations).toBe(1);
  for (const code of [200, 503]) {
    status = code;
    await expect(readHistorySourceListing(id, async () => { throw new Error("Current request changed"); })).rejects.toThrow("Current request changed");
  }
  seen = [];
  await expect(readHistorySourceListing("../private", async () => {})).rejects.toMatchObject({ status: 400 });
  expect(seen).toEqual([]);
});
