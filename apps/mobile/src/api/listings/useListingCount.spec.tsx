// @vitest-environment happy-dom

import type { ListingsSchemas } from "@auto-tm/contracts";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useListingCount } from "./useListingCount";

const mockGet = vi.fn();

vi.mock("../client", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
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
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useListingCount", () => {
  beforeEach(() => {
    mockGet.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("fetches count for empty filters", async () => {
    mockGet.mockResolvedValue({ totalMatching: 100 });

    const { result } = renderHook(() => useListingCount({}), { wrapper });

    vi.advanceTimersByTime(300);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.totalMatching).toBe(100);
    expect(mockGet).toHaveBeenCalledWith(
      "/listings/count?",
      expect.any(Object),
      { auth: false },
    );
  });

  it("appends only defined filter fields", async () => {
    mockGet.mockResolvedValue({ totalMatching: 12 });

    renderHook(
      () =>
        useListingCount({
          filters: {
            brandId: "brand-1",
            modelId: undefined,
            cityId: "",
            priceMin: null,
            condition: "used",
          } as unknown as ListingsSchemas.ListingFilter,
        }),
      { wrapper },
    );

    vi.advanceTimersByTime(300);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    const url = String(mockGet.mock.calls[0]?.[0]);
    expect(url).toContain("brandId=brand-1");
    expect(url).toContain("condition=used");
    expect(url).not.toContain("modelId=");
    expect(url).not.toContain("cityId=");
    expect(url).not.toContain("priceMin=");
  });

  it("debounces filter changes", async () => {
    mockGet.mockResolvedValue({ totalMatching: 0 });

    const { result, rerender } = renderHook(
      ({ filters }) => useListingCount({ filters }),
      {
        wrapper,
        initialProps: {
          filters: {
            brandId: "brand-a",
          } as ListingsSchemas.ListingFilter,
        },
      },
    );

    vi.advanceTimersByTime(300);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);

    rerender({
      filters: {
        brandId: "brand-b",
      } as ListingsSchemas.ListingFilter,
    });
    rerender({
      filters: {
        brandId: "brand-c",
      } as ListingsSchemas.ListingFilter,
    });

    vi.advanceTimersByTime(300);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));

    const lastUrl = String(mockGet.mock.calls[mockGet.mock.calls.length - 1]?.[0]);
    expect(lastUrl).toContain("brandId=brand-c");
  });

  describe("invalid draft becoming valid (stale invalid criteria)", () => {
    const invalid = { yearMin: 2025, yearMax: 2020 } as ListingsSchemas.ListingFilter;
    const valid = { yearMin: 2025, yearMax: 2026 } as ListingsSchemas.ListingFilter;
    const requestedUrls = () => mockGet.mock.calls.map((call) => String(call[0]));

    it("never requests the stale invalid criteria when the draft becomes valid", async () => {
      mockGet.mockResolvedValue({ totalMatching: 7 });

      const { result, rerender } = renderHook(
        ({ filters, enabled }) => useListingCount({ filters, enabled }),
        { wrapper, initialProps: { filters: invalid, enabled: false } },
      );

      vi.advanceTimersByTime(500);
      expect(mockGet).not.toHaveBeenCalled();

      rerender({ filters: valid, enabled: true });
      await vi.advanceTimersByTimeAsync(300);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(requestedUrls().filter((url) => url.includes("yearMax=2020"))).toEqual([]);
      expect(requestedUrls()).toEqual(["/listings/count?yearMin=2025&yearMax=2026"]);
      expect(result.current.data?.totalMatching).toBe(7);
    });

    it("never requests the criteria that went invalid mid-edit after the draft recovers", async () => {
      mockGet.mockResolvedValue({ totalMatching: 3 });
      const earlier = { yearMin: 2018, yearMax: 2020 } as ListingsSchemas.ListingFilter;

      const { result, rerender } = renderHook(
        ({ filters, enabled }) => useListingCount({ filters, enabled }),
        { wrapper, initialProps: { filters: earlier, enabled: true } },
      );
      await vi.advanceTimersByTimeAsync(300);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      mockGet.mockClear();

      rerender({ filters: invalid, enabled: false });
      await vi.advanceTimersByTimeAsync(500);
      rerender({ filters: valid, enabled: true });
      await vi.advanceTimersByTimeAsync(300);
      // The earlier criteria's cached count is also 3, so wait for the request itself.
      await waitFor(() =>
        expect(requestedUrls()).toEqual(["/listings/count?yearMin=2025&yearMax=2026"]),
      );
      await waitFor(() => expect(result.current.data?.totalMatching).toBe(3));

      expect(requestedUrls().filter((url) => url.includes("yearMax=2020"))).toEqual([]);
    });

    it("keeps the loading state, without a request, until the valid criteria settle", async () => {
      mockGet.mockResolvedValue({ totalMatching: 9 });

      const { result, rerender } = renderHook(
        ({ filters, enabled }) => useListingCount({ filters, enabled }),
        { wrapper, initialProps: { filters: invalid, enabled: false } },
      );
      rerender({ filters: valid, enabled: true });

      expect(result.current.isPending).toBe(true);
      expect(result.current.isError).toBe(false);
      expect(mockGet).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(300);
      await waitFor(() => expect(result.current.data?.totalMatching).toBe(9));
    });

    it("shows the cached count of the earlier valid criteria, without a request, until the new ones settle", async () => {
      const earlier = { yearMin: 2018, yearMax: 2020 } as ListingsSchemas.ListingFilter;
      mockGet.mockResolvedValueOnce({ totalMatching: 3 }).mockResolvedValue({ totalMatching: 8 });

      const { result, rerender } = renderHook(
        ({ filters, enabled }) => useListingCount({ filters, enabled }),
        { wrapper, initialProps: { filters: earlier, enabled: true } },
      );
      await vi.advanceTimersByTimeAsync(300);
      await waitFor(() => expect(result.current.data?.totalMatching).toBe(3));
      mockGet.mockClear();

      rerender({ filters: invalid, enabled: false });
      rerender({ filters: valid, enabled: true });

      // Within the debounce window the hook still answers for the earlier criteria:
      // their cached count, not a loading state or an error.
      expect(result.current.data?.totalMatching).toBe(3);
      expect(result.current.isPending).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(mockGet).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(300);
      await waitFor(() => expect(result.current.data?.totalMatching).toBe(8));
      expect(requestedUrls()).toEqual(["/listings/count?yearMin=2025&yearMax=2026"]);
    });
  });

  it("surfaces a count error for the current criteria and retries them with refetch", async () => {
    mockGet.mockRejectedValueOnce(new Error("count failed")).mockResolvedValue({ totalMatching: 4 });

    const { result } = renderHook(
      () => useListingCount({ filters: { brandId: "brand-1" } as ListingsSchemas.ListingFilter }),
      { wrapper },
    );

    await vi.advanceTimersByTimeAsync(300);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();

    await result.current.refetch();
    await waitFor(() => expect(result.current.data?.totalMatching).toBe(4));
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(String(mockGet.mock.calls[1]?.[0])).toContain("brandId=brand-1");
  });

  it("does not fetch when disabled", async () => {
    mockGet.mockResolvedValue({ totalMatching: 1 });

    const { result } = renderHook(
      () => useListingCount({ filters: { brandId: "brand-1" } as ListingsSchemas.ListingFilter, enabled: false }),
      { wrapper },
    );

    vi.advanceTimersByTime(500);
    expect(result.current.isPending).toBe(true);
    expect(mockGet).not.toHaveBeenCalled();
  });
});

it("passes Results sort/multiple models and exposes the server TMT price range", async () => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ totalMatching: 2, priceMinTmt: 70000, priceMaxTmt: 120000 });
  const { result } = renderHook(() => useListingCount({ filters: { brandId: "toyota", modelIds: ["camry", "corolla"], sort: "price_desc" } }), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const url = new URL(String(mockGet.mock.lastCall?.[0]), "http://example.test");
  expect(url.searchParams.get("sort")).toBe("price_desc"); expect(url.searchParams.getAll("modelIds")).toEqual(["camry", "corolla"]);
  expect(result.current.data).toEqual({ totalMatching: 2, priceMinTmt: 70000, priceMaxTmt: 120000 });
});
