import { http, HttpResponse } from "msw";
import { beforeEach, expect, it, vi } from "vitest";

import { storeAuthSession } from "../../auth/session";
import { queryKeys } from "../../api/queryKeys";
import { server } from "../../../test/msw";
import { renderMobile } from "../../../test/render";

import { OrphanCleanupOnBoot } from "./OrphanCleanupOnBoot";

const device = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  directories: new Set<string>(),
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => device.storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { device.storage.set(key, value); },
  deleteItemAsync: async (key: string) => { device.storage.delete(key); },
}));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  getInfoAsync: async (uri: string) => ({
    exists: uri === "file:///documents/listing-staging/" || device.directories.has(uri.split("/").at(-2) ?? ""),
  }),
  readDirectoryAsync: async () => [...device.directories],
  deleteAsync: async (uri: string) => { device.directories.delete(uri.split("/").at(-2) ?? ""); },
}));

const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const USER_ID = id(100);
const EDIT_DIR = `edit-${id(21)}`;
const DRAFT_DIR = `draft-${id(42)}`;
const pageRequests: string[] = [];

function listing(index: number) {
  return {
    id: id(index), sellerId: USER_ID, status: "active", brandId: id(200),
    modelId: id(201), cityId: id(202), priceAmount: 100, priceCurrency: "TMT",
    displayPriceTmt: 100, photoKeys: [], photoCount: 0, publishedAt: "2026-01-01T00:00:00.000Z",
  };
}

function draft(index: number) {
  return { id: id(index), userId: USER_ID, payload: {}, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
}

beforeEach(async () => {
  device.storage.clear();
  device.directories.clear();
  pageRequests.length = 0;
  [EDIT_DIR, DRAFT_DIR, "edit-gone", "draft-gone", "unknown-keep"].forEach(dir => device.directories.add(dir));
  await storeAuthSession({
    accessToken: "synthetic-access", refreshToken: "synthetic-refresh",
    user: { id: USER_ID, phone: "+99365123456", email: null, displayName: null, role: "buyer" },
  });
  server.use(
    http.get("*/me/listings", ({ request }) => {
      const cursor = new URL(request.url).searchParams.get("cursor");
      pageRequests.push(`listings:${cursor ?? "first"}`);
      return HttpResponse.json(cursor
        ? { items: [listing(21)], nextCursor: null }
        : { items: Array.from({ length: 20 }, (_, i) => listing(i + 1)), nextCursor: "listing-page-2" });
    }),
    http.get("*/me/drafts", ({ request }) => {
      const cursor = new URL(request.url).searchParams.get("cursor");
      pageRequests.push(`drafts:${cursor ?? "first"}`);
      return HttpResponse.json(cursor
        ? { items: [draft(42)], nextCursor: null }
        : { items: [draft(41)], nextCursor: "draft-page-2" });
    }),
  );
});

it("keeps staged edit and draft photos beyond page one while deleting genuine orphans", async () => {
  await renderMobile(<OrphanCleanupOnBoot />);

  await vi.waitFor(() => expect(device.directories.has("edit-gone")).toBe(false));
  expect([...device.directories].sort()).toEqual([DRAFT_DIR, EDIT_DIR, "unknown-keep"].sort());
  expect(pageRequests).toContain("listings:listing-page-2");
  expect(pageRequests).toContain("drafts:draft-page-2");
});

it.each(["listings", "drafts"])("preserves every directory if a later %s page fails", async (path) => {
  const before = [...device.directories];
  server.use(http.get(`*/me/${path}`, ({ request }) => {
    if (new URL(request.url).searchParams.has("cursor")) {
      return HttpResponse.json({ code: "INTERNAL" }, { status: 500 });
    }
    return HttpResponse.json({ items: path === "listings" ? [listing(1)] : [draft(41)], nextCursor: "later" });
  }));
  const view = await renderMobile(<OrphanCleanupOnBoot />);

  await vi.waitFor(() => expect(view.queryClient.getQueryState(queryKeys.listings.stagingOwners(USER_ID))?.status).toBe("error"));
  expect([...device.directories]).toEqual(before);
});

it("preserves every directory when pagination repeats a cursor", async () => {
  const before = [...device.directories];
  server.use(http.get("*/me/listings", () => HttpResponse.json({ items: [listing(1)], nextCursor: "repeated" })));
  const view = await renderMobile(<OrphanCleanupOnBoot />);

  await vi.waitFor(() => expect(view.queryClient.getQueryState(queryKeys.listings.stagingOwners(USER_ID))?.status).toBe("error"));
  expect([...device.directories]).toEqual(before);
});

it("waits for the final page before deleting any staging directory", async () => {
  const before = [...device.directories];
  let release: (() => void) | undefined;
  server.use(http.get("*/me/listings", async ({ request }) => {
    if (!new URL(request.url).searchParams.has("cursor")) {
      return HttpResponse.json({ items: Array.from({ length: 20 }, (_, i) => listing(i + 1)), nextCursor: "last" });
    }
    await new Promise<void>(resolve => { release = resolve; });
    return HttpResponse.json({ items: [listing(21)], nextCursor: null });
  }));
  await renderMobile(<OrphanCleanupOnBoot />);

  await vi.waitFor(() => expect(release).toBeDefined());
  expect([...device.directories]).toEqual(before);
  release?.();
  await vi.waitFor(() => expect(device.directories.has("edit-gone")).toBe(false));
  expect([...device.directories].sort()).toEqual([DRAFT_DIR, EDIT_DIR, "unknown-keep"].sort());
});
