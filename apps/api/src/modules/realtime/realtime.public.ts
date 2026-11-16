export interface AuthenticatedSocketUser {
  sub: string;
  sid: string;
  phone: string | null;
  role: string;
}

declare module "socket.io" {
  interface SocketData {
    user?: AuthenticatedSocketUser;
  }
}

export const REALTIME_NAMESPACE = process.env["SOCKET_IO_NAMESPACE"] || "/ws/chat";
export const USER_ROOM_PREFIX = "user:";
export const CONVERSATION_ROOM_PREFIX = "conversation:";

export function userRoom(userId: string): string {
  return `${USER_ROOM_PREFIX}${userId}`;
}

export function conversationRoom(conversationId: string): string {
  return `${CONVERSATION_ROOM_PREFIX}${conversationId}`;
}
