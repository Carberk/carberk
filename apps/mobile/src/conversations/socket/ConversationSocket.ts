import { io, type Socket } from "socket.io-client";
import { ConversationsSchemas, DateTimeSchema } from "@auto-tm/contracts";
import { z } from "zod";

import { loadAuthSession } from "../../auth/session";
import { apiRouteHeaders, captureRouteSnapshot, subscribeRouteChanges } from "../../api/routes";

const DEFAULT_WS_URL =
  process.env["EXPO_PUBLIC_WS_URL"] ?? "ws://localhost:3006/ws/chat";

const SOCKET_CLIENT_ERROR_CODES = {
  NOT_CONNECTED: "NOT_CONNECTED",
  INVALID_ACK: "INVALID_ACK",
} as const;

export type ConversationSocketStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface SocketErrorAck {
  ok: false;
  code: string;
  message: string;
}

export interface JoinConversationAck {
  ok: true;
  conversationId: string;
  room: string;
}

export interface SendMessageAck {
  ok: true;
  message: ConversationsSchemas.MessageSummary;
}

export type MessageNewEvent = ConversationsSchemas.ChatMessageEvent;
export type MessageDeletedEvent = ConversationsSchemas.MessageDeletedEvent;

export type WatermarkEvent = ConversationsSchemas.WatermarkEvent;

export type TypingEvent = ConversationsSchemas.TypingEvent;

export type PresenceEvent = ConversationsSchemas.PresenceEvent;

export interface UpdateWatermarkAck {
  ok: true;
  conversationId: string;
}

export interface TypingAck {
  ok: true;
  conversationId: string;
}

export interface ConversationSocketOptions {
  url?: string;
  token?: string;
}

let sharedSocket: ConversationSocket | null = null;

/**
 * The one app-wide socket, shared by the Conversation screen hook and the
 * global listener. The server ties the socket to the authenticated User at
 * the handshake, so every consumer must use the same connection.
 */
export function getSharedConversationSocket(): ConversationSocket {
  if (!sharedSocket) {
    sharedSocket = new ConversationSocket({}, true);
  }
  return sharedSocket;
}

export class ConversationSocket {
  private socket: Socket | null = null;
  private authToken: string | null = null;
  private routeGeneration: number | null = null;
  private routeUnsubscribe: (() => void) | null = null;
  private connectionVersion = 0;
  private connectInFlight: Promise<void> | null = null;
  private readonly pendingSends = new Set<() => void>();
  private status: ConversationSocketStatus = "idle";
  private statusListeners = new Set<(status: ConversationSocketStatus) => void>();
  private messageListeners = new Set<(event: MessageNewEvent) => void>();
  private watermarkListeners = new Set<(event: WatermarkEvent) => void>();
  private deletedMessageListeners = new Set<
    (event: MessageDeletedEvent) => void
  >();
  private typingListeners = new Set<(event: TypingEvent) => void>();
  private presenceListeners = new Set<(event: PresenceEvent) => void>();
  private currentRoom: string | null = null;
  private activeJoinRequest: Promise<JoinConversationAck | SocketErrorAck> | null =
    null;
  private readonly pendingJoins = new Map<string, Promise<JoinConversationAck | SocketErrorAck>>();

  constructor(private readonly options: ConversationSocketOptions = {}, private readonly followRoutes = false) {}

