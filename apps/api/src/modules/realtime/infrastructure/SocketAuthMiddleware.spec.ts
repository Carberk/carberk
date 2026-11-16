import { describe, it, expect, vi } from "vitest";
import { JwtService } from "@nestjs/jwt";
import type { Socket } from "socket.io";

import { SocketAuthMiddleware } from "./SocketAuthMiddleware";

const SECRET = "test-secret-must-be-at-least-32-characters-long";

function buildSocket(overrides: {
  authToken?: string;
  header?: string;
} = {}): Socket {
  return {
    handshake: {
      auth: overrides.authToken ? { token: overrides.authToken } : {},
      headers: overrides.header ? { authorization: overrides.header } : {},
    },
    data: {},
  } as unknown as Socket;
}

function buildMiddleware(secret = SECRET): {
  middleware: SocketAuthMiddleware;
  jwtService: JwtService;
} {
  const jwtService = new JwtService({
    secret,
    signOptions: { expiresIn: "1h" },
  });
  const middleware = new SocketAuthMiddleware(jwtService);
  return { middleware, jwtService };
}

describe("SocketAuthMiddleware", () => {
  it("rejects a socket with no token", () => {
    const { middleware } = buildMiddleware();
    const socket = buildSocket();

    const next = vi.fn();
    middleware.use(socket, next);

    expect(next).toHaveBeenCalledOnce();
    const [err] = next.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Missing authentication token");
    expect(err.data).toEqual({ code: "MISSING_AUTH_TOKEN" });
  });

  it("rejects an invalid token", () => {
    const { middleware } = buildMiddleware();
    const socket = buildSocket({ authToken: "not-a-jwt" });

    const next = vi.fn();
    middleware.use(socket, next);

    const [err] = next.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Invalid or expired authentication token");
    expect(err.data).toEqual({ code: "INVALID_TOKEN" });
  });

  it("accepts a valid token from handshake auth and attaches the user", () => {
    const { middleware, jwtService } = buildMiddleware();
    const payload = { sub: "user-1", sid: "session-1", phone: "+99361234567", role: "user" };
    const token = jwtService.sign(payload);
    const socket = buildSocket({ authToken: token });

    const next = vi.fn();
    middleware.use(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.user).toMatchObject({ sub: "user-1", sid: "session-1", phone: "+99361234567", role: "user" });
  });

  it("accepts a valid token from the Authorization header", () => {
    const { middleware, jwtService } = buildMiddleware();
    const payload = { sub: "user-2", sid: "session-2", phone: null, role: "user" };
    const token = jwtService.sign(payload);
    const socket = buildSocket({ header: `Bearer ${token}` });

    const next = vi.fn();
    middleware.use(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.user).toMatchObject({ sub: "user-2", sid: "session-2", phone: null, role: "user" });
  });

  it("prefers handshake auth over the Authorization header", () => {
    const { middleware, jwtService } = buildMiddleware();
    const authPayload = { sub: "auth-user", sid: "s1", phone: "+99361234567", role: "user" };
    const headerPayload = { sub: "header-user", sid: "s2", phone: "+99361234568", role: "user" };
    const socket = buildSocket({
      authToken: jwtService.sign(authPayload),
      header: `Bearer ${jwtService.sign(headerPayload)}`,
    });

    const next = vi.fn();
    middleware.use(socket, next);

    expect(socket.data.user?.sub).toBe("auth-user");
  });

  it("rejects a token without a sub claim", () => {
    const { middleware, jwtService } = buildMiddleware();
    const token = jwtService.sign({ role: "user" });
    const socket = buildSocket({ authToken: token });

    const next = vi.fn();
    middleware.use(socket, next);

    const [err] = next.mock.calls[0]!;
    expect(err.message).toBe("Invalid authentication token payload");
    expect(err.data).toEqual({ code: "INVALID_TOKEN_PAYLOAD" });
  });
});
