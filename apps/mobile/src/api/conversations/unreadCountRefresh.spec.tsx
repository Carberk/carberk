// @vitest-environment happy-dom

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { queryKeys } from "../queryKeys";

import { useDeleteMessage } from "./useDeleteMessage";
import { useSendImageMessage } from "./useSendImageMessage";
import { useSendPostRefMessage } from "./useSendPostRefMessage";
import { useSendTextMessage } from "./useSendTextMessage";
import { useUpdateWatermark } from "./useUpdateWatermark";

const mockPost = vi.fn();
const mockDelete = vi.fn();

vi.mock("../client", () => ({
  apiClient: {
    get: vi.fn(),
    post: (...args: unknown[]) => mockPost(...args),
    patch: vi.fn(),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

const CONVERSATION = "550e8400-e29b-41d4-a716-446655440001";

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate: vi.spyOn(client, "invalidateQueries") };
}

describe("the Messages tab count refreshes where the Conversation list does", () => {
  beforeEach(() => {
    mockPost.mockReset().mockResolvedValue({});
    mockDelete.mockReset().mockResolvedValue({});
  });

  it("after the viewer reads a Conversation", async () => {
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useUpdateWatermark(), { wrapper });

    result.current.mutate({
      conversationId: CONVERSATION,
      lastReadAt: "2026-06-01T12:00:00.000Z",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.conversations.unreadCounts(),
    });
  });

  it("after a text Message is sent", async () => {
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useSendTextMessage(), { wrapper });

    result.current.mutate({ conversationId: CONVERSATION, text: "Hello" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.conversations.unreadCounts(),
    });
  });

  it("after an image Message is sent", async () => {
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useSendImageMessage(), { wrapper });

    result.current.mutate({
      conversationId: CONVERSATION,
      metadata: { key: "chat/a.webp", width: 10, height: 10 },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.conversations.unreadCounts(),
    });
  });

  it("after a Listing card is sent", async () => {
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useSendPostRefMessage(), { wrapper });

    result.current.mutate({ conversationId: CONVERSATION, listingId: "listing-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.conversations.unreadCounts(),
    });
  });

  it("after a Message is deleted", async () => {
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useDeleteMessage(), { wrapper });

    result.current.mutate({ conversationId: CONVERSATION, messageId: "m-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.conversations.unreadCounts(),
    });
  });
});
