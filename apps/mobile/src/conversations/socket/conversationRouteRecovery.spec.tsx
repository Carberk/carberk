import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import * as SecureStore from "expo-secure-store";

import { server } from "../../../test/msw";
import { clearAuthSession, storeAuthSession } from "../../auth/session";
import { provisionGatewayKey, selectTesterRoute } from "../../api/routes";
import { useConversationMessages } from "../../api/conversations/useConversationMessages";
import { useUnreadCount } from "../../api/conversations/useUnreadCount";

import { useConversationSocket } from "./useConversationSocket";
import { useGlobalConversationSocket } from "./useGlobalConversationSocket";

const network = vi.hoisted(() => ({
  sockets: [] as Array<{ url: string; options: Record<string, unknown>; connected: boolean; disconnect: () => void }>,
  sent: [] as Array<{ conversationId: string; text: string; clientMessageId: string }>,
  onSend: null as null | ((message: { conversationId: string; text: string; clientMessageId: string }) => void),
  reads: [] as string[],
  onRead: null as null | (() => void),
}));

vi.mock("socket.io-client", () => ({
  io: (url: string, options: Record<string, unknown>) => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const socket = {
      url,
      options,
      connected: false,
      on(event: string, handler: (...args: unknown[]) => void) { handlers.set(event, handler); },
      disconnect() {
        if (this.connected) { this.connected = false; handlers.get("disconnect")?.(); }
      },
      emit(event: string, payload: { conversationId: string; text: string; clientMessageId: string }, ack?: (value: unknown) => void) {
        if (event === "conversation:join") ack?.({ ok: true, conversationId: payload.conversationId, room: `conversation:${payload.conversationId}` });
        if (event === "message:send") { network.sent.push(payload); network.onSend?.(payload); }
        if (event === "conversation:read") { network.reads.push(payload.conversationId); network.onRead?.(); ack?.({ ok: true, conversationId: payload.conversationId }); }
      },
    };
    network.sockets.push(socket);
    queueMicrotask(() => { socket.connected = true; handlers.get("connect")?.(); });
    return socket;
  },
}));

const globalEntry = "https://api-staging-2861.up.railway.app/api/v1";
const tmEntry = "https://tm-staging.bagtyyar.dev/api/v1";
const conversationId = "550e8400-e29b-41d4-a716-446655440001";
const senderId = "550e8400-e29b-41d4-a716-446655440002";
const messageId = "550e8400-e29b-41d4-a716-446655440003";
const gatewayKey = "synthetic-test-key-never-a-real-secret";
const storage = new Map<string, string>();

afterEach(async () => {
  await clearAuthSession();
  network.sockets.length = 0;
  network.sent.length = 0;
  network.reads.length = 0;
  network.onSend = null;
  network.onRead = null;
  storage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("reconciles missed history and unread state through the new entry after a lost send ACK", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__DEV__", true);
  vi.stubEnv("EXPO_PUBLIC_API_URL", globalEntry);
  vi.stubEnv("EXPO_PUBLIC_GATEWAY_TESTER", "true");
  vi.stubEnv("EXPO_PUBLIC_ENV", "staging");
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async key => storage.get(key) ?? null);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { storage.set(key, value); });
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { storage.delete(key); });
  selectTesterRoute("global");
  await provisionGatewayKey(gatewayKey);
  const claims = Buffer.from(JSON.stringify({ sub: senderId, sid: "session-a", iat: 1000, exp: 4600 })).toString("base64url");
  await storeAuthSession({
    user: { id: senderId, phone: "+99361000001", email: null, displayName: null, role: "buyer" },
    accessToken: `e30.${claims}.sig`, refreshToken: "refresh-a",
  });
  let committed: null | { id: string; conversationId: string; senderId: string; kind: "text"; text: string; clientMessageId: string; createdAt: string } = null;
  let read = false;
  network.onRead = () => { read = true; };
  network.onSend = payload => {
    committed = { id: messageId, conversationId, senderId, kind: "text", text: payload.text,
      clientMessageId: payload.clientMessageId, createdAt: "2026-11-16T12:00:00.000Z" };
  };
  const requests: Array<{ entry: string; key: string | null; bearer: string | null }> = [];
  for (const [entry, base] of [["global", globalEntry], ["tm", tmEntry]] as const) {
    server.use(
      http.get(`${base}/conversations/${conversationId}/messages`, ({ request }) => {
        requests.push({ entry, key: request.headers.get("x-carberk-gateway-key"), bearer: request.headers.get("authorization") });
        return HttpResponse.json({ items: entry === "tm" && committed ? [committed] : [], nextCursor: null });
      }),
      http.get(`${base}/conversations/unread-count`, () => HttpResponse.json({ count: entry === "tm" && committed && !read ? 1 : 0 })),
    );
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = await renderHook(() => {
    useGlobalConversationSocket();
    return { messages: useConversationMessages({ conversationId }), unread: useUnreadCount(), socket: useConversationSocket(conversationId, senderId) };
  }, { wrapper });
  await waitFor(() => expect(hook.result.current.messages.data?.pages[0]?.items).toEqual([]));
  await waitFor(() => expect(network.sockets.length).toBe(1));
  await waitFor(() => expect(hook.result.current.socket.status).toBe("connected"));

  let pending!: ReturnType<typeof hook.result.current.socket.sendTextMessage>;
  await act(async () => { pending = hook.result.current.socket.sendTextMessage({ conversationId, text: "Durable once", clientMessageId: "same-client-id" }); });
  expect(network.sent).toEqual([{ conversationId, kind: "text", text: "Durable once", clientMessageId: "same-client-id" }]);
  await act(async () => { selectTesterRoute("tm"); });
  expect(await pending).toMatchObject({ ok: false, code: "ACK_UNKNOWN" });
  await waitFor(() => expect(network.sockets.map(socket => socket.url)).toHaveLength(2));
  await waitFor(() => expect(hook.result.current.messages.data?.pages[0]?.items).toEqual([committed]));
  await waitFor(() => expect(network.reads).toContain(conversationId));
  await waitFor(() => expect(hook.result.current.unread).toBe(0));
  expect(network.sockets.map(socket => socket.url)).toEqual([
    "ws://localhost:3006/ws/chat", "https://tm-staging.bagtyyar.dev/ws/chat",
  ]);
  expect(network.sent).toHaveLength(1);
  expect(requests).toEqual([
    { entry: "global", key: null, bearer: `Bearer e30.${claims}.sig` },
    { entry: "tm", key: gatewayKey, bearer: `Bearer e30.${claims}.sig` },
  ]);
  await hook.unmount();
  expect(network.sockets[1]?.connected).toBe(false);
  client.clear();
});
