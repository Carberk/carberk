import * as SecureStore from "expo-secure-store";
import { http, HttpResponse } from "msw";
import { vi } from "vitest";

import { clearAuthSession, storeAuthSession } from "../../src/auth/session";
import { server } from "../msw";
import { photoApiStorage } from "../profile-photo-storage";

const timestamp = "2026-11-01T00:00:00Z";

export function draftReceipt(id: string, payload: unknown) {
  return { id, userId: id, payload, createdAt: timestamp, updatedAt: timestamp };
}

export function publishedDraft(id: string) {
  return HttpResponse.json({ id, sellerId: id, status: "active", brandId: id, modelId: id,
    priceAmount: 100000, priceCurrency: "TMT", publishedAt: timestamp }, { status: 201 });
}

export function draftFailure(code: string, status: number, message?: string, details?: unknown) {
  return HttpResponse.json({ code, message, details }, { status });
}

export async function serveSellDraft(id: string, phone: string, payload: () => unknown) {
  vi.stubGlobal("__DEV__", false);
  photoApiStorage.clear();
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => photoApiStorage.get(key) ?? null);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { photoApiStorage.set(key, value); });
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => { photoApiStorage.delete(key); });
  await clearAuthSession();
  await storeAuthSession({ accessToken: "seller", refreshToken: "seller-refresh", user: {
    id, phone, email: null, displayName: null, role: "seller",
  } });
  const page = (items: unknown[]) => HttpResponse.json({ items, nextCursor: null, hasMore: false });
  server.use(
    http.get("*/me", () => HttpResponse.json({ id, phone, email: null, phoneVerified: true, displayName: null,
      nameNumber: 1234, avatarIndex: 0, avatarKey: null, avatarUrl: null, role: "seller", locale: "en",
      createdAt: timestamp, deletionScheduledAt: null })),
    http.get("*/me/contact-phones", () => HttpResponse.json({ items: [] })),
    http.get("*/me/drafts", () => page([draftReceipt(id, payload())])),
    http.patch("*/listings/drafts/:id", async ({ request }) => HttpResponse.json(draftReceipt(id, await request.json()))),
    http.get("*/catalog/brands", () => page([{ id, slug: "toyota", name: "Toyota" }])),
    http.get("*/catalog/brands/:brandId/models", () => page([{ id, brandId: id, slug: "camry", name: "Camry" }])),
    http.get("*/catalog/regions", () => page([{ id, slug: "ahal", name: "Ahal" }])),
    http.get("*/catalog/regions/:regionId/cities", () => page([{ id, regionId: id, slug: "ashgabat", name: "Ashgabat" }])),
    http.get("*/catalog/*", () => page([])),
    http.get("*/exchange-rates", () => HttpResponse.json({ rates: [] })),
  );
}
