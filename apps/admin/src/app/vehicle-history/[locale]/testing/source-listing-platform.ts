import { createHash } from "node:crypto";

import { vi } from "vitest";
import type { ListingsSchemas as L } from "@auto-tm/contracts";

import type { HistorySourceListing } from "../../../../lib/history-source-listing";

export const actor = { id: "10000000-0000-4000-8000-000000001270", displayName: "Aýna", nameNumber: 1270 };
export const id = "10000000-0000-4000-8000-000000001271";
export const source = "10000000-0000-4000-8000-000000001272";
export const session = "10000000-0000-4000-8000-000000001273";
export const scope = createHash("sha256").update(`history-inbox\0${actor.id}\0${session}`).digest("hex");
export const token = `e30.${Buffer.from(JSON.stringify({ sub: actor.id, sid: session })).toString("base64url")}.synthetic`;
export const selection = { id, scope, expectedAssignmentVersion: 1 };
const at = "2026-11-15T00:00:00.000Z";
export const photo = (index: number, sortOrder = index) => ({
  id: `10000000-0000-4000-8000-${String(1280 + index).padStart(12, "0")}`, kind: "image" as const,
  key: `public/photo-${index}/original.webp`, width: 1200, height: 900, sortOrder,
  variants: Object.fromEntries(["thumbnail", "list", "detail", "fullscreen"].map((variant) =>
    [variant, `https://photos.test/${index}/${variant}.webp`])) as L.MediaVariant,
});
export const listing: HistorySourceListing = {
  id: source, publicNumber: 1270, status: "active", brandId: source, modelId: source,
  year: 2020, condition: "used", priceAmount: 100000, priceCurrency: "TMT", displayPriceTmt: 100000,
  regionId: source, cityId: source, description: "Public car", acceptsExchange: false, installmentAvailable: false,
  seller: { displayName: "Seller", nameNumber: 4837, avatarIndex: 2, avatarKey: null, deleted: false, memberSince: at },
  media: [photo(2, 1), photo(1, 0), photo(3, 1)], publishedAt: at, createdAt: at, updatedAt: at,
};
export function access(generation = id, play = false): L.VideoAccessResponse {
  const url = (member: string) => `https://media.test/api/v1/listings/video-files/viewer/${source}/${generation}/${Buffer.from(member).toString("base64url")}.${member === "master" ? "m3u8" : "webp"}?grant=synthetic`;
  return { status: "ready", video: { id: source, generationId: generation, durationMs: 90000,
    cover: { thumbnail: url("cover:thumbnail"), list: url("cover:list"), detail: url("cover:detail"), fullscreen: url("cover:fullscreen") } },
  expiresAt: new Date(Date.now() + 300000).toISOString(), qualities: [360], ...(play ? { url: url("master") } : {}) };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
export function sourceListingPlatform() {
  const selected = { id, createdAt: at, status: "enquiry", mine: true, assignmentVersion: 1,
    assignedOperator: actor, requester: { displayName: "Merdan", nameNumber: 4837, deleted: false }, sourceListingId: source };
  const world = {
    selected, listing: structuredClone(listing), cover: access(), playback: access(id, true),
    seen: [] as { path: string; method: string; auth: string | null }[],
    before: async (_path: string, _method: string): Promise<Response | undefined> => undefined,
    hls: hlsPlatform(),
  };
  vi.stubEnv("API_BASE_URL", "http://127.0.0.1:1");
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    world.seen.push({ path, method, auth: new Headers(init?.headers).get("Authorization") });
    const override = await world.before(path, method);
    if (override) return override;
    const body = path.endsWith("/desk") ? { purpose: "vehicle-history", mode: "synthetic", actor, requests: [] }
      : path.includes("/vehicle-history/operator/requests/") ? world.selected
      : path === `/api/v1/listings/${source}` ? world.listing
      : path.endsWith("/playback") ? world.playback
      : path.includes("/video-access/") ? world.cover : { items: [], nextCursor: null, hasMore: false };
    return Response.json(body);
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) { this.currentTime = 0; });
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("probably");
  return world;
}

function hlsPlatform() {
  type Listener = (event: string, data: { fatal?: boolean }) => void;
  const platform = { supported: false, entered: false, importGate: Promise.resolve(undefined), instances: [] as FakeHls[] };
  class FakeHls {
    static Events = { ERROR: "hlsError", MANIFEST_PARSED: "hlsManifestParsed" };
    static isSupported() { return platform.supported; }
    url = "";
    element?: HTMLMediaElement;
    destroyed = false;
    handlers = new Map<string, Listener>();
    archived = new Map<string, Listener>();
    constructor() { platform.instances.push(this); }
    on(event: string, listener: Listener) {
      this.handlers.set(event, listener);
      this.archived.set(event, listener);
    }
    off(event: string) { this.handlers.delete(event); }
    loadSource(url: string) { this.url = url; }
    attachMedia(element: HTMLMediaElement) { this.element = element; }
    emit(event: string, fatal = false) { this.handlers.get(event)?.(event, { fatal }); }
    late(event: string, fatal = false) { this.archived.get(event)?.(event, { fatal }); }
    destroy() { this.destroyed = true; this.handlers.clear(); }
  }
  vi.doMock("hls.js", async () => {
    platform.entered = true;
    await platform.importGate;
    return { default: FakeHls };
  });
  return platform;
}

export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing rendered media or platform fixture");
  return value;
}

export function fireTimer(handler: unknown) {
  if (typeof handler !== "function") throw new Error("Expected a scheduled media expiry callback");
  handler();
}
