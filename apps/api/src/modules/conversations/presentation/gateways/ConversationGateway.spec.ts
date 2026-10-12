import { describe, it, expect, vi } from "vitest";
import type { Server, Socket } from "socket.io";

import {
  conversationRoom,
  userRoom,
} from "../../../realtime/infrastructure/realtime.config";
import type { AuthenticatedSocketUser } from "../../../realtime/infrastructure/SocketAuthMiddleware";
import type { PresencePort } from "../../../realtime/domain/ports/PresencePort";
import { Conversation } from "../../domain/Conversation";
import { Message } from "../../domain/Message";
import { CONVERSATION_SOCKET_ERROR_CODES } from "../../domain/types";
import type { ValidateConversationAccess } from "../../application/ValidateConversationAccess";
import type { SendRealtimeMessage } from "../../application/SendRealtimeMessage";
import type { UpdateWatermark, UpdateWatermarkResult } from "../../application/UpdateWatermark";
import type { DeleteMessage } from "../../application/DeleteMessage";
import type { MessageSentEvent } from "../../domain/ports/MessageEventPublisher";

import { ConversationGateway } from "./ConversationGateway";

function buildSocket(overrides: {
  id?: string;
  user?: AuthenticatedSocketUser | null;
  rooms?: Set<string>;
} = {}): Socket {
  const rooms = overrides.rooms ?? new Set<string>();
  const toMock = vi.fn().mockReturnValue({ emit: vi.fn() });
  return {
    id: overrides.id ?? "socket-1",
    data: overrides.user === null ? {} : { user: overrides.user ?? { sub: "user-1", sid: "sid-1", phone: "+993", role: "user" } },
    join: vi.fn(async (room: string) => {
      rooms.add(room);
    }),
    leave: vi.fn(async (room: string) => {
      rooms.delete(room);
    }),
    to: toMock,
    emit: vi.fn(),
    rooms,
  } as unknown as Socket;
}

function buildValidateAccess(
  overrides: Partial<ValidateConversationAccess> = {},
): ValidateConversationAccess {
  return {
    execute: vi.fn(),
    ...overrides,
  } as unknown as ValidateConversationAccess;
}

function buildSendMessage(
  overrides: Partial<SendRealtimeMessage> = {},
): SendRealtimeMessage {
  return {
    execute: vi.fn(),
    ...overrides,
  } as unknown as SendRealtimeMessage;
}

function buildUpdateWatermark(
  overrides: Partial<UpdateWatermark> = {},
): UpdateWatermark {
  return {
    execute: vi.fn(),
    ...overrides,
  } as unknown as UpdateWatermark;
}

function buildDeleteMessage(
  overrides: Partial<DeleteMessage> = {},
): DeleteMessage {
  return {
    execute: vi.fn(),
    ...overrides,
  } as unknown as DeleteMessage;
}

function buildPresencePort(
  overrides: Partial<PresencePort> = {},
): PresencePort {
  return {
    isUserOnline: vi.fn().mockReturnValue(false),
    getSocketCountForUser: vi.fn().mockReturnValue(0),
    getOnlineUserCount: vi.fn().mockReturnValue(0),
    getLastSeenAt: vi.fn().mockReturnValue(undefined),
    ...overrides,
  } as unknown as PresencePort;
}

function buildServer(): Server {
  return {
    to: vi.fn(() => ({
      emit: vi.fn(),
    })),
  } as unknown as Server;
}

function buildGateway(
  validateAccess?: ValidateConversationAccess,
  sendMessage?: SendRealtimeMessage,
  updateWatermark?: UpdateWatermark,
  deleteMessage?: DeleteMessage,
  presence?: PresencePort,
): {
  gateway: ConversationGateway;
  validateAccess: ValidateConversationAccess;
  sendMessage: SendRealtimeMessage;
  updateWatermark: UpdateWatermark;
  deleteMessage: DeleteMessage;
  presence: PresencePort;
} {
  const access = validateAccess ?? buildValidateAccess();
  const send = sendMessage ?? buildSendMessage();
  const watermark = updateWatermark ?? buildUpdateWatermark();
  const del = deleteMessage ?? buildDeleteMessage();
  const pres = presence ?? buildPresencePort();
  const gateway = new ConversationGateway(access, send, watermark, del, pres);
  return { gateway, validateAccess: access, sendMessage: send, updateWatermark: watermark, deleteMessage: del, presence: pres };
}

