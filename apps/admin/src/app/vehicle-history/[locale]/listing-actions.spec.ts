import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";

import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({ token: "", headers: new Headers() }));
// Only Next's per-request platform context is replaced. Cookies stay fixed
// throughout each invocation; authority changes happen at the HTTP boundary.
vi.mock("next/headers", () => ({ headers: async () => context.headers,
  cookies: async () => ({ get: (name: string) => name === "auto_tm_admin_access" && context.token
    ? { value: context.token } : undefined }) }));

import { historyListingAction } from "./listing-actions";

const actor = { id: "10000000-0000-4000-8000-000000001251", displayName: "Aýna", nameNumber: 1251 };
const id = "10000000-0000-4000-8000-000000001252";
const session = "10000000-0000-4000-8000-000000001253";
const source = "10000000-0000-4000-8000-000000001254";
const other = "10000000-0000-4000-8000-000000001255";
const scope = createHash("sha256").update(`history-inbox\0${actor.id}\0${session}`).digest("hex");
const input = { kind: "detail", id, expectedAssignmentVersion: 1, scope };
const selected = { id, createdAt: "2026-11-15T00:00:00.000Z", status: "enquiry", mine: true,
  assignmentVersion: 1, assignedOperator: actor, requester: { displayName: "Merdan", nameNumber: 4837, deleted: false }, sourceListingId: source };
const listing = { id: source, publicNumber: 1251, status: "active", brandId: source, modelId: source,
  year: 2020, condition: "used", priceAmount: 100000, priceCurrency: "TMT", displayPriceTmt: 100000,
  regionId: source, cityId: source, description: "Public car", acceptsExchange: false, installmentAvailable: false,
  seller: { displayName: "Seller", nameNumber: 4837, avatarIndex: 2, avatarKey: null, deleted: false,
    memberSince: "2026-11-15T00:00:00.000Z" }, media: [],
  publishedAt: "2026-11-15T00:00:00.000Z", createdAt: "2026-11-15T00:00:00.000Z", updatedAt: "2026-11-15T00:00:00.000Z" };
const mediaPath = `/api/v1/listings/video-access/viewer/listing/${source}`;
const mediaUrl = (member: string, audience = "viewer", generation = id) =>
  `https://media.test/api/v1/listings/video-files/${audience}/${source}/${generation}/${Buffer.from(member).toString("base64url")}.${member === "master" ? "m3u8" : "webp"}?grant=synthetic`;
const video = { status: "ready", video: { id: source, generationId: id, durationMs: 3000,
  cover: { thumbnail: mediaUrl("cover:thumbnail"), list: mediaUrl("cover:list"), detail: mediaUrl("cover:detail"), fullscreen: mediaUrl("cover:fullscreen") } },
  expiresAt: "2099-11-15T00:00:00.000Z", qualities: [360] };
