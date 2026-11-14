import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { server } from "../../test/msw";
import { photoApiStorage } from "../../test/profile-photo-storage";
import { clearAuthSession, loadAuthSession, storeAuthSession } from "../auth/session";
import { publishFailureOf } from "../listings/wizard/publishFailure";
import { useSaveListingEdit } from "../listings/edit/useSaveListingEdit";

import { apiClient } from "./client";
import { provisionGatewayKey, removeGatewayKey, selectTesterRoute } from "./routes";
import { usePublishDraft } from "./listings/usePublishDraft";
import { useRequestOtp } from "./identity/useRequestOtp";
import { useVerifyOtp } from "./identity/useVerifyOtp";

vi.mock("expo-secure-store", async () => {
  const { photoApiStorage: storage } = await import("../../test/profile-photo-storage");
  return { getItemAsync: async (key: string) => storage.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { storage.set(key, value); },
    deleteItemAsync: async (key: string) => { storage.delete(key); } };
});

const id = "00000000-0000-4000-8000-000000000373";
const clients = new Set<QueryClient>();
async function setup<T>(hook: () => T) {
  // A caller's retry defaults must never turn an uncertain write into replay.
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 2, retryDelay: 0 } } });
  clients.add(client);
  function wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return renderHook(hook, { wrapper });
}

beforeEach(async () => {
  vi.stubGlobal("__DEV__", true);
  vi.stubEnv("EXPO_PUBLIC_API_URL", "https://api-staging-2861.up.railway.app/api/v1");
  vi.stubEnv("EXPO_PUBLIC_ENV", "staging");
  vi.stubEnv("EXPO_PUBLIC_GATEWAY_TESTER", "true");
  photoApiStorage.clear();
  await clearAuthSession();
  await storeAuthSession({ accessToken: "owner", refreshToken: "owner-refresh", user: {
    id, phone: null, email: "owner@example.test", displayName: null, role: "seller",
  } });
  await provisionGatewayKey("synthetic-test-access-key-0000000000");
  selectTesterRoute("global");
});
afterEach(() => { clients.forEach((client) => client.clear()); clients.clear(); selectTesterRoute("global"); vi.unstubAllEnvs(); });

it.each(["lost", "unreadable", "invalid contract"])("keeps a %s publication answer uncertain and sends the draft only once across entry changes", async (failure) => {
  const published: string[] = [];
  server.use(
    http.post("*/listings/drafts/:draftId/publish", ({ params }) => {
      published.push(String(params.draftId));
      return failure === "lost" ? HttpResponse.error() : failure === "unreadable"
        ? new HttpResponse("{", { status: 201, headers: { "Content-Type": "application/json" } })
        : HttpResponse.json({ invalid: true }, { status: 201 });
    }),
    http.get("*/me/listings", () => HttpResponse.json({ items: published.map(() => ({ id })) })),
  );
  const { result } = await setup(usePublishDraft);
  let error: unknown;
  await act(async () => { error = await result.current.mutateAsync(id).catch((failure: unknown) => failure); });
  expect(publishFailureOf(error)).toBe("uncertain");
  expect(result.current.isSuccess).toBe(false);
  selectTesterRoute("tm");
  await act(async () => { await result.current.mutateAsync(id).catch(() => {}); });
  expect(await apiClient.get("/me/listings")).toEqual({ items: [{ id }] });
  expect(published).toEqual([id]);
  expect((await loadAuthSession())?.refreshToken).toBe("owner-refresh");
});

