import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
  cookies: async () => { throw new Error("Catalog must not read cookies"); } }));

import { resolveHistoryListingCatalog } from "./history-listing-catalog";

const ids = {
  brandId: "10000000-0000-4000-8000-000000000001", modelId: "10000000-0000-4000-8000-000000000002",
  generationId: "10000000-0000-4000-8000-000000000003", regionId: "10000000-0000-4000-8000-000000000004",
  cityId: "10000000-0000-4000-8000-000000000005", bodyTypeId: "10000000-0000-4000-8000-000000000006",
  colorId: "10000000-0000-4000-8000-000000000007", engineTypeId: "10000000-0000-4000-8000-000000000008",
  transmissionId: "10000000-0000-4000-8000-000000000009", driveTypeId: "10000000-0000-4000-8000-000000000010",
};
const other = "10000000-0000-4000-8000-000000000099";
const cursor = Buffer.from(JSON.stringify({ id: other, name: "First" })).toString("base64");
const names = {
  en: ["Toyota", "Prius", "Third", "Capital", "City", "Sedan", "White", "Hybrid", "Automatic", "Front"],
  ru: ["Тойота", "Приус", "Третье", "Столица", "Город", "Седан", "Белый", "Гибрид", "Автомат", "Передний"],
  tk: ["Toýota", "Prius", "Üçünji", "Paýtagt", "Şäher", "Sedan", "Ak", "Gibrid", "Awtomat", "Öň"],
};
const routes = ["brands", `brands/${ids.brandId}/models`, `models/${ids.modelId}/generations`, "regions",
  `regions/${ids.regionId}/cities`, "body-types", "colors", "engine-types", "transmissions", "drive-types"];
const paged = new Set([0, 1, 4]);
type Payload = { items: Record<string, unknown>[]; nextCursor?: string | null; hasMore?: boolean };
let server: Server, origin: string, status: number, brokenTransport: boolean;
let change: (path: string, payload: Payload) => unknown;
let seen: { path: string; auth: string | undefined; cookie: string | undefined; ip: string | undefined; locale: string | undefined }[];
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "", "http://catalog.test");
    const route = url.pathname.replace("/api/v1/catalog/", "");
    seen.push({ path: route, auth: req.headers.authorization, cookie: req.headers.cookie,
      ip: req.headers["x-real-ip"] as string | undefined, locale: req.headers["accept-language"] });
    if (brokenTransport) { req.socket.destroy(); return; }
    const index = routes.indexOf(route);
    if (index < 0) { res.writeHead(404); res.end(); return; }
    const locale = url.searchParams.get("locale") as keyof typeof names;
    const first = paged.has(index) && !url.searchParams.has("cursor");
    const item = { id: first ? other : Object.values(ids)[index], name: first ? "First" : names[locale][index], slug: "reference",
      ...(index === 1 ? { brandId: ids.brandId } : index === 2 ? { modelId: ids.modelId } : index === 4 ? { regionId: ids.regionId } : {}) };
    const payload: Payload = { items: [item], ...(paged.has(index) ? { nextCursor: first ? cursor : null, hasMore: first } : {}) };
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(change(route, payload)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); vi.unstubAllEnvs(); });
beforeEach(() => { vi.stubEnv("API_BASE_URL", origin); seen = []; status = 200; brokenTransport = false; change = (_path, payload) => payload; });

it.each(["tk", "ru", "en"] as const)("resolves all actual %s families and later pages anonymously", async (locale) => {
  let checkpoints = 0;
  const labels = await resolveHistoryListingCatalog(ids, locale, async () => { checkpoints += 1; });
  expect(labels).toEqual({ brand: names[locale][0], model: names[locale][1], generation: names[locale][2],
    region: names[locale][3], city: names[locale][4], bodyType: names[locale][5], color: names[locale][6],
    engineType: names[locale][7], transmission: names[locale][8], driveType: names[locale][9] });
  expect(checkpoints).toBe(13);
  expect(seen).toHaveLength(13);
  expect(new Set(seen.map((entry) => entry.path))).toEqual(new Set(routes));
  expect(seen.every((entry) => !entry.auth && !entry.cookie && entry.ip === "203.0.113.7" && entry.locale === locale)).toBe(true);
});

