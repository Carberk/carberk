// @vitest-environment happy-dom

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";

import { server } from "../../../test/msw";

import { useAttachMedia } from "./useAttachMedia";

vi.mock("../../auth/session", () => ({
  loadAuthSession: vi.fn(() =>
    Promise.resolve({
      accessToken: "token-123",
      refreshToken: "refresh-123",
      user: { id: "u1", phone: "+99361000000", displayName: null, role: "buyer" },
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

describe("useAttachMedia", () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it("returns parsed attach-media response", async () => {
    server.use(
      http.post("*/listings/:id/media/attach", () =>
        HttpResponse.json({
          id: "550e8400-e29b-41d4-a716-446655440001",
          listingId: "550e8400-e29b-41d4-a716-446655440000",
          kind: "image",
          key: "listings/l1/m1/original.webp",
          sortOrder: 0,
          width: 1920,
          height: 1080,
          createdAt: "2026-05-21T12:00:00.000Z",
        }),
      ),
    );

    const { result } = renderHook(() => useAttachMedia("550e8400-e29b-41d4-a716-446655440000"), {
      wrapper,
    });

    result.current.mutate({
      key: "listings/l1/m1/original.webp",
      kind: "image",
      sortOrder: 0,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.id).toBe("550e8400-e29b-41d4-a716-446655440001");
    expect(result.current.data?.key).toBe("listings/l1/m1/original.webp");
  });

  it("surfaces a contract violation when API returns garbage", async () => {
    server.use(
      http.post("*/listings/:id/media/attach", () =>
        HttpResponse.json({ wrong: "shape" }),
      ),
    );

    const { result } = renderHook(() => useAttachMedia("550e8400-e29b-41d4-a716-446655440000"), {
      wrapper,
    });

    result.current.mutate({
      key: "listings/l1/m1/original.webp",
      kind: "image",
      sortOrder: 0,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as unknown as { code: string }).code).toBe(
      "CONTRACT_VIOLATION",
    );
  });
});
