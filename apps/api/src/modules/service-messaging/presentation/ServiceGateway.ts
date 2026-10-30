import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { OnEvent } from "@nestjs/event-emitter";
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer, type OnGatewayInit } from "@nestjs/websockets";
import type { Namespace, Socket } from "socket.io";
import { z } from "zod";

import { SERVICE_MESSAGING_PORT, type ServiceMessagingPort, type ServiceSubject } from "../domain/ports/ServiceMessagingPort";
import { ServiceDenied } from "../domain/serviceAccess";

import { ServiceRealtimeProtocol } from "./ServiceRealtimeProtocol";

type Watch = { id: string; subject: ServiceSubject };
@Injectable()
@WebSocketGateway({ namespace: "/ws/services" })
export class ServiceGateway implements OnGatewayInit {
 @WebSocketServer() server!: Namespace;
 private readonly watching = new Map<string, Watch>();
 constructor(@Inject(JwtService) private readonly jwt: JwtService, @Inject(SERVICE_MESSAGING_PORT) private readonly services: ServiceMessagingPort) {}
 afterInit(server: Namespace): void {
  server.use((socket, next) => {
   try {
    const token: unknown = socket.handshake.auth["token"];
    if (typeof token !== "string") throw new Error("Missing token");
    const payload = this.jwt.verify<{ sub?: string; sid?: string }>(token);
    if (!payload.sub || !payload.sid) throw new Error("Missing Session");
    socket.data["serviceSubject"] = { userId: payload.sub, sessionId: payload.sid };
    next();
   } catch { next(new Error("Service access unavailable")); }
  });
 }
 handleDisconnect(socket: Socket): void { this.watching.delete(socket.id); }
 @SubscribeMessage("service:watch")
 async watch(@ConnectedSocket() socket: Socket, @MessageBody() value: unknown) {
  this.watching.delete(socket.id);
  try {
   const { conversationId } = z.object({ conversationId: z.string().uuid() }).parse(value);
   const subject = socket.data["serviceSubject"] as ServiceSubject | undefined;
   if (!subject) throw new ServiceDenied("NO_ACCESS");
   const current = await this.services.read(subject, conversationId, 0, 1);
   this.watching.set(socket.id, { id: conversationId, subject });
   return { ok: true, conversationId, lastSequence: current.lastSequence };
  } catch { return { ok: false, code: "NO_ACCESS" }; }
 }
 @OnEvent("service.changed", { async: true })
 async changed(id: string): Promise<void> {
  if (!this.server) return;
  for (const [socketId, watch] of this.watching) {
   if (watch.id !== id) continue;
   const socket = this.server.sockets.get(socketId);
   if (!socket) { this.watching.delete(socketId); continue; }
   try {
    // Capability, Session, assignment, lifecycle and audience are current at
    // delivery. No room-wide broadcast can bypass this check.
    const current = await this.services.read(watch.subject, id, 0, 1);
    socket.emit("service:changed", ServiceRealtimeProtocol.changed.parse({ conversationId: id, lastSequence: current.lastSequence }));
   } catch { this.watching.delete(socketId); socket.emit("service:denied", { conversationId: id }); }
  }
 }
}
