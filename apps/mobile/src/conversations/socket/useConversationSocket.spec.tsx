// @vitest-environment happy-dom

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { cacheAcknowledgedMessage } from "../../api/conversations/useConversationMessages";
import { queryKeys } from "../../api/queryKeys";

const CONV_ID = "550e8400-e29b-41d4-a716-446655440001";
const MSG_ID = "550e8400-e29b-41d4-a716-446655440002";
const USER_ID = "550e8400-e29b-41d4-a716-446655440003";

const mockSocket = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  joinConversation: vi.fn(),
  leaveConversation: vi.fn(),
  sendTextMessage: vi.fn(),
  sendImageMessage: vi.fn(),
  sendTypingStart: vi.fn(),
  sendTypingStop: vi.fn(),
  markDelivered: vi.fn(),
  markRead: vi.fn(),
  markConversationRead: vi.fn(),
  deleteMessage: vi.fn(),
  subscribeStatus: vi.fn().mockReturnValue(() => {}),
  subscribeMessage: vi.fn().mockReturnValue(() => {}),
  subscribeWatermark: vi.fn().mockReturnValue(() => {}),
  subscribeDeletedMessage: vi.fn().mockReturnValue(() => {}),
  subscribeTyping: vi.fn().mockReturnValue(() => {}),
  subscribePresence: vi.fn().mockReturnValue(() => {}),
  getStatus: vi.fn().mockReturnValue("idle"),
  isConnected: vi.fn().mockReturnValue(false),
};

vi.mock("./ConversationSocket", () => ({
  ConversationSocket: vi.fn().mockImplementation(() => mockSocket),
  getSharedConversationSocket: () => mockSocket,
}));

