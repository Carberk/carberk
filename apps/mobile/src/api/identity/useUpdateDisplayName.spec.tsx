import type { PropsWithChildren } from "react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "../../../test/msw";
import { storeAuthSession } from "../../auth/session";
import { ApiError } from "../client";
import { queryKeys } from "../queryKeys";

import { useUpdateDisplayName } from "./useUpdateDisplayName";

// The real API client and session against an in-memory API; only the device's
// storage is replaced.
const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { storage.set(key, value); },
  deleteItemAsync: async (key: string) => { storage.delete(key); },
}));

const ME = {
  id: "00000000-0000-4000-8000-00000000000a",
  phone: "+99365123456", email: null, phoneVerified: true,
  displayName: null, nameNumber: 4821, avatarIndex: 7, avatarKey: null,
  role: "buyer", avatarUrl: null, locale: "ru",
  createdAt: "2026-01-15T00:00:00.000Z", deletionScheduledAt: null,
};

async function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(queryKeys.me(), ME);
  function wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, ...(await renderHook(() => useUpdateDisplayName(), { wrapper })) };
}

beforeEach(async () => {
  storage.clear();
  await storeAuthSession({
    accessToken: "aman", refreshToken: "refresh-aman",
    user: { id: ME.id, phone: ME.phone, email: null, displayName: null, role: "buyer" },
  });
});

afterEach(() => onlineManager.setOnline(true));

describe("useUpdateDisplayName", () => {
  it("sends the name with PATCH /me and puts the answer in the cached /me", async () => {
    let sent: { method: string; body: unknown; auth: string | null } | null = null;
    server.use(
      http.patch("*/me", async ({ request }) => {
        const body = (await request.json()) as { displayName: string };
        sent = { method: request.method, body, auth: request.headers.get("authorization") };
        return HttpResponse.json({ ...ME, displayName: body.displayName });
      }),
    );
    const { client, result } = await setup();

    await act(() => result.current.mutateAsync("Aman Durdy"));

    expect(sent).toEqual({ method: "PATCH", body: { displayName: "Aman Durdy" }, auth: "Bearer aman" });
    expect(client.getQueryData(queryKeys.me())).toMatchObject({ displayName: "Aman Durdy", nameNumber: 4821 });
  });

  it("keeps the cached /me when the server refuses the name, and reports the reason", async () => {
    server.use(
      http.patch("*/me", () =>
        HttpResponse.json(
          { statusCode: 400, code: "INVALID_DISPLAY_NAME", message: "x", details: { reason: "too_long" } },
          { status: 400 },
        )),
    );
    const { client, result } = await setup();

    const error = await act(() => result.current.mutateAsync("a".repeat(31)).catch((e: unknown) => e));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "INVALID_DISPLAY_NAME", details: { reason: "too_long" } });
    expect(client.getQueryData(queryKeys.me())).toMatchObject({ displayName: null });
  });

  // The root layout tells TanStack Query when the device is offline. In the
  // default network mode the save would pause, and the editor would read
  // "Saving..." with a locked field until the network came back.
  it("fails at once when the device is offline, instead of waiting for the network", async () => {
    server.use(http.patch("*/me", () => HttpResponse.error()));
    onlineManager.setOnline(false);
    const { result } = await setup();

    let outcome: unknown = "paused";
    await act(() => {
      result.current.mutateAsync("Aman").then(
        () => { outcome = "saved"; },
        () => { outcome = "failed"; },
      );
    });
    await vi.waitFor(() => expect(outcome).not.toBe("paused"), { timeout: 500 });

    expect(outcome).toBe("failed");
  });
});
