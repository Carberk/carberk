// @vitest-environment happy-dom

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useRevokePendingSession } from "./useRevokePendingSession";

const mockPost = vi.fn();

vi.mock("../client", () => ({
  apiClient: {
    get: vi.fn(),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useRevokePendingSession", () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it("logs the pending session out on the server with its refresh token, without the stored session", async () => {
    mockPost.mockResolvedValue(undefined);

    const { result } = renderHook(() => useRevokePendingSession(), { wrapper });

    result.current.mutate("pending-refresh-token");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPost).toHaveBeenCalledWith(
      "/auth/logout",
      { refreshToken: "pending-refresh-token" },
      undefined,
      { auth: false },
    );
  });

  it("does not fail the caller when the server cannot be reached", async () => {
    mockPost.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useRevokePendingSession(), { wrapper });

    result.current.mutate("pending-refresh-token");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