it("explicitly retries a safe attachment on the other entry with the same upload key and server media ID", async () => {
  const mediaId = "00000000-0000-4000-8000-000000000374";
  const photoId = "00000000-0000-4000-8000-000000000375";
  const key = "owned/photo/original.webp";
  const attempts: string[] = [];
  const rows = new Map<string, string>();
  let ordering: unknown;
  server.use(
    http.post("*/listings/:listingId/media/attach", async ({ request }) => {
      const body = await request.json() as { key: string };
      attempts.push(body.key);
      rows.set(body.key, mediaId);
      return attempts.length === 1 ? HttpResponse.error() : HttpResponse.json({
        id: mediaId, listingId: id, kind: "image", key, sortOrder: 0, createdAt: "2026-11-01T00:00:00Z",
      });
    }),
    http.put("*/listings/:listingId/media/order", async ({ request }) => {
      ordering = await request.json(); return HttpResponse.json({ success: true });
    }),
    http.get("*/listings/:listingId", () => HttpResponse.json({ media: [...rows.values()] })),
  );
  const { result } = await setup(() => useSaveListingEdit(id, {}, [{
    photoId, key, state: "uploaded", sortOrder: 0, retryCount: 0,
  }], []));
  await act(async () => { await result.current.save().catch(() => {}); });
  expect(attempts).toEqual([key]);
  selectTesterRoute("tm");
  await act(async () => { expect(await result.current.retry()).toBe(true); });
  expect(attempts).toEqual([key, key]);
  expect(ordering).toEqual({ ordering: [{ mediaId, sortOrder: 0 }] });
  expect(await apiClient.get(`/listings/${id}`)).toEqual({ media: [mediaId] });
  expect(result.current.status).toBe("succeeded");
});

it("can publish the same draft after a refused route preparation without losing its identity", async () => {
  const sent: string[] = [];
  await removeGatewayKey();
  selectTesterRoute("tm");
  server.use(http.post("*/listings/drafts/:draftId/publish", ({ params }) => {
    sent.push(String(params.draftId));
    return HttpResponse.json({ id, sellerId: id, status: "active", brandId: id, modelId: id,
      priceAmount: 12000, priceCurrency: "TMT", publishedAt: "2026-11-01T00:00:00Z" });
  }));
  const { result } = await setup(usePublishDraft);
  await act(async () => { await result.current.mutateAsync(id).catch(() => {}); });
  expect(sent).toEqual([]);
  selectTesterRoute("global");
  await act(async () => { expect(await result.current.mutateAsync(id)).toMatchObject({ id }); });
  expect(sent).toEqual([id]);
});

it("retains uncertain edits without replaying them after a route change or a fresh Save", async () => {
  const prices: number[] = [];
  server.use(
    http.patch("*/listings/:listingId", async ({ request }) => {
      const patch = await request.json() as { priceAmount: number };
      prices.push(patch.priceAmount);
      return HttpResponse.error();
    }),
    http.get("*/listings/:listingId", () => HttpResponse.json({ id, priceAmount: prices.at(-1) })),
  );
  const { result } = await setup(() => useSaveListingEdit(id, { priceAmount: 12000 }, [], []));
  await act(async () => { await result.current.save().catch(() => {}); });
  expect(result.current.isUncertain).toBe(true);
  expect(result.current.status).toBe("failed");
  selectTesterRoute("tm");
  await act(async () => {
    expect(await result.current.retry()).toBe(false);
    expect(await result.current.save()).toBe(false);
  });
  expect(await apiClient.get(`/listings/${id}`)).toEqual({ id, priceAmount: 12000 });
  expect(prices).toEqual([12000]);
  expect((await loadAuthSession())?.refreshToken).toBe("owner-refresh");
});

it.each(["request", "verify"] as const)("never automatically repeats a lost code %s or invents native sign-in", async (operation) => {
  await clearAuthSession();
  const committed: string[] = [];
  server.use(http.post(`*/auth/otp/${operation}`, () => {
    committed.push(operation);
    selectTesterRoute("tm");
    return HttpResponse.error();
  }));
  const { result } = await setup(() => ({ request: useRequestOtp(), verify: useVerifyOtp() }));
  await act(async () => {
    await (operation === "request"
      ? result.current.request.mutateAsync({ email: "owner@example.test" })
      : result.current.verify.mutateAsync({ email: "owner@example.test", code: "123456" })
    ).catch(() => {});
  });
  expect(committed).toEqual([operation]);
  expect(result.current[operation].isSuccess).toBe(false);
  expect(await loadAuthSession()).toBeNull();
});
