// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConversationsSchemas } from "@auto-tm/contracts";

import { loadAuthSession } from "../../auth/session";

import { ConversationSocket } from "./ConversationSocket";

const CONV_ID = "550e8400-e29b-41d4-a716-446655440001";
const MSG_ID = "550e8400-e29b-41d4-a716-446655440002";
const MSG_ID_2 = "550e8400-e29b-41d4-a716-446655440003";
const USER_ID = "550e8400-e29b-41d4-a716-446655440004";

const mockSocket = {
  connected: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn(),
  emit: vi.fn(),
};

const mockIo = vi.fn().mockReturnValue(mockSocket);

vi.mock("socket.io-client", () => ({
  io: (...args: unknown[]) => mockIo(...args),
}));

vi.mock("../../auth/session", () => ({
  loadAuthSession: vi.fn().mockResolvedValue({
    accessToken: "test-token",
  }),
}));

const mockLoadAuthSession = vi.mocked(loadAuthSession);

describe("ConversationSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadAuthSession.mockResolvedValue({
      accessToken: "test-token",
    } as Awaited<ReturnType<typeof loadAuthSession>>);
    mockSocket.connected = false;
    mockSocket.on.mockImplementation((event: string, handler: () => void) => {
      if (event === "connect") {
        mockSocket.connected = true;
        handler();
      }
    });
  });

  it("connects with auth token from session", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    expect(mockIo).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: { token: "test-token" },
        transports: ["websocket"],
      }),
    );
  });

  it("reconnects with the current token when the signed-in user changes", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    mockLoadAuthSession.mockResolvedValue({
      accessToken: "seller-token",
    } as Awaited<ReturnType<typeof loadAuthSession>>);

    await socket.connect();

    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(mockIo).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        auth: { token: "seller-token" },
      }),
    );
  });

  it("can be constructed with explicit token and url", async () => {
    const socket = new ConversationSocket({
      url: "ws://custom/ws/chat",
      token: "custom-token",
    });
    await socket.connect();

    expect(mockIo).toHaveBeenCalledWith(
      "ws://custom/ws/chat",
      expect.objectContaining({
        auth: { token: "custom-token" },
      }),
    );
  });

  it("emits status changes to listeners", async () => {
    const socket = new ConversationSocket();
    const listener = vi.fn();
    socket.subscribeStatus(listener);

    await socket.connect();

    expect(listener).toHaveBeenCalledWith("connecting");
    expect(listener).toHaveBeenCalledWith("connected");
  });

  it("joins a conversation and returns room on success", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (ack: unknown) => void) => {
        callback({
          ok: true,
          conversationId: CONV_ID,
          room: `conversation:${CONV_ID}`,
        });
      },
    );

    const result = await socket.joinConversation(CONV_ID);

    expect(result).toEqual({
      ok: true,
      conversationId: CONV_ID,
      room: `conversation:${CONV_ID}`,
    });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      "conversation:join",
      { conversationId: CONV_ID },
      expect.any(Function),
    );
  });

  it("returns error when join response is a socket error", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (ack: unknown) => void) => {
        callback({ ok: false, code: "FORBIDDEN", message: "No access" });
      },
    );

    const result = await socket.joinConversation(CONV_ID);

    expect(result).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "No access",
    });
  });

  it("sends a text message and returns the durable ack", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    const message = ConversationsSchemas.MessageSummarySchema.parse({
      id: MSG_ID,
      conversationId: CONV_ID,
      senderId: USER_ID,
      kind: "text",
      text: "Hello",
      createdAt: "2026-06-01T12:00:00.000Z",
      clientMessageId: "client-1",
    });

    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (ack: unknown) => void) => {
        callback({ ok: true, message });
      },
    );

    const result = await socket.sendTextMessage({
      conversationId: CONV_ID,
      text: "Hello",
      clientMessageId: "client-1",
    });

    expect(result).toEqual({ ok: true, message });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      "message:send",
      {
        conversationId: CONV_ID,
        kind: "text",
        text: "Hello",
        clientMessageId: "client-1",
      },
      expect.any(Function),
    );
  });

  it("sends an image message and returns the durable ack", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    const message = ConversationsSchemas.MessageSummarySchema.parse({
      id: MSG_ID,
      conversationId: CONV_ID,
      senderId: USER_ID,
      kind: "image",
      text: null,
      metadata: { key: "chat-attachments/conv-1/msg-1/original.webp" },
      createdAt: "2026-06-01T12:00:00.000Z",
      clientMessageId: "client-1",
    });

    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (ack: unknown) => void) => {
        callback({ ok: true, message });
      },
    );

    const metadata = { key: "chat-attachments/conv-1/msg-1/original.webp", width: 800, height: 600 };
    const result = await socket.sendImageMessage({
      conversationId: CONV_ID,
      metadata,
      clientMessageId: "client-1",
    });

    expect(result).toEqual({ ok: true, message });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      "message:send",
      {
        conversationId: CONV_ID,
        kind: "image",
        metadata,
        clientMessageId: "client-1",
      },
      expect.any(Function),
    );
  });

  it("returns NOT_CONNECTED when sending while disconnected", async () => {
    mockSocket.connected = false;
    mockSocket.on.mockImplementation(() => {
      // do not trigger connect
    });

    const socket = new ConversationSocket();
    await socket.connect();

    const result = await socket.sendTextMessage({
      conversationId: CONV_ID,
      text: "Hello",
      clientMessageId: "client-1",
    });

    expect(result).toEqual({
      ok: false,
      code: "NOT_CONNECTED",
      message: "Socket is not connected",
    });
  });

  it("forwards message:new events to listeners", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    const listener = vi.fn();
    socket.subscribeMessage(listener);

    const message = ConversationsSchemas.MessageSummarySchema.parse({
      id: MSG_ID_2,
      conversationId: CONV_ID,
      senderId: USER_ID,
      kind: "text",
      text: "Hi there",
      createdAt: "2026-06-01T12:01:00.000Z",
    });

    const messageHandler = mockSocket.on.mock.calls.find(
      (call) => call[0] === "message:new",
    )?.[1] as (event: unknown) => void;

    messageHandler({ message });

    expect(listener).toHaveBeenCalledWith({ message });
  });

  it("disconnects and resets status", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    socket.disconnect();

    expect(mockSocket.disconnect).toHaveBeenCalled();
    expect(socket.getStatus()).toBe("idle");
  });

  it("emits message:delivered and returns ack", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (ack: unknown) => void) => {
        callback({ ok: true, conversationId: CONV_ID });
      },
    );

    const result = await socket.markDelivered(CONV_ID, "2026-06-01T12:00:00.000Z");

    expect(result).toEqual({ ok: true, conversationId: CONV_ID });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      "message:delivered",
      { conversationId: CONV_ID, lastDeliveredAt: "2026-06-01T12:00:00.000Z" },
      expect.any(Function),
    );
  });

  it("emits conversation:read and returns ack", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (ack: unknown) => void) => {
        callback({ ok: true, conversationId: CONV_ID });
      },
    );

    const result = await socket.markConversationRead(
      CONV_ID,
      "2026-06-01T12:00:00.000Z",
    );

    expect(result).toEqual({ ok: true, conversationId: CONV_ID });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      "conversation:read",
      { conversationId: CONV_ID, lastReadAt: "2026-06-01T12:00:00.000Z" },
      expect.any(Function),
    );
  });

  it("forwards watermark events to listeners", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    const listener = vi.fn();
    socket.subscribeWatermark(listener);

    const watermarkHandler = mockSocket.on.mock.calls.find(
      (call) => call[0] === "watermark",
    )?.[1] as (event: unknown) => void;

    const event = {
      conversationId: CONV_ID,
      userId: USER_ID,
      lastReadAt: "2026-06-01T12:00:00.000Z",
    };
    watermarkHandler(event);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it("returns NOT_CONNECTED when marking delivered while disconnected", async () => {
    mockSocket.connected = false;
    mockSocket.on.mockImplementation(() => {
      // do not trigger connect
    });

    const socket = new ConversationSocket();
    await socket.connect();

    const result = await socket.markDelivered(CONV_ID);

    expect(result).toEqual({
      ok: false,
      code: "NOT_CONNECTED",
      message: "Socket is not connected",
    });
  });

  it("deletes a message and returns the durable ack", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (ack: unknown) => void) => {
        callback({
          ok: true,
          messageId: MSG_ID,
          conversationId: CONV_ID,
          deletedAt: "2026-06-01T12:05:00.000Z",
        });
      },
    );

    const result = await socket.deleteMessage({
      conversationId: CONV_ID,
      messageId: MSG_ID,
    });

    expect(result).toEqual({
      ok: true,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      deletedAt: "2026-06-01T12:05:00.000Z",
    });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      "message:delete",
      {
        conversationId: CONV_ID,
        messageId: MSG_ID,
      },
      expect.any(Function),
    );
  });

  it("returns NOT_CONNECTED when deleting while disconnected", async () => {
    mockSocket.connected = false;
    mockSocket.on.mockImplementation(() => {
      // do not trigger connect
    });

    const socket = new ConversationSocket();
    await socket.connect();

    const result = await socket.deleteMessage({
      conversationId: CONV_ID,
      messageId: MSG_ID,
    });

    expect(result).toEqual({
      ok: false,
      code: "NOT_CONNECTED",
      message: "Socket is not connected",
    });
  });

  it("forwards message:deleted events to listeners", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    const listener = vi.fn();
    socket.subscribeDeletedMessage(listener);

    const deletedHandler = mockSocket.on.mock.calls.find(
      (call) => call[0] === "message:deleted",
    )?.[1] as (event: unknown) => void;

    const event = {
      messageId: MSG_ID,
      conversationId: CONV_ID,
      deletedAt: "2026-06-01T12:05:00.000Z",
    };

    deletedHandler(event);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it("emits typing:start and returns ack", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (ack: unknown) => void) => {
        callback({ ok: true, conversationId: CONV_ID });
      },
    );

    const result = await socket.sendTypingStart(CONV_ID);

    expect(result).toEqual({ ok: true, conversationId: CONV_ID });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      "typing:start",
      { conversationId: CONV_ID },
      expect.any(Function),
    );
  });

  it("emits typing:stop and returns ack", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (ack: unknown) => void) => {
        callback({ ok: true, conversationId: CONV_ID });
      },
    );

    const result = await socket.sendTypingStop(CONV_ID);

    expect(result).toEqual({ ok: true, conversationId: CONV_ID });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      "typing:stop",
      { conversationId: CONV_ID },
      expect.any(Function),
    );
  });

  it("returns NOT_CONNECTED when sending typing event while disconnected", async () => {
    mockSocket.connected = false;
    mockSocket.on.mockImplementation(() => {
      // do not trigger connect
    });

    const socket = new ConversationSocket();
    await socket.connect();

    const result = await socket.sendTypingStart(CONV_ID);

    expect(result).toEqual({
      ok: false,
      code: "NOT_CONNECTED",
      message: "Socket is not connected",
    });
  });

  it("forwards typing:peer events to listeners", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    const listener = vi.fn();
    socket.subscribeTyping(listener);

    const typingHandler = mockSocket.on.mock.calls.find(
      (call) => call[0] === "typing:peer",
    )?.[1] as (event: unknown) => void;

    const event = {
      conversationId: CONV_ID,
      userId: USER_ID,
      isTyping: true,
    };

    typingHandler(event);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it("ignores malformed typing:peer events", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    const listener = vi.fn();
    socket.subscribeTyping(listener);

    const typingHandler = mockSocket.on.mock.calls.find(
      (call) => call[0] === "typing:peer",
    )?.[1] as (event: unknown) => void;

    typingHandler({ invalid: true });

    expect(listener).not.toHaveBeenCalled();
  });

  it("forwards presence events to listeners", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    const listener = vi.fn();
    socket.subscribePresence(listener);

    const presenceHandler = mockSocket.on.mock.calls.find(
      (call) => call[0] === "presence",
    )?.[1] as (event: unknown) => void;

    const event = {
      conversationId: CONV_ID,
      userId: USER_ID,
      online: true,
    };

    presenceHandler(event);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it("ignores malformed presence events", async () => {
    const socket = new ConversationSocket();
    await socket.connect();

    const listener = vi.fn();
    socket.subscribePresence(listener);

    const presenceHandler = mockSocket.on.mock.calls.find(
      (call) => call[0] === "presence",
    )?.[1] as (event: unknown) => void;

    presenceHandler({ online: "yes" });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("Concurrent room joins", () => {
  it("shares one pending join acknowledgement between reconnect and screen ownership", async () => {
    const socket = new ConversationSocket({ token: "test-token" });
    await socket.connect();
    mockSocket.emit.mockReset();
    let acknowledge: ((ack: unknown) => void) | undefined;
    mockSocket.emit.mockImplementation((_event, _payload, callback) => { acknowledge = callback; });
    const reconnectJoin = socket.joinConversation(CONV_ID);
    const screenJoin = socket.joinConversation(CONV_ID);
    expect(mockSocket.emit).toHaveBeenCalledTimes(1);
    acknowledge?.({ ok: true, conversationId: CONV_ID, room: `conversation:${CONV_ID}` });
    expect((await reconnectJoin).ok).toBe(true);
    expect((await screenJoin).ok).toBe(true);
  });
});

describe("Shared room lifecycle while acknowledgements are delayed", () => {
  async function connectedSocket() {
    mockSocket.connected = false;
    mockSocket.emit.mockReset();
    const handlers = new Map<string, () => void>();
    mockSocket.on.mockImplementation((event, handler) => { handlers.set(event, handler); });
    const socket = new ConversationSocket({ token: "test-token" });
    await socket.connect();
    mockSocket.connected = true;
    handlers.get("connect")?.();
    return { socket, handlers };
  }
  it("does not automatically rejoin a room left while disconnected", async () => {
    const { socket, handlers } = await connectedSocket();
    mockSocket.emit.mockImplementation((event, _payload, callback) => { if (event === "conversation:join") callback({ ok: true, conversationId: CONV_ID, room: `conversation:${CONV_ID}` }); });
    await socket.joinConversation(CONV_ID);
    mockSocket.connected = false;
    handlers.get("disconnect")?.();
    await socket.leaveConversation(CONV_ID);
    mockSocket.emit.mockClear();
    mockSocket.connected = true;
    handlers.get("connect")?.();
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
  it("creates a fresh join after leaving a room whose acknowledgement is still pending", async () => {
    const { socket } = await connectedSocket();
    const callbacks: ((ack: unknown) => void)[] = [];
    mockSocket.emit.mockImplementation((event, _payload, callback) => { if (event === "conversation:join") callbacks.push(callback); });
    const first = socket.joinConversation(CONV_ID);
    await socket.leaveConversation(CONV_ID);
    const reopened = socket.joinConversation(CONV_ID);
    expect(callbacks).toHaveLength(2);
    const ack = { ok: true, conversationId: CONV_ID, room: `conversation:${CONV_ID}` };
    callbacks.forEach((callback) => callback(ack));
    await Promise.all([first, reopened]);
  });
  it("a late A acknowledgement cannot replace B as the reconnect room", async () => {
    const { socket, handlers } = await connectedSocket();
    const callbacks = new Map<string, (ack: unknown) => void>();
    mockSocket.emit.mockImplementation((event, payload, callback) => { if (event === "conversation:join") callbacks.set(payload.conversationId, callback); });
    const first = socket.joinConversation(CONV_ID);
    await socket.leaveConversation(CONV_ID);
    const second = socket.joinConversation(MSG_ID_2);
    callbacks.get(MSG_ID_2)?.({ ok: true, conversationId: MSG_ID_2, room: `conversation:${MSG_ID_2}` });
    await second;
    callbacks.get(CONV_ID)?.({ ok: true, conversationId: CONV_ID, room: `conversation:${CONV_ID}` });
    await first;
    mockSocket.connected = false;
    handlers.get("disconnect")?.();
    mockSocket.emit.mockClear();
    mockSocket.connected = true;
    handlers.get("connect")?.();
    expect(mockSocket.emit).toHaveBeenCalledWith("conversation:join", { conversationId: MSG_ID_2 }, expect.any(Function));
  });
});
