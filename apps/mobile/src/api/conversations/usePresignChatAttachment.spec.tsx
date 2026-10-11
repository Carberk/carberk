// @vitest-environment happy-dom

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { usePresignChatAttachment } from "./usePresignChatAttachment";

const mockPost = vi.fn();

vi.mock("../client", () => ({
  apiClient: {
    get: vi.fn(),
    post: (...args: unknown[]) => mockPost(...args),
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

describe("usePresignChatAttachment", () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it("posts presign request and returns upload URL and key", async () => {
    mockPost.mockResolvedValue({
      uploadUrl: "https://minio.example.com/chat-attachments/conv-1/key/original.webp?X-Amz-Algorithm=AWS4-HMAC-SHA256",
      key: "chat-attachments/conv-1/key/original.webp",
      expiresIn: 300,
      maxSizeBytes: 5 * 1024 * 1024,
    });

    const { result } = renderHook(() => usePresignChatAttachment(), { wrapper });

    result.current.mutate({
      conversationId: "conv-1",
      request: { contentType: "image/webp", sizeBytes: 1_024_000 },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.key).toBe("chat-attachments/conv-1/key/original.webp");
    expect(mockPost).toHaveBeenCalledWith(
      "/conversations/conv-1/attachments/presign",
      { contentType: "image/webp", sizeBytes: 1_024_000 },
      expect.any(Object),
    );
  });

  it("surfaces API errors", async () => {
    mockPost.mockRejectedValue(
      new (class extends Error {
        constructor() {
          super("Forbidden");
          this.name = "ApiError";
        }
        code = "FORBIDDEN";
        status = 403;
      })(),
    );

    const { result } = renderHook(() => usePresignChatAttachment(), { wrapper });

    result.current.mutate({
      conversationId: "conv-1",
      request: { contentType: "image/webp", sizeBytes: 1_024_000 },
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as unknown as { code: string }).code).toBe(
      "FORBIDDEN",
    );
  });
});
