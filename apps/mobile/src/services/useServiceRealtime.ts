import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { z } from "zod";

import { useAuth } from "../auth/useAuth";
import { loadAuthSession } from "../auth/session";

import { serviceKeys } from "./api";

export function useServiceRealtime(id: string | null, denied: () => void) {
 const { userId, isAuthenticated } = useAuth(); const client = useQueryClient();
 useEffect(() => {
  if (!id || !userId || isAuthenticated !== true) return;
  const origin = new URL(process.env["EXPO_PUBLIC_WS_URL"] ?? "ws://localhost:3006/ws/chat"); origin.pathname = "/ws/services";
  let disposed = false;
  const socket = io(origin.toString(), { autoConnect: false, transports: ["websocket"], auth: callback => { void loadAuthSession().then(session => { if (!disposed && session?.user.id === userId) callback({ token: session.accessToken }); }); } });
  socket.on("connect", () => {
   // Durable HTTP state reconciles missed events on every connection.
   void client.invalidateQueries({ queryKey: serviceKeys.detail(userId, id) });
   socket.timeout(5000).emit("service:watch", { conversationId: id }, (error: Error | null, ack: { ok?: boolean } | undefined) => { if (!disposed && !error && ack?.ok !== true) denied(); });
  });
  socket.on("service:changed", (value: unknown) => {
   const event = z.object({ conversationId: z.string().uuid(), lastSequence: z.number().int() }).strict().safeParse(value);
   if (event.success && event.data.conversationId === id) void client.invalidateQueries({ queryKey: serviceKeys.detail(userId, id) });
  });
  socket.on("service:denied", () => { if (!disposed) denied(); });
  socket.connect();
  return () => { disposed = true; socket.removeAllListeners(); socket.disconnect(); };
 }, [id, userId, isAuthenticated, client, denied]);
}