import { useConversationSocket } from "./useConversationSocket";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useConversationSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.getStatus.mockReturnValue("idle");
    mockSocket.connect.mockResolvedValue(undefined);
    mockSocket.joinConversation.mockResolvedValue({ ok: true, conversationId: CONV_ID, room: `conversation:${CONV_ID}` });
    mockSocket.subscribeStatus.mockReturnValue(() => {});
  });

  it("connects and joins the conversation room", async () => {
    mockSocket.joinConversation.mockResolvedValue({
      ok: true,
      room: "conversation:conv-1",
    });

    renderHook(() => useConversationSocket(CONV_ID), { wrapper });

    await waitFor(() => expect(mockSocket.connect).toHaveBeenCalled());
  });

  it("provides a sendTextMessage function that delegates to the socket", async () => {
    mockSocket.sendTextMessage.mockResolvedValue({
      ok: true,
      message: {
        id: MSG_ID,
        conversationId: CONV_ID,
        senderId: USER_ID,
        kind: "text",
        text: "Hello",
        createdAt: "2026-06-01T12:00:00.000Z",
        clientMessageId: "client-1",
      },
    });

    const { result } = renderHook(
      () => useConversationSocket(CONV_ID),
      { wrapper },
    );

    const response = await result.current.sendTextMessage({
      conversationId: CONV_ID,
      text: "Hello",
      clientMessageId: "client-1",
    });

    expect(mockSocket.sendTextMessage).toHaveBeenCalledWith({
      conversationId: CONV_ID,
      text: "Hello",
      clientMessageId: "client-1",
    });
    expect(response.ok).toBe(true);
  });

  it("provides a sendImageMessage function that delegates to the socket", async () => {
    mockSocket.sendImageMessage.mockResolvedValue({
      ok: true,
      message: {
        id: MSG_ID,
        conversationId: CONV_ID,
        senderId: USER_ID,
        kind: "image",
        text: null,
        metadata: { key: "chat-attachments/conv-1/msg-1/original.webp" },
        createdAt: "2026-06-01T12:00:00.000Z",
        clientMessageId: "client-1",
      },
    });

    const { result } = renderHook(
      () => useConversationSocket(CONV_ID),
      { wrapper },
    );

    const metadata = { key: "chat-attachments/conv-1/msg-1/original.webp", width: 800, height: 600 };
    const response = await result.current.sendImageMessage({
      conversationId: CONV_ID,
      metadata,
      clientMessageId: "client-1",
    });

    expect(mockSocket.sendImageMessage).toHaveBeenCalledWith({
      conversationId: CONV_ID,
      metadata,
      clientMessageId: "client-1",
    });
    expect(response.ok).toBe(true);
  });

  it("patches the messages query cache on message:new without duplicates", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const customWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    client.setQueryData(queryKeys.conversations.messages(CONV_ID), {
      pages: [
        {
          items: [
            {
              id: MSG_ID,
              conversationId: CONV_ID,
              senderId: USER_ID,
              kind: "text",
              text: "Existing",
              createdAt: "2026-06-01T11:00:00.000Z",
            },
          ],
          nextCursor: null,
        },
      ],
      pageParams: [null],
    });

    let messageHandler: (event: unknown) => void = () => {};
    mockSocket.subscribeMessage.mockImplementation((handler) => {
      messageHandler = handler;
      return () => {};
    });

    renderHook(() => useConversationSocket(CONV_ID), {
      wrapper: customWrapper,
    });

    const newMessage = {
      id: "550e8400-e29b-41d4-a716-446655440004",
      conversationId: CONV_ID,
      senderId: USER_ID,
      kind: "text",
      text: "New message",
      createdAt: "2026-06-01T12:00:00.000Z",
    };

    messageHandler({ message: newMessage });

    await waitFor(() => {
      const data = client.getQueryData<{
        pages: Array<{ items: unknown[]; nextCursor: string | null }>;
      }>(queryKeys.conversations.messages(CONV_ID));
      expect(data?.pages[0]?.items).toHaveLength(2);
      expect(data?.pages[0]?.items[0]).toMatchObject(newMessage);
    });

    // Duplicate event should not add another row.
    messageHandler({ message: newMessage });

    const data = client.getQueryData<{
      pages: Array<{ items: unknown[]; nextCursor: string | null }>;
    }>(queryKeys.conversations.messages(CONV_ID));
    expect(data?.pages[0]?.items).toHaveLength(2);
  });

  it("invalidates messages query on reconnect", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const customWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const invalidateQueriesSpy = vi.spyOn(client, "invalidateQueries");

    let statusHandler: (status: string) => void = () => {};
    mockSocket.subscribeStatus.mockImplementation((handler) => {
      statusHandler = handler as (status: string) => void;
      return () => {};
    });
    mockSocket.getStatus.mockReturnValue("disconnected");

    renderHook(() => useConversationSocket(CONV_ID), {
      wrapper: customWrapper,
    });

    act(() => {
      statusHandler("disconnected");
      statusHandler("connected");
    });

    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.conversations.messages(CONV_ID),
      });
    });
  });

  it("invalidates messages query when recovery passes through an error status", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const customWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const invalidateQueriesSpy = vi.spyOn(client, "invalidateQueries");

    let statusHandler: (status: string) => void = () => {};
    mockSocket.subscribeStatus.mockImplementation((handler) => {
      statusHandler = handler as (status: string) => void;
      return () => {};
    });
    mockSocket.getStatus.mockReturnValue("connected");

    renderHook(() => useConversationSocket(CONV_ID), {
      wrapper: customWrapper,
    });

    // A failed reconnection attempt reports "error" (connect_error); the
    // successful retry after it is still a recovery and must reconcile.
    act(() => {
      statusHandler("disconnected");
      statusHandler("error");
      statusHandler("connected");
    });

    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.conversations.messages(CONV_ID),
      });
    });
  });

  it("provides markDelivered and markRead functions that delegate to the socket", async () => {
    mockSocket.markDelivered.mockResolvedValue({
      ok: true,
      conversationId: CONV_ID,
    });
    mockSocket.markConversationRead.mockResolvedValue({
      ok: true,
      conversationId: CONV_ID,
    });

    const { result } = renderHook(
      () => useConversationSocket(CONV_ID),
      { wrapper },
    );

    const deliveredResponse = await result.current.markDelivered(CONV_ID);
    expect(mockSocket.markDelivered).toHaveBeenCalledWith(
      CONV_ID,
      expect.any(String),
    );
    expect(deliveredResponse.ok).toBe(true);

    const readResponse = await result.current.markRead(CONV_ID);
    expect(mockSocket.markConversationRead).toHaveBeenCalledWith(
      CONV_ID,
      expect.any(String),
    );
    expect(readResponse.ok).toBe(true);
  });

  it("marks peer messages delivered automatically when currentUserId is provided", async () => {
    let messageHandler: (event: unknown) => void = () => {};
    mockSocket.subscribeMessage.mockImplementation((handler) => {
      messageHandler = handler;
      return () => {};
    });

    renderHook(() => useConversationSocket(CONV_ID, USER_ID), {
      wrapper,
    });

    messageHandler({
      message: {
        id: MSG_ID,
        conversationId: CONV_ID,
        senderId: "peer-user",
        kind: "text",
        text: "Hi",
        createdAt: "2026-06-01T12:00:00.000Z",
      },
    });

    await waitFor(() => {
      expect(mockSocket.markDelivered).toHaveBeenCalledWith(
        CONV_ID,
        expect.any(String),
      );
    });
  });

  it("does not auto-mark delivered for own messages", async () => {
    let messageHandler: (event: unknown) => void = () => {};
    mockSocket.subscribeMessage.mockImplementation((handler) => {
      messageHandler = handler;
      return () => {};
    });

    renderHook(() => useConversationSocket(CONV_ID, USER_ID), {
      wrapper,
    });

    messageHandler({
      message: {
        id: MSG_ID,
        conversationId: CONV_ID,
        senderId: USER_ID,
        kind: "text",
        text: "Hi",
        createdAt: "2026-06-01T12:00:00.000Z",
      },
    });

    await waitFor(() => {
      expect(mockSocket.markDelivered).not.toHaveBeenCalled();
    });
  });

  it("invalidates conversation list and detail on watermark events", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const customWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const invalidateQueriesSpy = vi.spyOn(client, "invalidateQueries");

    let watermarkHandler: (event: unknown) => void = () => {};
    mockSocket.subscribeWatermark.mockImplementation((handler) => {
      watermarkHandler = handler;
      return () => {};
    });

    renderHook(() => useConversationSocket(CONV_ID), {
      wrapper: customWrapper,
    });

    watermarkHandler({
      conversationId: CONV_ID,
      userId: "peer-user",
      lastReadAt: "2026-06-01T12:00:00.000Z",
    });

    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.conversations.list(),
      });
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.conversations.detail(CONV_ID),
      });
    });
  });

  it("invalidates the by-ID Conversation on new and deleted Message events", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const customWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const invalidateQueriesSpy = vi.spyOn(client, "invalidateQueries");

    let messageHandler: (event: unknown) => void = () => {};
    let deletedHandler: (event: unknown) => void = () => {};
    mockSocket.subscribeMessage.mockImplementation((handler) => {
      messageHandler = handler;
      return () => {};
    });
    mockSocket.subscribeDeletedMessage.mockImplementation((handler) => {
      deletedHandler = handler;
      return () => {};
    });

    renderHook(() => useConversationSocket(CONV_ID, USER_ID), {
      wrapper: customWrapper,
    });

    messageHandler({
      message: {
        id: MSG_ID,
        conversationId: CONV_ID,
        senderId: USER_ID,
        kind: "text",
        text: "Hi",
        createdAt: "2026-06-01T12:00:00.000Z",
      },
    });
    await waitFor(() =>
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.conversations.detail(CONV_ID),
      }),
    );

    invalidateQueriesSpy.mockClear();
    deletedHandler({
      messageId: MSG_ID,
      conversationId: CONV_ID,
      deletedAt: "2026-06-01T12:05:00.000Z",
    });
    await waitFor(() =>
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.conversations.detail(CONV_ID),
      }),
    );
  });

  it("refreshes the Messages tab count on new, deleted and watermark events", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const customWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const invalidateQueriesSpy = vi.spyOn(client, "invalidateQueries");

    let messageHandler: (event: unknown) => void = () => {};
    let deletedHandler: (event: unknown) => void = () => {};
    let watermarkHandler: (event: unknown) => void = () => {};
    mockSocket.subscribeMessage.mockImplementation((handler) => {
      messageHandler = handler;
      return () => {};
    });
    mockSocket.subscribeDeletedMessage.mockImplementation((handler) => {
      deletedHandler = handler;
      return () => {};
    });
    mockSocket.subscribeWatermark.mockImplementation((handler) => {
      watermarkHandler = handler;
      return () => {};
    });

    renderHook(() => useConversationSocket(CONV_ID, USER_ID), {
      wrapper: customWrapper,
    });

    const unreadCounts = { queryKey: queryKeys.conversations.unreadCounts() };

    messageHandler({
      message: {
        id: MSG_ID,
        conversationId: CONV_ID,
        senderId: "peer-user",
        kind: "text",
        text: "Hi",
        createdAt: "2026-06-01T12:00:00.000Z",
      },
    });
    await waitFor(() => expect(invalidateQueriesSpy).toHaveBeenCalledWith(unreadCounts));

    invalidateQueriesSpy.mockClear();
    deletedHandler({
      messageId: MSG_ID,
      conversationId: CONV_ID,
      deletedAt: "2026-06-01T12:05:00.000Z",
    });
    await waitFor(() => expect(invalidateQueriesSpy).toHaveBeenCalledWith(unreadCounts));

    invalidateQueriesSpy.mockClear();
    watermarkHandler({
      conversationId: CONV_ID,
      userId: USER_ID,
      lastReadAt: "2026-06-01T12:06:00.000Z",
    });
    await waitFor(() => expect(invalidateQueriesSpy).toHaveBeenCalledWith(unreadCounts));
  });

  it("provides a deleteMessage function that delegates to the socket", async () => {
    mockSocket.deleteMessage.mockResolvedValue({
      ok: true,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      deletedAt: "2026-06-01T12:05:00.000Z",
    });

    const { result } = renderHook(
      () => useConversationSocket(CONV_ID),
      { wrapper },
    );

    const response = await result.current.deleteMessage({
      conversationId: CONV_ID,
      messageId: MSG_ID,
    });

    expect(mockSocket.deleteMessage).toHaveBeenCalledWith({
      conversationId: CONV_ID,
      messageId: MSG_ID,
    });
    expect(response.ok).toBe(true);
  });

  it("patches the messages query cache on message:deleted", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const customWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    client.setQueryData(queryKeys.conversations.messages(CONV_ID), {
      pages: [
        {
          items: [
            {
              id: MSG_ID,
              conversationId: CONV_ID,
              senderId: USER_ID,
              kind: "text",
              text: "Existing",
              createdAt: "2026-06-01T11:00:00.000Z",
            },
          ],
          nextCursor: null,
        },
      ],
      pageParams: [null],
    });

    let deletedHandler: (event: unknown) => void = () => {};
    mockSocket.subscribeDeletedMessage.mockImplementation((handler) => {
      deletedHandler = handler;
      return () => {};
    });

    renderHook(() => useConversationSocket(CONV_ID), {
      wrapper: customWrapper,
    });

    deletedHandler({
      messageId: MSG_ID,
      conversationId: CONV_ID,
      deletedAt: "2026-06-01T12:05:00.000Z",
    });

    await waitFor(() => {
      const data = client.getQueryData<{
        pages: Array<{ items: unknown[]; nextCursor: string | null }>;
      }>(queryKeys.conversations.messages(CONV_ID));
      const item = data?.pages[0]?.items[0] as {
        deletedAt?: string;
        text?: string | null;
        metadata?: unknown;
      };
      expect(item?.deletedAt).toBe("2026-06-01T12:05:00.000Z");
      expect(item?.text).toBeNull();
      expect(item?.metadata).toBeUndefined();
    });
  });

  describe("typing", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("sends typing:start on first signal and debounces typing:stop", async () => {
      mockSocket.joinConversation.mockResolvedValue({
        ok: true,
        room: "conversation:conv-1",
      });
      mockSocket.getStatus.mockReturnValue("connected");

      const { result } = renderHook(
        () => useConversationSocket(CONV_ID, USER_ID),
        { wrapper },
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(mockSocket.joinConversation).toHaveBeenCalledWith(CONV_ID);

      act(() => {
        result.current.signalTyping();
      });

      expect(mockSocket.sendTypingStart).toHaveBeenCalledWith(CONV_ID);
      expect(mockSocket.sendTypingStop).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(mockSocket.sendTypingStop).toHaveBeenCalledWith(CONV_ID);
    });

    it("resets the stop timer on repeated typing signals", async () => {
      mockSocket.joinConversation.mockResolvedValue({
        ok: true,
        room: "conversation:conv-1",
      });
      mockSocket.getStatus.mockReturnValue("connected");

      const { result } = renderHook(
        () => useConversationSocket(CONV_ID, USER_ID),
        { wrapper },
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(mockSocket.joinConversation).toHaveBeenCalledWith(CONV_ID);

      act(() => {
        result.current.signalTyping();
      });

      act(() => {
        vi.advanceTimersByTime(2000);
        result.current.signalTyping();
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(mockSocket.sendTypingStop).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(mockSocket.sendTypingStop).toHaveBeenCalledWith(CONV_ID);
    });

    it("sends typing:stop immediately when stopTyping is called", async () => {
      mockSocket.joinConversation.mockResolvedValue({
        ok: true,
        room: "conversation:conv-1",
      });
      mockSocket.getStatus.mockReturnValue("connected");

      const { result } = renderHook(
        () => useConversationSocket(CONV_ID, USER_ID),
        { wrapper },
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(mockSocket.joinConversation).toHaveBeenCalledWith(CONV_ID);

      act(() => {
        result.current.signalTyping();
      });

      act(() => {
        result.current.stopTyping();
      });

      expect(mockSocket.sendTypingStop).toHaveBeenCalledWith(CONV_ID);

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(mockSocket.sendTypingStop).toHaveBeenCalledTimes(1);
    });

    it("reflects peer typing state from typing:peer events", async () => {
      let typingHandler: (event: unknown) => void = () => {};
      mockSocket.subscribeTyping.mockImplementation((handler) => {
        typingHandler = handler;
        return () => {};
      });

      const { result } = renderHook(
        () => useConversationSocket(CONV_ID, USER_ID),
        { wrapper },
      );

      act(() => {
        typingHandler({
          conversationId: CONV_ID,
          userId: "peer-user",
          isTyping: true,
        });
      });

      expect(result.current.peerTyping).toBe(true);

      act(() => {
        typingHandler({
          conversationId: CONV_ID,
          userId: "peer-user",
          isTyping: false,
        });
      });

      expect(result.current.peerTyping).toBe(false);
    });
  });

  it("reflects peer presence state from presence events", async () => {
    let presenceHandler: (event: unknown) => void = () => {};
    mockSocket.subscribePresence.mockImplementation((handler) => {
      presenceHandler = handler;
      return () => {};
    });

    const { result } = renderHook(
      () => useConversationSocket(CONV_ID, USER_ID),
      { wrapper },
    );

    act(() => {
      presenceHandler({
        conversationId: CONV_ID,
        userId: "peer-user",
        online: false,
        lastSeenAt: "2026-06-01T12:00:00.000Z",
      });
    });

    expect(result.current.peerPresence).toEqual({
      userId: "peer-user",
      online: false,
      lastSeenAt: "2026-06-01T12:00:00.000Z",
    });
  });

  it("ignores typing and presence events for other conversations", async () => {
    let typingHandler: (event: unknown) => void = () => {};
    mockSocket.subscribeTyping.mockImplementation((handler) => {
      typingHandler = handler;
      return () => {};
    });

    let presenceHandler: (event: unknown) => void = () => {};
    mockSocket.subscribePresence.mockImplementation((handler) => {
      presenceHandler = handler;
      return () => {};
    });

    const { result } = renderHook(
      () => useConversationSocket(CONV_ID, USER_ID),
      { wrapper },
    );

    act(() => {
      typingHandler({
        conversationId: "other-conversation",
        userId: "peer-user",
        isTyping: true,
      });
      presenceHandler({
        conversationId: "other-conversation",
        userId: "peer-user",
        online: true,
      });
    });

    expect(result.current.peerTyping).toBe(false);
    expect(result.current.peerPresence.online).toBe(false);
  });
});

describe("Shared connected socket room membership", () => {
  const secondId = "550e8400-e29b-41d4-a716-446655440010";
  it.each([false, true])("receives a live Message on a connected mount, after previous leave=%s", async (afterLeave) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const customWrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const rooms = new Set<string>();
    const statuses = new Set<(status: string) => void>();
    const messages = new Set<(event: unknown) => void>();
    let status = afterLeave ? "idle" : "connected";
    mockSocket.connect.mockResolvedValue(undefined);
    mockSocket.getStatus.mockImplementation(() => status);
    // Like ConversationSocket.subscribeStatus: subscribe only, no replay.
    mockSocket.subscribeStatus.mockImplementation((handler) => { statuses.add(handler); return () => statuses.delete(handler); });
    mockSocket.subscribeMessage.mockImplementation((handler) => { messages.add(handler); return () => messages.delete(handler); });
    mockSocket.joinConversation.mockImplementation(async (id) => {
      rooms.add(id);
      return { ok: true, conversationId: id, room: `conversation:${id}` };
    });
    mockSocket.leaveConversation.mockImplementation(async (id) => { rooms.delete(id); });
    const broadcast = (id: string) => {
      // The gateway's server.to(room).emit delivers only to joined sockets.
      if (rooms.has(id)) messages.forEach((listener) => listener({ message: {
        id: MSG_ID, conversationId: id, senderId: "peer-user", kind: "text", text: "Live in the current room", createdAt: "2026-10-08T10:00:00.000Z",
      } }));
    };
    client.setQueryData(queryKeys.conversations.messages(secondId), { pages: [{ items: [], nextCursor: null }], pageParams: [null] });
    if (afterLeave) {
      const first = renderHook(() => useConversationSocket(CONV_ID, USER_ID), { wrapper: customWrapper });
      await act(async () => { status = "connected"; statuses.forEach((handler) => handler(status)); });
      expect(rooms.has(CONV_ID)).toBe(true);
      first.unmount();
      expect(rooms.has(CONV_ID)).toBe(false);
      expect(status).toBe("connected");
    }
    const second = renderHook(() => useConversationSocket(secondId, USER_ID), { wrapper: customWrapper });
    await act(async () => { await Promise.resolve(); });
    act(() => broadcast(secondId));
    expect(client.getQueryData<{ pages: { items: { text: string }[] }[] }>(queryKeys.conversations.messages(secondId))?.pages[0]?.items[0]?.text).toBe("Live in the current room");
    // Rooms are lost on disconnect, so a later connect must join again.
    await act(async () => { status = "disconnected"; rooms.clear(); statuses.forEach((handler) => handler(status)); });
    await act(async () => { status = "connected"; statuses.forEach((handler) => handler(status)); });
    expect(rooms.has(secondId)).toBe(true);
    second.unmount();
    expect(rooms.has(secondId)).toBe(false);
    client.clear();
  });
});

describe("Acknowledgement followed by room echo", () => {
  it("keeps one authoritative Message when message:new arrives after the acknowledgement", async () => {
    const client = new QueryClient();
    const message = { id: MSG_ID, conversationId: CONV_ID, senderId: USER_ID, kind: "text" as const, text: "Durable once", createdAt: "2026-10-08T12:00:00.000Z", clientMessageId: "client-ack" };
    client.setQueryData(queryKeys.conversations.messages(CONV_ID), { pages: [{ items: [], nextCursor: null }], pageParams: [null] });
    cacheAcknowledgedMessage(client, message);
    let receive: ((event: unknown) => void) | undefined;
    mockSocket.subscribeMessage.mockImplementation((handler) => { receive = handler; return () => {}; });
    mockSocket.getStatus.mockReturnValue("idle");
    const customWrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useConversationSocket(CONV_ID, USER_ID), { wrapper: customWrapper });
    act(() => receive?.({ message }));
    expect(client.getQueryData<{ pages: { items: unknown[] }[] }>(queryKeys.conversations.messages(CONV_ID))?.pages.flatMap((page) => page.items)).toEqual([message]);
    hook.unmount();
    client.clear();
  });
});