it("leaves missing optional references absent and skips unspecified families", async () => {
  change = (_path, payload) => ({ ...payload, items: [], nextCursor: null, hasMore: false });
  expect(await resolveHistoryListingCatalog(ids, "ru", async () => {})).toEqual({});
  expect(JSON.stringify(await resolveHistoryListingCatalog(ids, "tk", async () => {}))).not.toContain(ids.generationId);
  seen = [];
  const required = { brandId: ids.brandId, modelId: ids.modelId, regionId: ids.regionId, cityId: ids.cityId };
  expect(await resolveHistoryListingCatalog(required, "en", async () => {})).toEqual({});
  expect(seen.map((entry) => entry.path)).toEqual(["brands", routes[1], "regions", routes[4]]);
});

it.each([
  [1, "brandId"], [2, "modelId"], [4, "regionId"],
] as const)("refuses mismatched parent identity in family %s", async (index, parent) => {
  change = (path, payload) => path === routes[index]
    ? { ...payload, items: payload.items.map((item) => ({ ...item, [parent]: other })) } : payload;
  await expect(resolveHistoryListingCatalog(ids, "en", async () => {})).rejects.toMatchObject({ status: 502, code: "INVALID_PUBLIC_CATALOG" });
});

it.each(routes)("treats malformed %s data as retryable, never a missing label", async (route) => {
  change = (path, payload) => path === route ? { ...payload, items: [{ ...payload.items[0], name: 42 }] } : payload;
  await expect(resolveHistoryListingCatalog(ids, "tk", async () => {})).rejects.toMatchObject({ status: 502, responseBody: null });
});

it.each([
  { items: null }, { items: [{ id: "bad", name: "Bad", slug: "bad" }] },
  { nextCursor: "not-json" }, { nextCursor: null }, { hasMore: false }, { items: [] },
  { nextCursor: Buffer.from(JSON.stringify({ id: ids.brandId, name: "Wrong last row" })).toString("base64") },
])("refuses malformed/nonadvancing pagination: %j", async (patch) => {
  change = (path, payload) => path === "brands" ? { ...payload, ...patch } : payload;
  await expect(resolveHistoryListingCatalog(ids, "ru", async () => {})).rejects.toMatchObject({ status: 502 });
});

it("rejects repeated rows/cursors and reads beyond an early matching label", async () => {
  change = (path, payload) => path === "brands" ? { ...payload, nextCursor: cursor, hasMore: true,
    items: [{ id: other, name: "First", slug: "first" }] } : payload;
  await expect(resolveHistoryListingCatalog(ids, "en", async () => {})).rejects.toMatchObject({ status: 502 });
  expect(seen.map((entry) => entry.path)).toEqual(["brands", "brands"]);
  seen = [];
  change = (path, payload) => path !== "brands" ? payload : payload.hasMore
    ? { ...payload, items: [{ ...payload.items[0], id: ids.brandId }],
      nextCursor: Buffer.from(JSON.stringify({ id: ids.brandId, name: "First" })).toString("base64") }
    : { items: null, nextCursor: null, hasMore: false };
  await expect(resolveHistoryListingCatalog(ids, "en", async () => {})).rejects.toMatchObject({ status: 502 });
  expect(seen.map((entry) => entry.path)).toEqual(["brands", "brands"]);
});

it("allows current authority to stop after every awaited page or family", async () => {
  for (let checkpoint = 1; checkpoint <= 13; checkpoint += 1) {
    seen = [];
    await expect(resolveHistoryListingCatalog(ids, "en", async () => {
      if (seen.length === checkpoint) throw new Error("Current request changed");
    })).rejects.toThrow("Current request changed");
    expect(seen).toHaveLength(checkpoint);
  }
});

it("reauthorizes HTTP and transport failures and allows a real retry", async () => {
  let checkpoints = 0;
  status = 503;
  await expect(resolveHistoryListingCatalog(ids, "en", async () => { checkpoints += 1; })).rejects.toMatchObject({ status: 503 });
  expect(checkpoints).toBe(1);
  await expect(resolveHistoryListingCatalog(ids, "en", async () => { throw new Error("Authority lost"); })).rejects.toThrow("Authority lost");
  brokenTransport = true;
  await expect(resolveHistoryListingCatalog(ids, "en", async () => { checkpoints += 1; })).rejects.toThrow();
  expect(checkpoints).toBe(2);
  status = 200; brokenTransport = false;
  expect(await resolveHistoryListingCatalog(ids, "en", async () => {})).toMatchObject({ brand: "Toyota", city: "City" });
});
