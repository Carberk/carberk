import { afterEach, describe, expect, it, vi } from "vitest";

import { readPublicListing, readPublicShowroom } from "./readers";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("anonymous marketplace network boundary", () => {
 it("refetches current lifecycle state without cache and encodes route inputs", async () => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test/");
  const urls: string[] = []; const options: RequestInit[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => { urls.push(url); options.push(init); return new Response(null, { status: 404 }); });
  expect(await readPublicListing("hidden/id")).toBeNull();
  expect(await readPublicShowroom("business", "cursor&next=unsafe")).toBeNull();
  expect(urls).toEqual(["https://api.example.test/api/v1/public-marketplace/listings/hidden%2Fid", "https://api.example.test/api/v1/public-marketplace/showrooms/business?cursor=cursor%26next%3Dunsafe"]);
  expect(options.map(option => option.cache)).toEqual(["no-store", "no-store"]);
 });
 it("refuses malformed public data and propagates service failures for retry", async () => {
  vi.stubEnv("API_BASE_URL", "https://api.example.test");
  vi.stubGlobal("fetch", async () => Response.json({ checkedEvidence: "private" }));
  await expect(readPublicListing("id")).rejects.toThrow();
  vi.stubGlobal("fetch", async () => new Response(null, { status: 503 }));
  await expect(readPublicListing("id")).rejects.toThrow("Public reader request failed");
 });
});
