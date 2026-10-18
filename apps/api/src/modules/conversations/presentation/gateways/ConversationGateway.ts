import { Inject, Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { OnGatewayDisconnect } from "@nestjs/websockets";
import { ConversationsSchemas, ErrorCode } from "@auto-tm/contracts";
import { z } from "zod";
import type { Server, Socket } from "socket.io";

import {
  conversationRoom,
  CONVERSATION_ROOM_PREFIX,
  REALTIME_NAMESPACE,
  userRoom,
} from "../../../realtime/infrastructure/realtime.config";
import type { AuthenticatedSocketUser } from "../../../realtime/infrastructure/SocketAuthMiddleware";
import { PRESENCE_PORT, type PresencePort } from "../../../realtime/domain/ports/PresencePort";
import { CONVERSATION_SOCKET_ERROR_CODES } from "../../domain/types";
import {
  SendRealtimeMessage,
  type SendRealtimeMessageResult,
} from "../../application/SendRealtimeMessage";
import { UpdateWatermark } from "../../application/UpdateWatermark";
import { ValidateConversationAccess } from "../../application/ValidateConversationAccess";
import { DeleteMessage } from "../../application/DeleteMessage";
import type { Message } from "../../domain/Message";
import type { MessageSentEvent } from "../../domain/ports/MessageEventPublisher";
import type { Conversation } from "../../domain/Conversation";
import type { ConversationActor } from "../../domain/ports/BusinessEnquiryRepository";

type JoinPayload = {
  conversationId: string;
};

type WatermarkPayload = {
  conversationId: string;
  lastReadAt?: string | undefined;
  lastDeliveredAt?: string | undefined;
};

type SocketAck<T> = T | { ok: false; code: string; message: string };

function parseJoinPayload(body: unknown): JoinPayload | null {
  try {
    const parsed = ConversationsSchemas.JoinConversationRequestSchema.parse(
      body,
    );
    return { conversationId: parsed.conversationId };
  } catch {
    return null;
  }
}

function parseTypingPayload(
  body: unknown,
): { conversationId: string } | null {
  try {
    const parsed = ConversationsSchemas.TypingStartRequestSchema.parse(body);
    return { conversationId: parsed.conversationId };
  } catch {
    return null;
  }
}

function parseSendMessagePayload(
  body: unknown,
): ConversationsSchemas.SendMessageSocketRequest | null {
  try {
    const parsed = ConversationsSchemas.SendMessageSocketRequestSchema.parse(
      body,
    );
    return parsed;
  } catch {
    return null;
  }
}

const WatermarkSocketPayloadSchema = z.object({
  conversationId: z.string().uuid(),
  lastReadAt: z.string().datetime().optional(),
  lastDeliveredAt: z.string().datetime().optional(),
}).refine(
  (data) => data.lastReadAt !== undefined || data.lastDeliveredAt !== undefined,
  {
    message: "At least one watermark timestamp is required",
    path: [],
  },
);

function parseWatermarkPayload(
  body: unknown,
): WatermarkPayload | null {
  try {
    const parsed = WatermarkSocketPayloadSchema.parse(body);
    return {
      conversationId: parsed.conversationId,
      lastReadAt: parsed.lastReadAt,
      lastDeliveredAt: parsed.lastDeliveredAt,
    };
  } catch {
    return null;
  }
}

function parseDeleteMessagePayload(
  body: unknown,
): ConversationsSchemas.DeleteMessageSocketRequest | null {
  try {
    const parsed =
      ConversationsSchemas.DeleteMessageSocketRequestSchema.parse(body);
    return parsed;
  } catch {
    return null;
  }
}

@Injectable()
@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
})
export class ConversationGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly userRoomCounts = new Map<string, Map<string, number>>();
  private readonly socketRooms = new Map<string, Set<string>>();

  constructor(
    @Inject(ValidateConversationAccess)
    private readonly validateAccess: ValidateConversationAccess,
    @Inject(SendRealtimeMessage)
    private readonly sendMessage: SendRealtimeMessage,
    @Inject(UpdateWatermark)
    private readonly updateWatermark: UpdateWatermark,
    @Inject(DeleteMessage)
    private readonly deleteMessage: DeleteMessage,
    @Inject(PRESENCE_PORT)
    private readonly presence: PresencePort,
  ) {}

  @SubscribeMessage("conversation:join")
  async handleJoin(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<
    SocketAck<{
      ok: true;
      conversationId: string;
      room: string;
    }>
  > {
    const user = this.authenticatedUser(client);
    if (!user) {
      return this.unauthenticatedError();
    }

    const payload = parseJoinPayload(body);
    if (!payload) {
      return {
        ok: false,
        code: ErrorCode.ValidationFailed,
        message: "conversationId is required",
      };
    }

    let conversation: Conversation;
    try {
      conversation = await this.validateAccess.execute({
        userId: user.sub,
        conversationId: payload.conversationId,
        ...(this.socketActor(client) ? { actor: this.socketActor(client) } : {}),
      });
    } catch (err) {
      return this.toSocketError(err);
    }

    const room = conversationRoom(payload.conversationId);
    await client.join(room);
    this.trackSocketRoom(client.id, room);

    const previousCount = this.getRoomCount(user.sub, room);
    this.incrementRoomCount(user.sub, room);
    if (previousCount === 0) {
      // Notify the peer that this user is now present in this conversation.
      const ownPresence: ConversationsSchemas.PresenceEvent = {
        conversationId: payload.conversationId,
        userId: user.sub,
        online: true,
      };
      client.to(room).emit("presence", ownPresence);
    }

    // Send the joining user the current presence of each peer participant.
    for (const participantId of [
      conversation.buyerId,
      conversation.sellerId,
    ]) {
      if (participantId === user.sub) continue;

      const online = this.presence.isUserOnline(participantId);
      const lastSeenAt = online
        ? undefined
        : this.presence.getLastSeenAt(participantId)?.toISOString();

      const peerPresence: ConversationsSchemas.PresenceEvent = {
        conversationId: payload.conversationId,
        userId: participantId,
        online,
        lastSeenAt,
      };
      client.emit("presence", peerPresence);
    }

    return {
      ok: true,
      conversationId: payload.conversationId,
      room,
    };
  }

  @SubscribeMessage("conversation:leave")
  async handleLeave(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<
    SocketAck<{
      ok: true;
      conversationId: string;
      room: string;
    }>
  > {
    const user = this.authenticatedUser(client);
    if (!user) {
      return this.unauthenticatedError();
    }

    const payload = parseJoinPayload(body);
    if (!payload) {
      return {
        ok: false,
        code: ErrorCode.ValidationFailed,
        message: "conversationId is required",
      };
    }

    const room = conversationRoom(payload.conversationId);

    const countBefore = this.getRoomCount(user.sub, room);
    if (countBefore > 0) {
      await client.leave(room);
      this.untrackSocketRoom(client.id, room);
      const countAfter = this.decrementRoomCount(user.sub, room);
      if (countAfter === 0) {
        const presence: ConversationsSchemas.PresenceEvent = {
          conversationId: payload.conversationId,
          userId: user.sub,
          online: false,
          lastSeenAt: this.presence.getLastSeenAt(user.sub)?.toISOString() ?? new Date().toISOString(),
        };
        client.to(room).emit("presence", presence);
      }
    } else {
      await client.leave(room);
      this.untrackSocketRoom(client.id, room);
    }

    return {
      ok: true,
      conversationId: payload.conversationId,
      room,
    };
  }

  @SubscribeMessage("typing:start")
  async handleTypingStart(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<SocketAck<{ ok: true; conversationId: string }>> {
    return this.handleTyping(body, client, true);
  }

  @SubscribeMessage("typing:stop")
  async handleTypingStop(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<SocketAck<{ ok: true; conversationId: string }>> {
    return this.handleTyping(body, client, false);
  }

  private async handleTyping(
    body: unknown,
    client: Socket,
    isTyping: boolean,
  ): Promise<SocketAck<{ ok: true; conversationId: string }>> {
    const user = this.authenticatedUser(client);
    if (!user) {
      return this.unauthenticatedError();
    }

    const payload = parseTypingPayload(body);
    if (!payload) {
      return {
        ok: false,
        code: ErrorCode.ValidationFailed,
        message: "conversationId is required",
      };
    }

    try {
      await this.validateAccess.execute({
        userId: user.sub,
        conversationId: payload.conversationId,
        ...(this.socketActor(client) ? { actor: this.socketActor(client) } : {}),
      });
    } catch (err) {
      return this.toSocketError(err);
    }

    const room = conversationRoom(payload.conversationId);
    const event: ConversationsSchemas.TypingEvent = {
      conversationId: payload.conversationId,
      userId: user.sub,
      isTyping,
    };

    // Fan out to other participants in the room, not back to the sender.
    client.to(room).emit("typing:peer", event);

    return { ok: true, conversationId: payload.conversationId };
  }

  handleDisconnect(client: Socket): void {
    const user = this.authenticatedUser(client);
    if (!user) {
      return;
    }

    const rooms = this.getSocketRooms(client.id);
    for (const room of rooms) {
      if (!room.startsWith(CONVERSATION_ROOM_PREFIX)) continue;

      const countAfter = this.decrementRoomCount(user.sub, room);
      if (countAfter === 0) {
        const conversationId = room.slice(CONVERSATION_ROOM_PREFIX.length);
        const presence: ConversationsSchemas.PresenceEvent = {
          conversationId,
          userId: user.sub,
          online: false,
          lastSeenAt: this.presence.getLastSeenAt(user.sub)?.toISOString() ?? new Date().toISOString(),
        };
        this.server.to(room).emit("presence", presence);
      }
    }

    this.clearSocketRooms(client.id);
  }

  @SubscribeMessage("message:delivered")
  async handleMessageDelivered(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<SocketAck<{ ok: true; conversationId: string }>> {
    return this.handleWatermark(body, client, { field: "lastDeliveredAt" });
  }

  @SubscribeMessage("message:read")
  async handleMessageRead(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<SocketAck<{ ok: true; conversationId: string }>> {
    return this.handleWatermark(body, client, { field: "lastReadAt" });
  }

  @SubscribeMessage("conversation:read")
  async handleConversationRead(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<SocketAck<{ ok: true; conversationId: string }>> {
    return this.handleWatermark(body, client, { field: "lastReadAt" });
  }

  private async handleWatermark(
    body: unknown,
    client: Socket,
    opts: { field: "lastReadAt" | "lastDeliveredAt" },
  ): Promise<SocketAck<{ ok: true; conversationId: string }>> {
    const user = this.authenticatedUser(client);
    if (!user) {
      return this.unauthenticatedError();
    }

    const payload = parseWatermarkPayload(body);
    if (!payload) {
      return {
        ok: false,
        code: ErrorCode.ValidationFailed,
        message: "Invalid watermark payload",
      };
    }

    const timestamp =
      opts.field === "lastReadAt"
        ? (payload.lastReadAt ?? new Date().toISOString())
        : (payload.lastDeliveredAt ?? new Date().toISOString());
    const update =
      opts.field === "lastReadAt"
        ? { lastReadAt: timestamp }
        : { lastDeliveredAt: timestamp };

    try {
      await this.validateAccess.execute({
        userId: user.sub,
        conversationId: payload.conversationId,
        ...(this.socketActor(client) ? { actor: this.socketActor(client) } : {}),
      });
    } catch (err) {
      return this.toSocketError(err);
    }

    try {
      const result = await this.updateWatermark.execute({
        userId: user.sub,
        conversationId: payload.conversationId,
        ...update,
      });

      const event: ConversationsSchemas.WatermarkEvent = {
        conversationId: payload.conversationId,
        userId: user.sub,
      };
      if (result.lastReadAt) {
        event.lastReadAt = result.lastReadAt.toISOString();
      }
      if (result.lastDeliveredAt) {
        event.lastDeliveredAt = result.lastDeliveredAt.toISOString();
      }

      this.server
        .to(conversationRoom(payload.conversationId))
        .emit("watermark", event);

      return { ok: true, conversationId: payload.conversationId };
    } catch (err) {
      return this.toSocketError(err);
    }
  }

  @SubscribeMessage("message:send")
  async handleSendMessage(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<SocketAck<{ ok: true; message: ConversationsSchemas.MessageSummary }>> {
    const user = this.authenticatedUser(client);
    if (!user) {
      return this.unauthenticatedError();
    }

    const payload = parseSendMessagePayload(body);
    if (!payload) {
      return {
        ok: false,
        code: ErrorCode.ValidationFailed,
        message: "Invalid message send payload",
      };
    }

    let result: SendRealtimeMessageResult;
    try {
      result = await this.sendMessage.execute({
        senderId: user.sub,
        ...payload,
      });
    } catch (err) {
      return this.toSocketError(err);
    }

    // message:new fanout happens in handleMessageSent, which every transport
    // reaches through ConversationMessageCommitter.
    return {
      ok: true,
      message: this.toMessageSummary(result.message),
    };
  }

  @OnEvent("MessageSent")
  handleMessageSent(event: MessageSentEvent): void {
    // The conversation room reaches sockets that joined it; the recipient's
    // user room (joined on every authenticated connect) reaches the recipient
    // wherever they are in the app. Socket.IO dedupes a socket in both rooms.
    this.server
      .to(conversationRoom(event.conversationId))
      .to(userRoom(event.recipientId))
      .emit("message:new", { message: this.toBroadcastSummary(event) });
  }

  @SubscribeMessage("message:delete")
  async handleDeleteMessage(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ): Promise<SocketAck<{ ok: true } & ConversationsSchemas.MessageDeletedEvent>> {
    const user = this.authenticatedUser(client);
    if (!user) {
      return this.unauthenticatedError();
    }

    const payload = parseDeleteMessagePayload(body);
    if (!payload) {
      return {
        ok: false,
        code: ErrorCode.ValidationFailed,
        message: "Invalid message delete payload",
      };
    }

    let result: { messageId: string; deletedAt: Date };
    try {
      result = await this.deleteMessage.execute({
        userId: user.sub,
        conversationId: payload.conversationId,
        messageId: payload.messageId,
      });
    } catch (err) {
      return this.toSocketError(err);
    }

    const room = conversationRoom(payload.conversationId);
    this.server.to(room).emit("message:deleted", {
      messageId: result.messageId,
      conversationId: payload.conversationId,
      deletedAt: result.deletedAt.toISOString(),
    });

    return {
      ok: true,
      messageId: result.messageId,
      conversationId: payload.conversationId,
      deletedAt: result.deletedAt.toISOString(),
    };
  }

  private socketActor(client: Socket): ConversationActor | undefined {
    const user = this.authenticatedUser(client);
    if (!user) return undefined;
    const raw = client.handshake?.headers?.["x-business-id"];
    const businessId = Array.isArray(raw) ? raw[0] : raw;
    if (!businessId) return undefined;
    return { userId: user.sub, sessionId: user.sid, businessId };
  }

  private authenticatedUser(client: Socket): AuthenticatedSocketUser | null {
    const user = client.data.user;
    if (!user?.sub) return null;
    return user;
  }

  private unauthenticatedError(): { ok: false; code: string; message: string } {
    return {
      ok: false,
      code: CONVERSATION_SOCKET_ERROR_CODES.MISSING_AUTH_TOKEN,
      message: "Authentication required",
    };
  }

  private toSocketError(err: unknown): {
    ok: false;
    code: string;
    message: string;
  } {
    if (err && typeof err === "object" && "response" in err) {
      const response = (err as { response?: Record<string, unknown> }).response;
      if (response) {
        const code =
          typeof response["code"] === "string"
            ? response["code"]
            : ErrorCode.Forbidden;
        const message =
          typeof response["message"] === "string"
            ? response["message"]
            : "Access denied";
        return { ok: false, code, message };
      }
    }

    if (err instanceof Error) {
      return { ok: false, code: ErrorCode.Internal, message: err.message };
    }

    return { ok: false, code: ErrorCode.Internal, message: "Access denied" };
  }

  private toMessageSummary(
    message: Message,
  ): ConversationsSchemas.MessageSummary {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      kind: message.kind,
      text: message.body,
      metadata: message.metadata ?? undefined,
      createdAt: message.createdAt.toISOString(),
      ...(message.deletedAt
        ? { deletedAt: message.deletedAt.toISOString() }
        : {}),
      ...(message.clientMessageId
        ? { clientMessageId: message.clientMessageId }
        : {}),
    } as ConversationsSchemas.MessageSummary;
  }

  private toBroadcastSummary(
    event: MessageSentEvent,
  ): ConversationsSchemas.MessageSummary {
    // A post-reference send is rejected unless the referenced listing is
    // active, so a freshly sent card is always available.
    const metadata =
      event.messageKind === "post_ref" && event.messageMetadata
        ? { ...event.messageMetadata, available: true }
        : event.messageMetadata;
    return {
      id: event.messageId,
      conversationId: event.conversationId,
      senderId: event.senderId,
      kind: event.messageKind,
      text: event.messageBody,
      ...(metadata ? { metadata } : {}),
      createdAt: event.sentAt,
      ...(event.messageDeletedAt ? { deletedAt: event.messageDeletedAt } : {}),
      ...(event.clientMessageId
        ? { clientMessageId: event.clientMessageId }
        : {}),
    } as ConversationsSchemas.MessageSummary;
  }

  private getRoomCount(userId: string, room: string): number {
    return this.userRoomCounts.get(userId)?.get(room) ?? 0;
  }

  private incrementRoomCount(userId: string, room: string): void {
    const rooms = this.userRoomCounts.get(userId) ?? new Map<string, number>();
    rooms.set(room, (rooms.get(room) ?? 0) + 1);
    this.userRoomCounts.set(userId, rooms);
  }

  private decrementRoomCount(userId: string, room: string): number {
    const rooms = this.userRoomCounts.get(userId);
    if (!rooms) return 0;

    const count = (rooms.get(room) ?? 1) - 1;
    if (count <= 0) {
      rooms.delete(room);
      if (rooms.size === 0) {
        this.userRoomCounts.delete(userId);
      }
      return 0;
    }

    rooms.set(room, count);
    return count;
  }

  private trackSocketRoom(socketId: string, room: string): void {
    const rooms = this.socketRooms.get(socketId) ?? new Set<string>();
    rooms.add(room);
    this.socketRooms.set(socketId, rooms);
  }

  private untrackSocketRoom(socketId: string, room: string): void {
    const rooms = this.socketRooms.get(socketId);
    if (!rooms) return;

    rooms.delete(room);
    if (rooms.size === 0) {
      this.socketRooms.delete(socketId);
    }
  }

  private getSocketRooms(socketId: string): Set<string> {
    return this.socketRooms.get(socketId) ?? new Set<string>();
  }

  private clearSocketRooms(socketId: string): void {
    this.socketRooms.delete(socketId);
  }
}