  getStatus(): ConversationSocketStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  subscribeStatus(listener: (status: ConversationSocketStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  subscribeMessage(listener: (event: MessageNewEvent) => void): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  subscribeWatermark(listener: (event: WatermarkEvent) => void): () => void {
    this.watermarkListeners.add(listener);
    return () => {
      this.watermarkListeners.delete(listener);
    };
  }

  subscribeDeletedMessage(
    listener: (event: MessageDeletedEvent) => void,
  ): () => void {
    this.deletedMessageListeners.add(listener);
    return () => {
      this.deletedMessageListeners.delete(listener);
    };
  }

  subscribeTyping(listener: (event: TypingEvent) => void): () => void {
    this.typingListeners.add(listener);
    return () => {
      this.typingListeners.delete(listener);
    };
  }

  subscribePresence(listener: (event: PresenceEvent) => void): () => void {
    this.presenceListeners.add(listener);
    return () => {
      this.presenceListeners.delete(listener);
    };
  }

  connect(): Promise<void> {
    if (this.connectInFlight) return this.connectInFlight;
    const attempt = this.openConnection();
    this.connectInFlight = attempt;
    void attempt.then(() => {
      if (this.connectInFlight === attempt) this.connectInFlight = null;
    }, () => {
      if (this.connectInFlight === attempt) this.connectInFlight = null;
    });
    return attempt;
  }

  private async openConnection(): Promise<void> {
    const route = captureRouteSnapshot();
    const version = this.connectionVersion;
    if (this.followRoutes && !this.routeUnsubscribe) {
      this.routeUnsubscribe = subscribeRouteChanges(() => {
        this.connectionVersion++;
        this.connectInFlight = null;
        this.failPendingSends();
        const previousSocket = this.socket;
        this.socket = null;
        previousSocket?.disconnect();
        this.pendingJoins.clear();
        this.setStatus("disconnected");
        void this.connect();
      });
    }
    const token = this.options.token ?? (await loadAuthSession())?.accessToken;
    if (version !== this.connectionVersion) return;
    if (!token) {
      this.failPendingSends();
      this.socket?.disconnect();
      this.socket = null;
      this.authToken = null;
      this.routeGeneration = null;
      this.currentRoom = null;
      this.setStatus("error");
      return;
    }

    if (this.socket && this.authToken === token && (this.options.url || this.routeGeneration === route.generation)) {
      return;
    }

    let routeHeaders: Record<string, string>;
    try {
      routeHeaders = this.options.url ? {} : await apiRouteHeaders(route);
    } catch {
      if (version === this.connectionVersion) this.setStatus("error");
      return;
    }
    if (version !== this.connectionVersion) return;
    this.failPendingSends();
    const previousSocket = this.socket;
    this.socket = null;
    previousSocket?.disconnect();
    if (previousSocket) this.setStatus("disconnected");
    this.pendingJoins.clear();
    this.activeJoinRequest = null;
    if (this.authToken !== token) this.currentRoom = null;
    this.authToken = token;
    this.routeGeneration = route.generation;
    this.setStatus("connecting");

    const url = route.entry === "tm" && !this.options.url
      ? new URL("/ws/chat", route.apiBaseUrl).toString().replace(/\/$/, "")
      : this.options.url ?? DEFAULT_WS_URL;
    const socket = io(url, {
      auth: { token },
      transports: ["websocket", "polling"],
      tryAllTransports: true,
      ...(Object.keys(routeHeaders).length ? { extraHeaders: routeHeaders } : {}),
      autoConnect: true,
    });
    this.socket = socket;

    socket.on("connect", () => {
      if (this.socket !== socket) return;
      this.setStatus("connected");
      if (this.currentRoom) {
        void this.joinRoomFromReconnect(this.currentRoom);
      }
    });

    socket.on("disconnect", () => {
      if (this.socket !== socket) return;
      this.failPendingSends();
      this.pendingJoins.clear();
      this.setStatus("disconnected");
    });

    socket.on("connect_error", () => {
      if (this.socket !== socket) return;
      this.setStatus("error");
    });

    socket.on("message:new", (event: unknown) => {
      if (this.socket !== socket) return;
      const parsed = ConversationsSchemas.ChatMessageEventSchema.safeParse(event);
      if (parsed.success) {
        this.messageListeners.forEach((listener) => listener(parsed.data));
      }
    });

    socket.on("watermark", (event: unknown) => {
      if (this.socket !== socket) return;
      const parsed = ConversationsSchemas.WatermarkEventSchema.safeParse(event);
      if (parsed.success) {
        this.watermarkListeners.forEach((listener) => listener(parsed.data));
      }
    });

    socket.on("message:deleted", (event: unknown) => {
      if (this.socket !== socket) return;
      const parsed =
        ConversationsSchemas.MessageDeletedEventSchema.safeParse(event);
      if (parsed.success) {
        this.deletedMessageListeners.forEach((listener) =>
          listener(parsed.data),
        );
      }
    });

    socket.on("typing:peer", (event: unknown) => {
      if (this.socket !== socket) return;
      const parsed = ConversationsSchemas.TypingEventSchema.safeParse(event);
      if (parsed.success) {
        this.typingListeners.forEach((listener) => listener(parsed.data));
      }
    });

    socket.on("presence", (event: unknown) => {
      if (this.socket !== socket) return;
      const parsed = ConversationsSchemas.PresenceEventSchema.safeParse(event);
      if (parsed.success) {
        this.presenceListeners.forEach((listener) => listener(parsed.data));
      }
    });
  }

  disconnect(): void {
    this.connectionVersion++;
    this.connectInFlight = null;
    this.routeUnsubscribe?.();
    this.routeUnsubscribe = null;
    this.failPendingSends();
    this.pendingJoins.clear();
    this.currentRoom = null;
    this.socket?.disconnect();
    this.socket = null;
    this.authToken = null;
    this.routeGeneration = null;
    this.setStatus("idle");
  }

  async joinConversation(
    conversationId: string,
  ): Promise<JoinConversationAck | SocketErrorAck> {
    if (!this.socket?.connected) {
      return {
        ok: false,
        code: SOCKET_CLIENT_ERROR_CODES.NOT_CONNECTED,
        message: "Socket is not connected",
      };
    }

    const pending = this.pendingJoins.get(conversationId);
    if (pending) return pending;
    const socket = this.socket;

    // Create and register the request before emitting: mocks (and some
    // transports) can answer the acknowledgement synchronously.
    let resolveRequest!: (
      value: JoinConversationAck | SocketErrorAck,
    ) => void;
    const request = new Promise<JoinConversationAck | SocketErrorAck>((resolve) => {
      resolveRequest = resolve;
    });
    // The wrapper's reconnect and the mounted screen can request the same
    // room in one connect turn. The gateway counts joins, so emit only once.
    this.activeJoinRequest = request;
    this.pendingJoins.set(conversationId, request);

    socket.emit("conversation:join", { conversationId }, (ack: unknown) => {
      const parsed =
        ConversationsSchemas.JoinConversationResponseSchema.safeParse(ack);
      if (parsed.success) {
        // A join acknowledged after a newer join or a leave must not
        // replace the room the socket currently belongs to.
        if (this.activeJoinRequest === request) {
          this.currentRoom = parsed.data.room;
        }
        resolveRequest({
          ok: true,
          conversationId: parsed.data.conversationId,
          room: parsed.data.room,
        });
        return;
      }

      const errorParsed =
        ConversationsSchemas.ConversationSocketErrorSchema.safeParse(ack);
      if (errorParsed.success) {
        resolveRequest(errorParsed.data);
        return;
      }

      resolveRequest({
        ok: false,
        code: SOCKET_CLIENT_ERROR_CODES.INVALID_ACK,
        message: "Invalid join response",
      });
    });

    void request.then(() => {
      if (this.pendingJoins.get(conversationId) === request) this.pendingJoins.delete(conversationId);
    });
    return request;
  }

  async leaveConversation(conversationId: string): Promise<void> {
    // Leaving always clears local room state, even when the socket is
    // currently disconnected; otherwise a reconnect would rejoin a room the
    // User already left, and a coalesced pending join would swallow a later
    // rejoin of the same Conversation.
    this.pendingJoins.delete(conversationId);
    this.activeJoinRequest = null;
    this.currentRoom = null;
    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit("conversation:leave", { conversationId });
  }

  async markDelivered(
    conversationId: string,
    lastDeliveredAt?: string,
  ): Promise<UpdateWatermarkAck | SocketErrorAck> {
    return this.emitWatermark(conversationId, "message:delivered", {
      lastDeliveredAt,
    });
  }

  async markRead(
    conversationId: string,
    lastReadAt?: string,
  ): Promise<UpdateWatermarkAck | SocketErrorAck> {
    return this.emitWatermark(conversationId, "message:read", {
      lastReadAt,
    });
  }

  async markConversationRead(
    conversationId: string,
    lastReadAt?: string,
  ): Promise<UpdateWatermarkAck | SocketErrorAck> {
    return this.emitWatermark(conversationId, "conversation:read", {
      lastReadAt,
    });
  }

  private async emitWatermark(
    conversationId: string,
    event: "message:delivered" | "message:read" | "conversation:read",
    timestamps: { lastReadAt?: string; lastDeliveredAt?: string },
  ): Promise<UpdateWatermarkAck | SocketErrorAck> {
    if (!this.socket?.connected) {
      return {
        ok: false,
        code: SOCKET_CLIENT_ERROR_CODES.NOT_CONNECTED,
        message: "Socket is not connected",
      };
    }

    const socket = this.socket;

    return new Promise((resolve) => {
      socket.emit(
        event,
        { conversationId, ...timestamps },
        (ack: unknown) => {
          const parsed = z
            .object({
              ok: z.literal(true),
              conversationId: z.string().guid(),
            })
            .safeParse(ack);
          if (parsed.success) {
            resolve({
              ok: true,
              conversationId: parsed.data.conversationId,
            });
            return;
          }

          const errorParsed =
            ConversationsSchemas.ConversationSocketErrorSchema.safeParse(ack);
          if (errorParsed.success) {
            resolve(errorParsed.data);
            return;
          }

          resolve({
            ok: false,
            code: SOCKET_CLIENT_ERROR_CODES.INVALID_ACK,
            message: "Invalid watermark response",
          });
        },
      );
    });
  }

  async deleteMessage(payload: {
    conversationId: string;
    messageId: string;
  }): Promise<
    | { ok: true; messageId: string; conversationId: string; deletedAt: string }
    | { ok: false; code: string; message: string }
  > {
    if (!this.socket?.connected) {
      return {
        ok: false,
        code: SOCKET_CLIENT_ERROR_CODES.NOT_CONNECTED,
        message: "Socket is not connected",
      };
    }

    const socket = this.socket;

    return new Promise((resolve) => {
      socket.emit(
        "message:delete",
        {
          conversationId: payload.conversationId,
          messageId: payload.messageId,
        },
        (ack: unknown) => {
          const wrapped = z
            .object({
              ok: z.literal(true),
              messageId: z.string().guid(),
              conversationId: z.string().guid(),
              deletedAt: DateTimeSchema,
            })
            .safeParse(ack);
          if (wrapped.success) {
            resolve({
              ok: true,
              messageId: wrapped.data.messageId,
              conversationId: wrapped.data.conversationId,
              deletedAt: wrapped.data.deletedAt,
            });
            return;
          }

          const errorParsed =
            ConversationsSchemas.ConversationSocketErrorSchema.safeParse(ack);
          if (errorParsed.success) {
            resolve(errorParsed.data);
            return;
          }

          resolve({
            ok: false,
            code: SOCKET_CLIENT_ERROR_CODES.INVALID_ACK,
            message: "Invalid delete response",
          });
        },
      );
    });
  }

  async sendTextMessage(payload: {
    conversationId: string;
    text: string;
    clientMessageId: string;
  }): Promise<SendMessageAck | SocketErrorAck> {
    return this.sendMessage({
      conversationId: payload.conversationId,
      kind: "text",
      text: payload.text,
      clientMessageId: payload.clientMessageId,
    });
  }

  async sendImageMessage(payload: {
    conversationId: string;
    metadata: ConversationsSchemas.ImageMessageMetadata;
    clientMessageId: string;
  }): Promise<SendMessageAck | SocketErrorAck> {
    return this.sendMessage({
      conversationId: payload.conversationId,
      kind: "image",
      metadata: payload.metadata,
      clientMessageId: payload.clientMessageId,
    });
  }

  private async sendMessage(
    payload:
      | {
          conversationId: string;
          kind: "text";
          text: string;
          clientMessageId: string;
        }
      | {
          conversationId: string;
          kind: "image";
          metadata: ConversationsSchemas.ImageMessageMetadata;
          clientMessageId: string;
        },
  ): Promise<SendMessageAck | SocketErrorAck> {
    if (!this.socket?.connected) {
      return {
        ok: false,
        code: SOCKET_CLIENT_ERROR_CODES.NOT_CONNECTED,
        message: "Socket is not connected",
      };
    }

    const socket = this.socket;

    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: SendMessageAck | SocketErrorAck) => {
        if (settled) return;
        settled = true;
        this.pendingSends.delete(fail);
        resolve(result);
      };
      const fail = () => settle({ ok: false, code: "ACK_UNKNOWN", message: "Message status is uncertain" });
      this.pendingSends.add(fail);
      socket.emit(
        "message:send",
        payload,
        (ack: unknown) => {
          const wrapped = z.object({
            ok: z.literal(true),
            message: ConversationsSchemas.MessageSummarySchema,
          }).safeParse(ack);
          if (wrapped.success) {
            settle(wrapped.data);
            return;
          }

          const errorParsed =
            ConversationsSchemas.ConversationSocketErrorSchema.safeParse(ack);
          if (errorParsed.success) {
            settle(errorParsed.data);
            return;
          }

          settle({
            ok: false,
            code: SOCKET_CLIENT_ERROR_CODES.INVALID_ACK,
            message: "Invalid send response",
          });
        },
      );
    });
  }

  private failPendingSends(): void {
    for (const fail of this.pendingSends) fail();
  }

  async sendTypingStart(conversationId: string): Promise<TypingAck | SocketErrorAck> {
    return this.emitTyping(conversationId, "typing:start");
  }

  async sendTypingStop(conversationId: string): Promise<TypingAck | SocketErrorAck> {
    return this.emitTyping(conversationId, "typing:stop");
  }

  private async emitTyping(
    conversationId: string,
    event: "typing:start" | "typing:stop",
  ): Promise<TypingAck | SocketErrorAck> {
    if (!this.socket?.connected) {
      return {
        ok: false,
        code: SOCKET_CLIENT_ERROR_CODES.NOT_CONNECTED,
        message: "Socket is not connected",
      };
    }

    const socket = this.socket;

    return new Promise((resolve) => {
      socket.emit(
        event,
        { conversationId },
        (ack: unknown) => {
          const parsed = z
            .object({
              ok: z.literal(true),
              conversationId: z.string().guid(),
            })
            .safeParse(ack);
          if (parsed.success) {
            resolve({
              ok: true,
              conversationId: parsed.data.conversationId,
            });
            return;
          }

          const errorParsed =
            ConversationsSchemas.ConversationSocketErrorSchema.safeParse(ack);
          if (errorParsed.success) {
            resolve(errorParsed.data);
            return;
          }

          resolve({
            ok: false,
            code: SOCKET_CLIENT_ERROR_CODES.INVALID_ACK,
            message: "Invalid typing response",
          });
        },
      );
    });
  }

  private async joinRoomFromReconnect(room: string): Promise<void> {
    const conversationId = room.replace("conversation:", "");
    await this.joinConversation(conversationId);
  }

  private setStatus(status: ConversationSocketStatus): void {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }
}