let server: Server;
let requestBody: unknown, listingBody: unknown, mediaBody: unknown;
let afterResponse: (path: string) => void;
let beforeResponse: (path: string) => Promise<void>;
let responseStatus: (path: string) => number;
let deskActor: unknown;
let catalogBody: (path: string) => unknown;
let seen: { path: string; method: string; auth: string | undefined; cookie: string | undefined }[];
beforeAll(async () => {
  server = createServer(async (req, res) => {
    const path = req.url ?? "";
    seen.push({ path, method: req.method ?? "", auth: req.headers.authorization, cookie: req.headers.cookie });
    await beforeResponse(path);
    let body: unknown;
    if (path.endsWith("/desk")) body = { purpose: "vehicle-history", mode: "synthetic", actor: deskActor, requests: [] };
    else if (path.includes("/vehicle-history/operator/requests/")) body = requestBody;
    else if (path === `/api/v1/listings/${source}`) body = listingBody;
    else if (path.startsWith(mediaPath)) body = { ...mediaBody as object, ...(path.endsWith("/playback") ? { url: mediaUrl("master") } : {}) };
    else body = catalogBody(path);
    const status = responseStatus(path);
    afterResponse(path);
    if (status === 0) { req.socket.destroy(); return; }
    res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  vi.stubEnv("API_BASE_URL", `http://127.0.0.1:${(server.address() as { port: number }).port}`);
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); vi.unstubAllEnvs(); });
beforeEach(() => {
  context.token = `e30.${Buffer.from(JSON.stringify({ sub: actor.id, sid: session })).toString("base64url")}.synthetic`;
  context.headers = new Headers({ "x-real-ip": "203.0.113.7" });
  requestBody = selected; listingBody = listing; mediaBody = video; seen = []; afterResponse = () => {};
  beforeResponse = async () => {}; responseStatus = () => 200; deskActor = actor;
  catalogBody = () => ({ items: [], nextCursor: null, hasMore: false });
});

it.each(["tk", "ru", "en"])("keeps %s public content contact-free and resolves the merged catalog reader", async (locale) => {
  listingBody = { ...listing, contactPhone: "private", sellerId: actor.id, pendingVideo: { secret: true },
    seller: { ...listing.seller, id: actor.id, phone: "private" } };
  catalogBody = (path) => ({ items: [{ id: source, name: locale === "ru" ? "Тойота" : "Toyota", slug: "toyota",
    ...(path.includes("/models") ? { brandId: source } : path.includes("/cities") ? { regionId: source } : {}) }], hasMore: false, nextCursor: null });
  const result = await historyListingAction(locale, input);
  expect(result).toMatchObject({ status: "ok", data: { listing, labels: { brand: locale === "ru" ? "Тойота" : "Toyota", model: expect.any(String), city: expect.any(String), region: expect.any(String) } } });
  expect(JSON.stringify(result)).not.toMatch(/private|sellerId|pendingVideo/);
});

it.each(["detail", "cover", "play"])("returns absent without any Listing or media read for %s", async (kind) => {
  requestBody = { ...selected, sourceListingId: null };
  expect(await historyListingAction("en", { ...input, kind })).toMatchObject({ status: "absent", id, scope });
  expect(seen.every((entry) => entry.path.includes("/vehicle-history/"))).toBe(true);
});

it("rejects strict input and expired markers before any network read", async () => {
  for (const value of [null, [], {}, { ...input, id: "../private" }, { ...input, scope: "token" },
    { ...input, expectedAssignmentVersion: -1 }, { ...input, expectedAssignmentVersion: "1" }, { ...input, kind: "claim" },
    ...["listingId", "sourceListingId", "audience", "target", "key", "returnTo"].map((key) => ({ ...input, [key]: other }))]) {
    expect(await historyListingAction("en", value)).toEqual({ status: "validation" });
  }
  expect(await historyListingAction("de", input)).toEqual({ status: "validation" });
  context.headers.set("x-admin-session-expired", "1");
  await expect(historyListingAction("en", null)).rejects.toThrow("NEXT_REDIRECT");
  expect(seen).toEqual([]);
});

it.each(["actor", "session"])("rejects an old %s scope with fixed request cookies before reading a Listing", async (changed) => {
  context.token = `e30.${Buffer.from(JSON.stringify({ sub: changed === "actor" ? other : actor.id,
    sid: changed === "session" ? other : session })).toString("base64url")}.synthetic`;
  if (changed === "actor") { deskActor = { ...actor, id: other }; requestBody = { ...selected, assignedOperator: deskActor }; }
  expect(await historyListingAction("en", input)).toMatchObject({ status: "stale" });
  expect(seen.map((entry) => entry.path)).toEqual(["/api/v1/vehicle-history/desk"]);
});

it.each([401, 403, 409, 503])("refuses current assignment/purpose/session HTTP %s before Listing access", async (code) => {
  responseStatus = (path) => path.includes("/vehicle-history/") ? code : 200;
  expect(await historyListingAction("en", input)).toMatchObject({ status: code === 401 ? "expired" : code === 403 ? "denied" : code === 409 ? "conflict" : "unavailable" });
  expect(seen.every((entry) => entry.path.includes("/vehicle-history/"))).toBe(true);
});

it.each(["detail", "catalog", "cover", "play"])("reauthorizes every delayed %s success and failure with immutable cookies", async (stage) => {
  for (const outcome of [200, 404, 503, 0]) for (const lost of ["source", "assignment", "actor", "session", "grant", "lifecycle"]) {
    requestBody = selected; deskActor = actor; responseStatus = () => 200;
    const token = context.token;
    let arrived!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => { arrived = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    const target = (path: string) => stage === "detail" ? path === `/api/v1/listings/${source}`
      : stage === "catalog" ? path.includes("/catalog/") : path.startsWith(mediaPath);
    let paused = false;
    beforeResponse = async (path) => { if (target(path) && !paused) { paused = true; arrived(); await held; } };
    const pending = historyListingAction("en", { ...input, kind: stage === "catalog" ? "detail" : stage });
    await reached;
    if (lost === "source") requestBody = { ...selected, sourceListingId: other };
    if (lost === "assignment") requestBody = { ...selected, assignmentVersion: 2 };
    if (lost === "actor") deskActor = { ...actor, id: other };
    responseStatus = (path) => path.includes("/vehicle-history/") && ["session", "grant", "lifecycle"].includes(lost)
      ? lost === "session" ? 401 : 403 : target(path) ? outcome : 200;
    release();
    expect(await pending).toMatchObject({ status: ["source", "assignment"].includes(lost) ? "conflict"
      : lost === "actor" || lost === "session" ? "expired" : "denied" });
    expect(context.token).toBe(token);
    expect(JSON.stringify(await pending)).not.toMatch(/Public car|synthetic.*grant|"data"/);
  }
});

it("checks authority on later catalog pages and on malformed result outcomes", async () => {
  const cursor = Buffer.from(JSON.stringify({ id: other, name: "First" })).toString("base64");
  catalogBody = (path) => path.includes("cursor=") ? { items: [], nextCursor: null, hasMore: false }
    : { items: [{ id: other, name: "First", slug: "first" }], nextCursor: cursor, hasMore: true };
  afterResponse = (path) => { if (path.includes("cursor=")) requestBody = { ...selected, sourceListingId: null }; };
  expect(await historyListingAction("en", input)).toEqual({ status: "conflict", scope });
  requestBody = selected;
  listingBody = { ...listing, id: other };
  afterResponse = (path) => { if (path === `/api/v1/listings/${source}`) requestBody = { ...selected, assignmentVersion: 2 }; };
  expect(await historyListingAction("en", input)).toEqual({ status: "conflict", scope });
});

it("preserves unavailable outcomes without fallback or data leakage", async () => {
  for (const [code, status] of [[400, "validation"], [401, "expired"], [403, "denied"], [404, "not-found"], [409, "conflict"], [503, "unavailable"], [0, "unavailable"]]) {
    responseStatus = (path) => path.includes("/listings/") ? Number(code) : 200;
    for (const kind of ["detail", "cover", "play"]) {
      expect(await historyListingAction("en", { ...input, kind })).toEqual({ status, scope });
    }
  }
  expect(seen.filter((entry) => entry.path.includes("/listings/")).every((entry) =>
    entry.path === `/api/v1/listings/${source}` || entry.path === mediaPath || entry.path === `${mediaPath}/playback`)).toBe(true);
});

it("rejects wrong identities, owner state and mismatched viewer grant resources", async () => {
  for (const patch of [{ id: other }, { id: "malformed" }, { mine: false }, { assignedOperator: { ...actor, id: other } }, { sourceListingId: "../private" }]) {
    requestBody = { ...selected, ...patch };
    expect(await historyListingAction("en", input)).toMatchObject({ status: expect.stringMatching(/conflict|unavailable/) });
  }
  requestBody = selected;
  for (const patch of [{ status: "processing" }, { status: "none", video: video.video }, { video: undefined },
    { pendingStatus: "processing" }, { expiresAt: "2020-01-01T00:00:00.000Z" },
    { video: { ...video.video, id: other } }, { video: { ...video.video, generationId: other } },
    { video: { ...video.video, cover: { ...video.video.cover, detail: mediaUrl("cover:detail", "owner-preview") } } },
    { video: { ...video.video, cover: { ...video.video.cover, detail: mediaUrl("cover:thumbnail") } } },
    { video: { ...video.video, cover: { ...video.video.cover, detail: "javascript:alert(1)" } } },
    { url: mediaUrl("master") }]) {
    mediaBody = { ...video, ...patch };
    expect(await historyListingAction("en", { ...input, kind: "cover" })).toEqual({ status: "unavailable", scope });
  }
  mediaBody = { status: "none" };
  expect(await historyListingAction("en", { ...input, kind: "cover" })).toMatchObject({ status: "ok", data: { status: "none" } });
});

it("discards public detail when the selected request's source changes during its read", async () => {
  afterResponse = (path) => { if (path === `/api/v1/listings/${source}`) requestBody = { ...selected, sourceListingId: other }; };
  expect(await historyListingAction("en", input)).toEqual({ status: "conflict", scope });
  expect(seen.some((entry) => entry.path.includes("/catalog/"))).toBe(false);
});

it("reads authenticated viewer covers and only explicitly starts playback for the derived source", async () => {
  for (const kind of ["cover", "play"] as const) {
    expect(await historyListingAction("ru", { ...input, kind })).toMatchObject({ status: "ok", kind, sourceListingId: source,
      data: { ...video, ...(kind === "play" ? { url: mediaUrl("master") } : {}) } });
  }
  expect(seen.filter((entry) => entry.path.includes("/listings/")).map(({ path, method, auth }) => ({ path, method, auth })))
    .toEqual([{ path: mediaPath, method: "GET", auth: `Bearer ${context.token}` },
      { path: `${mediaPath}/playback`, method: "POST", auth: `Bearer ${context.token}` }]);
});

it("reads only the currently assigned source through anonymous public HTTP", async () => {
  const result = await historyListingAction("en", input);
  expect(result).toMatchObject({ status: "ok", kind: "detail", id, scope, sourceListingId: source,
    data: { listing, labels: {} } });
  const publicReads = seen.filter((entry) => entry.path.includes("/listings/") || entry.path.includes("/catalog/"));
  expect(publicReads.every((entry) => !entry.auth && !entry.cookie && entry.method === "GET")).toBe(true);
  expect(seen.filter((entry) => entry.path.includes("/vehicle-history/")).every((entry) => entry.auth === `Bearer ${context.token}`)).toBe(true);
  expect(JSON.stringify(result)).not.toContain(context.token);
});