const CONV_1 = "550e8400-e29b-41d4-a716-446655440001";
const CONV_2 = "550e8400-e29b-41d4-a716-446655440002";
const MSG_ID = "550e8400-e29b-41d4-a716-446655440004";
const LISTING_1 = "550e8400-e29b-41d4-a716-446655440003";

function seedConversation(id = CONV_1): Conversation {
  return Conversation.create({
    id,
    listingId: LISTING_1,
    buyerId: "buyer-1",
    sellerId: "seller-1",
  });
}

describe("ConversationGateway", () => {
  it("allows a participant to join a conversation room", async () => {
    const validateAccess = buildValidateAccess({
      execute: vi.fn().mockResolvedValue(seedConversation()),
    });
    const { gateway } = buildGateway(validateAccess);
    const socket = buildSocket({ user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" } });

    const result = await gateway.handleJoin(
      { conversationId: CONV_1 },
      socket,
    );

    expect(result).toEqual({
      ok: true,
      conversationId: CONV_1,
      room: conversationRoom(CONV_1),
    });
    expect(socket.join).toHaveBeenCalledWith(conversationRoom(CONV_1));
    expect(validateAccess.execute).toHaveBeenCalledWith({
      userId: "buyer-1",
      conversationId: CONV_1,
    });
  });

  it("rejects join for unauthenticated sockets", async () => {
    const { gateway } = buildGateway();
    const socket = buildSocket({ user: null });

    const result = await gateway.handleJoin(
      { conversationId: CONV_1 },
      socket,
    );

    expect(result).toEqual({
      ok: false,
      code: CONVERSATION_SOCKET_ERROR_CODES.MISSING_AUTH_TOKEN,
      message: "Authentication required",
    });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("rejects join with validation error for malformed payload", async () => {
    const { gateway } = buildGateway();
    const socket = buildSocket({ user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" } });

    const result = await gateway.handleJoin({ notId: CONV_1 }, socket);

    expect(result).toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      message: "conversationId is required",
    });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("rejects join when validateAccess throws", async () => {
    const validateAccess = buildValidateAccess({
      execute: vi.fn().mockRejectedValue({
        response: {
          code: "FORBIDDEN",
          message: "You are not a participant in this conversation",
        },
      }),
    });
    const { gateway } = buildGateway(validateAccess);
    const socket = buildSocket({ user: { sub: "random-user", sid: "sid-1", phone: "+993", role: "user" } });

    const result = await gateway.handleJoin(
      { conversationId: CONV_1 },
      socket,
    );

    expect(result).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "You are not a participant in this conversation",
    });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("duplicate join is idempotent", async () => {
    const validateAccess = buildValidateAccess({
      execute: vi.fn().mockResolvedValue(seedConversation()),
    });
    const { gateway } = buildGateway(validateAccess);
    const socket = buildSocket({ user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" } });

    const first = await gateway.handleJoin(
      { conversationId: CONV_1 },
      socket,
    );
    const second = await gateway.handleJoin(
      { conversationId: CONV_1 },
      socket,
    );

    expect(first).toEqual(second);
    expect(socket.join).toHaveBeenCalledTimes(2);
  });

  it("allows explicit leave", async () => {
    const { gateway } = buildGateway();
    const socket = buildSocket({
      user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" },
      rooms: new Set([conversationRoom(CONV_1)]),
    });

    const result = await gateway.handleLeave(
      { conversationId: CONV_1 },
      socket,
    );

    expect(result).toEqual({
      ok: true,
      conversationId: CONV_1,
      room: conversationRoom(CONV_1),
    });
    expect(socket.leave).toHaveBeenCalledWith(conversationRoom(CONV_1));
  });

  it("rejects leave for unauthenticated sockets", async () => {
    const { gateway } = buildGateway();
    const socket = buildSocket({ user: null });

    const result = await gateway.handleLeave(
      { conversationId: CONV_1 },
      socket,
    );

    expect(result).toEqual({
      ok: false,
      code: CONVERSATION_SOCKET_ERROR_CODES.MISSING_AUTH_TOKEN,
      message: "Authentication required",
    });
    expect(socket.leave).not.toHaveBeenCalled();
  });

  it("isolates rooms across conversations", async () => {
    const validateAccess = buildValidateAccess({
      execute: vi.fn().mockImplementation(async ({ conversationId }) => {
        return Conversation.create({
          id: conversationId,
          listingId: LISTING_1,
          buyerId: "buyer-1",
          sellerId: "seller-1",
        });
      }),
    });
    const { gateway } = buildGateway(validateAccess);
    const socket = buildSocket({ user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" } });

    await gateway.handleJoin({ conversationId: CONV_1 }, socket);
    await gateway.handleJoin({ conversationId: CONV_2 }, socket);

    expect(socket.join).toHaveBeenCalledWith(conversationRoom(CONV_1));
    expect(socket.join).toHaveBeenCalledWith(conversationRoom(CONV_2));
  });

  it("cross-user isolation is enforced by validateAccess", async () => {
    const validateAccess = buildValidateAccess({
      execute: vi.fn().mockImplementation(async ({ userId, conversationId }) => {
        const conversation = seedConversation();
        if (!conversation.isParticipant(userId)) {
          throw {
            response: {
              code: "FORBIDDEN",
              message: "You are not a participant in this conversation",
            },
          };
        }
        return conversation;
      }),
    });
    const { gateway } = buildGateway(validateAccess);
    const socket = buildSocket({ user: { sub: "non-participant", sid: "sid-1", phone: "+993", role: "user" } });

    const result = await gateway.handleJoin(
      { conversationId: CONV_1 },
      socket,
    );

    expect(result).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "You are not a participant in this conversation",
    });
    expect(socket.join).not.toHaveBeenCalled();
  });

  describe("message:send", () => {
    it("acks sender with the durable message and leaves message:new to the MessageSent broadcast", async () => {
      const message = Message.createText({
        id: "msg-1",
        conversationId: CONV_1,
        senderId: "buyer-1",
        text: "Hello socket",
        clientMessageId: "client-1",
      });
      const sendMessage = buildSendMessage({
        execute: vi.fn().mockResolvedValue({
          message,
          listing: null,
          created: true,
        }),
      });
      const { gateway } = buildGateway(undefined, sendMessage);
      const socket = buildSocket({
        user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" },
      });
      const emitMock = vi.fn();
      const toMock = vi.fn().mockReturnValue({ emit: emitMock });
      gateway.server = { to: toMock } as unknown as Server;

      const result = await gateway.handleSendMessage(
        {
          conversationId: CONV_1,
          kind: "text",
          text: "Hello socket",
          clientMessageId: "client-1",
        },
        socket,
      );

      expect(result).toEqual({
        ok: true,
        message: expect.objectContaining({
          id: "msg-1",
          conversationId: CONV_1,
          senderId: "buyer-1",
          kind: "text",
          text: "Hello socket",
          clientMessageId: "client-1",
        }),
      });
      expect(sendMessage.execute).toHaveBeenCalledWith({
        senderId: "buyer-1",
        conversationId: CONV_1,
        kind: "text",
        text: "Hello socket",
        clientMessageId: "client-1",
      });
      expect(toMock).not.toHaveBeenCalled();
      expect(emitMock).not.toHaveBeenCalled();
    });

    it("returns existing message for duplicate clientMessageId without creating a new row", async () => {
      const message = Message.createText({
        id: "msg-existing",
        conversationId: CONV_1,
        senderId: "buyer-1",
        text: "Already sent",
        clientMessageId: "client-dup",
      });
      const sendMessage = buildSendMessage({
        execute: vi
          .fn()
          .mockResolvedValueOnce({
            message,
            listing: null,
            created: true,
          })
          .mockResolvedValueOnce({
            message,
            listing: null,
            created: false,
          }),
      });
      const { gateway } = buildGateway(undefined, sendMessage);
      const socket = buildSocket({
        user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" },
      });
      const emitMock = vi.fn();
      const toMock = vi.fn().mockReturnValue({ emit: emitMock });
      gateway.server = { to: toMock } as unknown as Server;

      const first = await gateway.handleSendMessage(
        {
          conversationId: CONV_1,
          kind: "text",
          text: "Already sent",
          clientMessageId: "client-dup",
        },
        socket,
      );
      const second = await gateway.handleSendMessage(
        {
          conversationId: CONV_1,
          kind: "text",
          text: "Retry text",
          clientMessageId: "client-dup",
        },
        socket,
      );

      expect((first as { ok: true; message: { id: string } }).message.id).toBe(
        (second as { ok: true; message: { id: string } }).message.id,
      );
      expect(sendMessage.execute).toHaveBeenCalledTimes(2);
      expect(emitMock).not.toHaveBeenCalled();
    });

    it("rejects send for unauthenticated sockets", async () => {
      const { gateway } = buildGateway();
      const socket = buildSocket({ user: null });

      const result = await gateway.handleSendMessage(
        {
          conversationId: CONV_1,
          kind: "text",
          text: "Hello",
          clientMessageId: "client-1",
        },
        socket,
      );

      expect(result).toEqual({
        ok: false,
        code: CONVERSATION_SOCKET_ERROR_CODES.MISSING_AUTH_TOKEN,
        message: "Authentication required",
      });
    });

    it("rejects send with validation error for malformed payload", async () => {
      const { gateway } = buildGateway();
      const socket = buildSocket({
        user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" },
      });

      const result = await gateway.handleSendMessage(
        { notId: CONV_1, kind: "text", text: "Hello" },
        socket,
      );

      expect(result).toEqual({
        ok: false,
        code: "VALIDATION_FAILED",
        message: "Invalid message send payload",
      });
    });

    it("rejects send when SendMessage throws a participant/business error", async () => {
      const sendMessage = buildSendMessage({
        execute: vi.fn().mockRejectedValue({
          response: {
            code: "FORBIDDEN",
            message: "You are not a participant in this conversation",
          },
        }),
      });
      const { gateway } = buildGateway(undefined, sendMessage);
      const socket = buildSocket({
        user: { sub: "random-user", sid: "sid-1", phone: "+993", role: "user" },
      });
      gateway.server = buildServer();

      const result = await gateway.handleSendMessage(
        {
          conversationId: CONV_1,
          kind: "text",
          text: "Hello",
          clientMessageId: "client-1",
        },
        socket,
      );

      expect(result).toEqual({
        ok: false,
        code: "FORBIDDEN",
        message: "You are not a participant in this conversation",
      });
    });
  });

  describe("MessageSent broadcast", () => {
    // server.to(room).to(anotherRoom).emit(...) dedupes a socket that sits in
    // both rooms, so the mock operator must chain like a BroadcastOperator.
    function chainableBroadcast() {
      const emitMock = vi.fn();
      const operator: { emit: typeof emitMock; to: ReturnType<typeof vi.fn> } = {
        emit: emitMock,
        to: vi.fn(),
      };
      operator.to.mockReturnValue(operator);
      const toMock = vi.fn().mockReturnValue(operator);
      return { emitMock, operator, toMock };
    }

    function messageSentEvent(
      overrides: Partial<MessageSentEvent> = {},
    ): MessageSentEvent {
      return {
        event: "MessageSent",
        conversationId: CONV_1,
        messageId: MSG_ID,
        senderId: "buyer-1",
        recipientId: "seller-1",
        sentAt: "2026-09-18T10:00:00.000Z",
        messageKind: "image",
        messageBody: null,
        messageMetadata: { key: "chat-attachments/c/1/original.webp", width: 800, height: 600 },
        messageDeletedAt: null,
        clientMessageId: "client-img-1",
        ...overrides,
      };
    }

    it("fans out message:new to the conversation room for a message sent over any transport", () => {
      const { gateway } = buildGateway();
      const { emitMock, toMock } = chainableBroadcast();
      gateway.server = { to: toMock } as unknown as Server;

      gateway.handleMessageSent(messageSentEvent());

      expect(toMock).toHaveBeenCalledWith(conversationRoom(CONV_1));
      expect(emitMock).toHaveBeenCalledTimes(1);
      expect(emitMock).toHaveBeenCalledWith("message:new", {
        message: {
          id: MSG_ID,
          conversationId: CONV_1,
          senderId: "buyer-1",
          kind: "image",
          text: null,
          metadata: { key: "chat-attachments/c/1/original.webp", width: 800, height: 600 },
          createdAt: "2026-09-18T10:00:00.000Z",
          clientMessageId: "client-img-1",
        },
      });
    });

    it("also fans out message:new to the recipient's user room, so a connected recipient outside the conversation room is reached", () => {
      const { gateway } = buildGateway();
      const { emitMock, operator, toMock } = chainableBroadcast();
      gateway.server = { to: toMock } as unknown as Server;

      gateway.handleMessageSent(messageSentEvent());

      expect(toMock).toHaveBeenCalledWith(conversationRoom(CONV_1));
      expect(operator.to).toHaveBeenCalledWith(userRoom("seller-1"));
      expect(emitMock).toHaveBeenCalledTimes(1);
    });

    it("omits clientMessageId when the send carried none", () => {
      const { gateway } = buildGateway();
      const { emitMock, toMock } = chainableBroadcast();
      gateway.server = { to: toMock } as unknown as Server;

      gateway.handleMessageSent(
        messageSentEvent({
          messageKind: "text",
          messageBody: "Hello",
          messageMetadata: null,
          clientMessageId: null,
        }),
      );

      const payload = emitMock.mock.calls[0]?.[1] as {
        message: Record<string, unknown>;
      };
      expect(payload.message).not.toHaveProperty("clientMessageId");
      expect(payload.message).not.toHaveProperty("metadata");
      expect(payload.message["text"]).toBe("Hello");
    });

    it("marks a freshly sent post-reference card as available", () => {
      const { gateway } = buildGateway();
      const { emitMock, toMock } = chainableBroadcast();
      gateway.server = { to: toMock } as unknown as Server;
      const snapshot = {
        listingId: LISTING_1,
        brandId: "brand-1",
        modelId: "model-1",
        year: 2020,
        displayPriceTmt: 100000,
        priceCurrency: "TMT" as const,
        status: "active" as const,
      };

      gateway.handleMessageSent(
        messageSentEvent({
          messageKind: "post_ref",
          messageMetadata: snapshot,
          clientMessageId: "client-ref-1",
        }),
      );

      expect(emitMock).toHaveBeenCalledWith("message:new", {
        message: expect.objectContaining({
          kind: "post_ref",
          metadata: { ...snapshot, available: true },
          clientMessageId: "client-ref-1",
        }),
      });
    });
  });

  describe("watermark events", () => {
    it("updates lastDeliveredAt on message:delivered and fans out watermark", async () => {
      const updateWatermark = buildUpdateWatermark({
        execute: vi.fn().mockResolvedValue({
          conversationId: CONV_1,
          lastReadAt: null,
          lastDeliveredAt: new Date("2026-06-01T12:00:00.000Z"),
        } as UpdateWatermarkResult),
      });
      const validateAccess = buildValidateAccess({
        execute: vi.fn().mockResolvedValue(seedConversation()),
      });
      const { gateway, updateWatermark: watermarkUC } = buildGateway(
        validateAccess,
        undefined,
        updateWatermark,
      );
      const socket = buildSocket({
        user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" },
      });
      const emitMock = vi.fn();
      const toMock = vi.fn().mockReturnValue({ emit: emitMock });
      gateway.server = { to: toMock } as unknown as Server;

      const result = await gateway.handleMessageDelivered(
        { conversationId: CONV_1, lastDeliveredAt: "2026-06-01T12:00:00.000Z" },
        socket,
      );

      expect(result).toEqual({ ok: true, conversationId: CONV_1 });
      expect(watermarkUC.execute).toHaveBeenCalledWith({
        userId: "buyer-1",
        conversationId: CONV_1,
        lastDeliveredAt: "2026-06-01T12:00:00.000Z",
      });
      expect(toMock).toHaveBeenCalledWith(conversationRoom(CONV_1));
      expect(emitMock).toHaveBeenCalledWith("watermark", {
        conversationId: CONV_1,
        userId: "buyer-1",
        lastDeliveredAt: "2026-06-01T12:00:00.000Z",
      });
    });

    it("updates lastReadAt on conversation:read and fans out watermark", async () => {
      const updateWatermark = buildUpdateWatermark({
        execute: vi.fn().mockResolvedValue({
          conversationId: CONV_1,
          lastReadAt: new Date("2026-06-01T12:05:00.000Z"),
          lastDeliveredAt: null,
        } as UpdateWatermarkResult),
      });
      const validateAccess = buildValidateAccess({
        execute: vi.fn().mockResolvedValue(seedConversation()),
      });
      const { gateway, updateWatermark: watermarkUC } = buildGateway(
        validateAccess,
        undefined,
        updateWatermark,
      );
      const socket = buildSocket({
        user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" },
      });
      const emitMock = vi.fn();
      const toMock = vi.fn().mockReturnValue({ emit: emitMock });
      gateway.server = { to: toMock } as unknown as Server;

      const result = await gateway.handleConversationRead(
        { conversationId: CONV_1, lastReadAt: "2026-06-01T12:05:00.000Z" },
        socket,
      );

      expect(result).toEqual({ ok: true, conversationId: CONV_1 });
      expect(watermarkUC.execute).toHaveBeenCalledWith({
        userId: "buyer-1",
        conversationId: CONV_1,
        lastReadAt: "2026-06-01T12:05:00.000Z",
      });
      expect(emitMock).toHaveBeenCalledWith("watermark", {
        conversationId: CONV_1,
        userId: "buyer-1",
        lastReadAt: "2026-06-01T12:05:00.000Z",
      });
    });

    it("rejects watermark events for unauthenticated sockets", async () => {
      const { gateway } = buildGateway();
      const socket = buildSocket({ user: null });

      const result = await gateway.handleMessageRead(
        { conversationId: CONV_1 },
        socket,
      );

      expect(result).toEqual({
        ok: false,
        code: CONVERSATION_SOCKET_ERROR_CODES.MISSING_AUTH_TOKEN,
        message: "Authentication required",
      });
    });

    it("rejects watermark events with malformed payload", async () => {
      const { gateway } = buildGateway();
      const socket = buildSocket({
        user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" },
      });

      const result = await gateway.handleMessageDelivered(
        { notId: CONV_1 },
        socket,
      );

      expect(result).toEqual({
        ok: false,
        code: "VALIDATION_FAILED",
        message: "Invalid watermark payload",
      });
    });

    it("rejects watermark events when validateAccess throws", async () => {
      const validateAccess = buildValidateAccess({
        execute: vi.fn().mockRejectedValue({
          response: {
            code: "FORBIDDEN",
            message: "You are not a participant in this conversation",
          },
        }),
      });
      const { gateway } = buildGateway(validateAccess);
      const socket = buildSocket({
        user: { sub: "random-user", sid: "sid-1", phone: "+993", role: "user" },
      });

      const result = await gateway.handleConversationRead(
        { conversationId: CONV_1, lastReadAt: "2026-06-01T12:05:00.000Z" },
        socket,
      );

      expect(result).toEqual({
        ok: false,
        code: "FORBIDDEN",
        message: "You are not a participant in this conversation",
      });
    });
  });

  describe("message:delete", () => {
    it("acks sender and fans out message:deleted to the conversation room", async () => {
      const deletedAt = new Date("2026-06-01T12:05:00.000Z");
      const deleteMessage = buildDeleteMessage({
        execute: vi.fn().mockResolvedValue({
          messageId: MSG_ID,
          deletedAt,
        }),
      });
      const { gateway, deleteMessage: deleteMessageUC } = buildGateway(
        undefined,
        undefined,
        undefined,
        deleteMessage,
      );
      const socket = buildSocket({
        user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" },
      });
      const emitMock = vi.fn();
      const toMock = vi.fn().mockReturnValue({ emit: emitMock });
      gateway.server = { to: toMock } as unknown as Server;

      const result = await gateway.handleDeleteMessage(
        {
          conversationId: CONV_1,
          messageId: MSG_ID,
        },
        socket,
      );

      expect(result).toEqual({
        ok: true,
        messageId: MSG_ID,
        conversationId: CONV_1,
        deletedAt: deletedAt.toISOString(),
      });
      expect(deleteMessageUC.execute).toHaveBeenCalledWith({
        userId: "buyer-1",
        conversationId: CONV_1,
        messageId: MSG_ID,
      });
      expect(toMock).toHaveBeenCalledWith(conversationRoom(CONV_1));
      expect(emitMock).toHaveBeenCalledWith("message:deleted", {
        messageId: MSG_ID,
        conversationId: CONV_1,
        deletedAt: deletedAt.toISOString(),
      });
    });

    it("rejects delete for unauthenticated sockets", async () => {
      const { gateway } = buildGateway();
      const socket = buildSocket({ user: null });

      const result = await gateway.handleDeleteMessage(
        {
          conversationId: CONV_1,
          messageId: MSG_ID,
        },
        socket,
      );

      expect(result).toEqual({
        ok: false,
        code: CONVERSATION_SOCKET_ERROR_CODES.MISSING_AUTH_TOKEN,
        message: "Authentication required",
      });
    });

    it("rejects delete with validation error for malformed payload", async () => {
      const { gateway } = buildGateway();
      const socket = buildSocket({
        user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" },
      });

      const result = await gateway.handleDeleteMessage(
        { notId: CONV_1, messageId: MSG_ID },
        socket,
      );

      expect(result).toEqual({
        ok: false,
        code: "VALIDATION_FAILED",
        message: "Invalid message delete payload",
      });
    });

    it("returns business errors from DeleteMessage without fanout", async () => {
      const deleteMessage = buildDeleteMessage({
        execute: vi.fn().mockRejectedValue({
          response: {
            code: "FORBIDDEN",
            message: "You can only delete your own messages",
          },
        }),
      });
      const { gateway } = buildGateway(undefined, undefined, undefined, deleteMessage);
      const socket = buildSocket({
        user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" },
      });
      const emitMock = vi.fn();
      gateway.server = {
        to: vi.fn().mockReturnValue({ emit: emitMock }),
      } as unknown as Server;

      const result = await gateway.handleDeleteMessage(
        {
          conversationId: CONV_1,
          messageId: MSG_ID,
        },
        socket,
      );

      expect(result).toEqual({
        ok: false,
        code: "FORBIDDEN",
        message: "You can only delete your own messages",
      });
      expect(emitMock).not.toHaveBeenCalled();
    });
  });

  describe("typing events", () => {
    it("fans out typing:start to the conversation room but not back to sender", async () => {
      const validateAccess = buildValidateAccess({
        execute: vi.fn().mockResolvedValue(seedConversation()),
      });
      const { gateway } = buildGateway(validateAccess);
      const socket = buildSocket({
        user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" },
      });

      const result = await gateway.handleTypingStart(
        { conversationId: CONV_1 },
        socket,
      );

      expect(result).toEqual({ ok: true, conversationId: CONV_1 });
      expect(socket.to).toHaveBeenCalledWith(conversationRoom(CONV_1));
      expect(
        (socket.to as ReturnType<typeof vi.fn>).mock.results[0]?.value.emit,
      ).toHaveBeenCalledWith("typing:peer", {
        conversationId: CONV_1,
        userId: "buyer-1",
        isTyping: true,
      });
    });

    it("fans out typing:stop to the conversation room", async () => {
      const validateAccess = buildValidateAccess({
        execute: vi.fn().mockResolvedValue(seedConversation()),
      });
      const { gateway } = buildGateway(validateAccess);
      const socket = buildSocket({
        user: { sub: "seller-1", sid: "sid-1", phone: "+993", role: "user" },
      });

      const result = await gateway.handleTypingStop(
        { conversationId: CONV_1 },
        socket,
      );

      expect(result).toEqual({ ok: true, conversationId: CONV_1 });
      expect(
        (socket.to as ReturnType<typeof vi.fn>).mock.results[0]?.value.emit,
      ).toHaveBeenCalledWith("typing:peer", {
        conversationId: CONV_1,
        userId: "seller-1",
        isTyping: false,
      });
    });

    it("rejects typing events for unauthenticated sockets", async () => {
      const { gateway } = buildGateway();
      const socket = buildSocket({ user: null });

      const result = await gateway.handleTypingStart(
        { conversationId: CONV_1 },
        socket,
      );

      expect(result).toEqual({
        ok: false,
        code: CONVERSATION_SOCKET_ERROR_CODES.MISSING_AUTH_TOKEN,
        message: "Authentication required",
      });
      expect(socket.to).not.toHaveBeenCalled();
    });

    it("rejects typing events when validateAccess throws", async () => {
      const validateAccess = buildValidateAccess({
        execute: vi.fn().mockRejectedValue({
          response: {
            code: "FORBIDDEN",
            message: "You are not a participant in this conversation",
          },
        }),
      });
      const { gateway } = buildGateway(validateAccess);
      const socket = buildSocket({
        user: { sub: "random-user", sid: "sid-1", phone: "+993", role: "user" },
      });

      const result = await gateway.handleTypingStart(
        { conversationId: CONV_1 },
        socket,
      );

      expect(result).toEqual({
        ok: false,
        code: "FORBIDDEN",
        message: "You are not a participant in this conversation",
      });
      expect(socket.to).not.toHaveBeenCalled();
    });
  });

  describe("presence events", () => {
    it("emits own online presence to the room on join and sends peer presence to the client", async () => {
      const validateAccess = buildValidateAccess({
        execute: vi.fn().mockResolvedValue(seedConversation()),
      });
      const presence = buildPresencePort({
        isUserOnline: vi.fn().mockReturnValueOnce(true),
        getLastSeenAt: vi.fn().mockReturnValue(undefined),
      });
      const { gateway } = buildGateway(
        validateAccess,
        undefined,
        undefined,
        undefined,
        presence,
      );
      const socket = buildSocket({
        user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" },
      });

      await gateway.handleJoin({ conversationId: CONV_1 }, socket);

      expect(socket.to).toHaveBeenCalledWith(conversationRoom(CONV_1));
      expect(
        (socket.to as ReturnType<typeof vi.fn>).mock.results[0]?.value.emit,
      ).toHaveBeenCalledWith("presence", {
        conversationId: CONV_1,
        userId: "buyer-1",
        online: true,
      });
      expect(socket.emit).toHaveBeenCalledWith("presence", {
        conversationId: CONV_1,
        userId: "seller-1",
        online: true,
      });
    });

    it("sends peer offline presence with lastSeenAt when the peer is not online", async () => {
      const validateAccess = buildValidateAccess({
        execute: vi.fn().mockResolvedValue(seedConversation()),
      });
      const lastSeen = new Date("2026-06-01T12:00:00.000Z");
      const presence = buildPresencePort({
        isUserOnline: vi.fn().mockReturnValueOnce(false),
        getLastSeenAt: vi.fn().mockReturnValue(lastSeen),
      });
      const { gateway } = buildGateway(
        validateAccess,
        undefined,
        undefined,
        undefined,
        presence,
      );
      const socket = buildSocket({
        user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" },
      });

      await gateway.handleJoin({ conversationId: CONV_1 }, socket);

      expect(socket.emit).toHaveBeenCalledWith("presence", {
        conversationId: CONV_1,
        userId: "seller-1",
        online: false,
        lastSeenAt: lastSeen.toISOString(),
      });
    });

    it("broadcasts offline presence on disconnect", async () => {
      const validateAccess = buildValidateAccess({
        execute: vi.fn().mockResolvedValue(seedConversation()),
      });
      const { gateway } = buildGateway(validateAccess);
      const socket = buildSocket({
        id: "socket-1",
        user: { sub: "buyer-1", sid: "sid-1", phone: "+993", role: "user" },
        rooms: new Set([conversationRoom(CONV_1)]),
      });

      await gateway.handleJoin({ conversationId: CONV_1 }, socket);

      const emitMock = vi.fn();
      const toMock = vi.fn().mockReturnValue({ emit: emitMock });
      gateway.server = { to: toMock } as unknown as Server;

      gateway.handleDisconnect(socket);

      expect(toMock).toHaveBeenCalledWith(conversationRoom(CONV_1));
      expect(emitMock).toHaveBeenCalledWith(
        "presence",
        expect.objectContaining({
          conversationId: CONV_1,
          userId: "buyer-1",
          online: false,
        }),
      );
    });
  });
});
