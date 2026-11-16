import { describe, it, expect, vi } from "vitest";
import type { Namespace, Socket } from "socket.io";

import { RealtimeGateway } from "./RealtimeGateway";
import { SocketAuthMiddleware } from "./SocketAuthMiddleware";
import { SocketConnectionRegistry } from "./SocketConnectionRegistry";
import { userRoom } from "../realtime.public";

function buildSocket(overrides: {
  id?: string;
  user?: { sub: string } | null;
} = {}): Socket {
  return {
    id: overrides.id ?? "socket-1",
    data: overrides.user === null ? {} : { user: overrides.user ?? { sub: "user-1" } },
    join: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as Socket;
}

function buildGateway(): {
  gateway: RealtimeGateway;
  middleware: SocketAuthMiddleware;
  registry: SocketConnectionRegistry;
} {
  const middleware = {
    use: vi.fn(),
  } as unknown as SocketAuthMiddleware;
  const registry = new SocketConnectionRegistry();
  const gateway = new RealtimeGateway(middleware, registry);
  return { gateway, middleware, registry };
}

describe("RealtimeGateway", () => {
  it("registers the auth middleware when initialized", () => {
    const { gateway, middleware } = buildGateway();
    const server = { use: vi.fn() } as unknown as Namespace;

    gateway.afterInit(server);

    expect(server.use).toHaveBeenCalledOnce();
    expect(middleware.use).not.toHaveBeenCalled();
  });

  it("leaves namespace shutdown to the Nest Socket.IO adapter", () => {
    const { gateway } = buildGateway();

    expect("onApplicationShutdown" in gateway).toBe(false);
  });

  it("joins the user room and registers the socket on connection", () => {
    const { gateway, registry } = buildGateway();
    const socket = buildSocket({ id: "socket-1", user: { sub: "user-1" } });

    gateway.handleConnection(socket);

    expect(socket.join).toHaveBeenCalledWith(userRoom("user-1"));
    expect(registry.isUserOnline("user-1")).toBe(true);
    expect(registry.getSocketCountForUser("user-1")).toBe(1);
  });

  it("disconnects a socket that has no authenticated user", () => {
    const { gateway, registry } = buildGateway();
    const socket = buildSocket({ user: null });

    gateway.handleConnection(socket);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(registry.getOnlineUserCount()).toBe(0);
  });

  it("unregisters the socket on disconnect", () => {
    const { gateway, registry } = buildGateway();
    const socket = buildSocket({ id: "socket-1", user: { sub: "user-1" } });

    gateway.handleConnection(socket);
    expect(registry.isUserOnline("user-1")).toBe(true);

    gateway.handleDisconnect(socket);
    expect(registry.isUserOnline("user-1")).toBe(false);
  });
});
