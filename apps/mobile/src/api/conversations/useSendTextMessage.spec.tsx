// @vitest-environment happy-dom

import { readFileSync } from "fs";
import { resolve } from "path";

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useSendTextMessage } from "./useSendTextMessage";

const source = readFileSync(resolve(__dirname, "./useSendTextMessage.ts"), "utf-8");

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

function makeMessageResponse(id: string, overrides?: Record<string, unknown>) {
  return {
    id,
    conversationId: "conv-1",
    senderId: "user-1",
    text: "Hello",
    createdAt: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("useSendTextMessage", () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it("posts text and returns parsed message", async () => {
    mockPost.mockResolvedValue(makeMessageResponse("m1"));

    const { result } = renderHook(() => useSendTextMessage(), { wrapper });

    result.current.mutate({ conversationId: "conv-1", text: "Hello", clientMessageId: "client-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.id).toBe("m1");
    expect(mockPost).toHaveBeenCalledWith(
      "/conversations/conv-1/messages/rich",
      { kind: "text", text: "Hello", clientMessageId: "client-1" },
      expect.any(Object),
    );
  });

  it("surfaces validation error from API", async () => {
    mockPost.mockRejectedValue(
      new (class extends Error {
        constructor() {
          super("Validation failed");
          this.name = "ApiError";
        }
        code = "VALIDATION_FAILED";
        status = 400;
      })(),
    );

    const { result } = renderHook(() => useSendTextMessage(), { wrapper });

    result.current.mutate({ conversationId: "conv-1", text: "Hello" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as unknown as { code: string }).code).toBe(
      "VALIDATION_FAILED",
    );
  });

  it("surfaces contract violation on bad response", async () => {
    mockPost.mockRejectedValue(
      new (class extends Error {
        constructor() {
          super("Response did not match expected schema");
          this.name = "ApiError";
        }
        code = "CONTRACT_VIOLATION";
        status = 502;
      })(),
    );

    const { result } = renderHook(() => useSendTextMessage(), { wrapper });

    result.current.mutate({ conversationId: "conv-1", text: "Hello" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as unknown as { code: string }).code).toBe(
      "CONTRACT_VIOLATION",
    );
  });

  it("invalidates messages query on success", () => {
    expect(source).toContain("queryKeys.conversations.messages(variables.conversationId)");
  });

  it("invalidates conversation list on success", () => {
    expect(source).toContain("queryKeys.conversations.list()");
  });

  it("invalidates conversation detail on success", () => {
    expect(source).toContain("queryKeys.conversations.detail(variables.conversationId)");
  });
});
