// @vitest-environment happy-dom

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useRestoreAccount } from "./useRestoreAccount";

const mockPost = vi.fn();

vi.mock("../client", () => ({
  apiClient: {
    get: vi.fn(),
    post: (...args: unknown[]) => mockPost(...args),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public code: string,
      public status: number,
      message?: string,
    ) {
      super(message ?? code);
      this.name = "ApiError";
    }
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useRestoreAccount", () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it("calls POST /me/restore with the pending session's access token", async () => {
    const me = { id: "u1", deletionScheduledAt: null };
    mockPost.mockResolvedValue(me);

    const { result } = renderHook(() => useRestoreAccount(), { wrapper });

    result.current.mutate("pending-access-token");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPost).toHaveBeenCalledWith(
      "/me/restore",
      undefined,
      expect.any(Object),
      { accessToken: "pending-access-token" },
    );
    expect(result.current.data).toEqual(me);
  });

  it("surfaces a failed restore", async () => {
    const { ApiError } = await import("../client");
    mockPost.mockRejectedValue(new ApiError("NETWORK_ERROR", 0, "offline"));

    const { result } = renderHook(() => useRestoreAccount(), { wrapper });

    result.current.mutate("pending-access-token");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as unknown as { code: string }).code).toBe(
      "NETWORK_ERROR",
    );
  });
});
