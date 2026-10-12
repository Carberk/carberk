// @vitest-environment happy-dom

import { readFileSync } from "fs";
import { resolve } from "path";

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useSendImageMessage } from "./useSendImageMessage";

const source = readFileSync(resolve(__dirname, "./useSendImageMessage.ts"), "utf-8");

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
    kind: "image",
    text: null,
    metadata: { key: "chat-attachments/conv-1/msg-1/original.webp" },
    createdAt: "2026-06-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("useSendImageMessage", () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it("posts rich image message and returns parsed message", async () => {
    mockPost.mockResolvedValue(makeMessageResponse("m1"));

    const { result } = renderHook(() => useSendImageMessage(), { wrapper });

    result.current.mutate({
      conversationId: "conv-1",
      metadata: { key: "chat-attachments/conv-1/msg-1/original.webp", width: 800, height: 600 },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.id).toBe("m1");
    expect(mockPost).toHaveBeenCalledWith(
      "/conversations/conv-1/messages/rich",
      {
        kind: "image",
        metadata: { key: "chat-attachments/conv-1/msg-1/original.webp", width: 800, height: 600 },
      },
      expect.any(Object),
    );
  });

  it("passes clientMessageId when provided", async () => {
    mockPost.mockResolvedValue(makeMessageResponse("m2"));

    const { result } = renderHook(() => useSendImageMessage(), { wrapper });

    result.current.mutate({
      conversationId: "conv-1",
      metadata: { key: "k" },
      clientMessageId: "client-1",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPost).toHaveBeenCalledWith(
      "/conversations/conv-1/messages/rich",
      {
        kind: "image",
        metadata: { key: "k" },
        clientMessageId: "client-1",
      },
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

    const { result } = renderHook(() => useSendImageMessage(), { wrapper });

    result.current.mutate({
      conversationId: "conv-1",
      metadata: { key: "k" },
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as unknown as { code: string }).code).toBe(
      "FORBIDDEN",
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
