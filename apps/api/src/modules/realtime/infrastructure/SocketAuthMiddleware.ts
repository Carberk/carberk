import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Socket } from "socket.io";

import type { AuthenticatedSocketUser } from "../realtime.public";

import { REALTIME_ERROR_CODES } from "../domain/types";

interface SocketAuthError extends Error {
  data: Record<string, unknown>;
}

function middlewareError(
  message: string,
  data: Record<string, unknown>,
): SocketAuthError {
  const err = new Error(message) as SocketAuthError;
  err.data = data;
  return err;
}

const BEARER_PREFIX = "Bearer ";

@Injectable()
export class SocketAuthMiddleware {
  constructor(
    @Inject(JwtService)
    private readonly jwtService: JwtService,
  ) {}

  use(socket: Socket, next: (err?: Error) => void): void {
    const token = this.extractToken(socket);
    if (!token) {
      next(middlewareError("Missing authentication token", {
        code: REALTIME_ERROR_CODES.MISSING_AUTH_TOKEN,
      }));
      return;
    }

    try {
      const payload = this.jwtService.verify<AuthenticatedSocketUser>(token);
      if (!payload.sub) {
        next(middlewareError("Invalid authentication token payload", {
          code: REALTIME_ERROR_CODES.INVALID_TOKEN_PAYLOAD,
        }));
        return;
      }
      socket.data.user = payload;
      next();
    } catch {
      next(middlewareError("Invalid or expired authentication token", {
        code: REALTIME_ERROR_CODES.INVALID_TOKEN,
      }));
    }
  }

  private extractToken(socket: Socket): string | undefined {
    const auth = socket.handshake.auth as { token?: string } | undefined;
    if (auth?.token) {
      return auth.token;
    }

    const header = socket.handshake.headers.authorization;
    if (typeof header === "string" && header.startsWith(BEARER_PREFIX)) {
      return header.slice(BEARER_PREFIX.length);
    }

    return undefined;
  }
}
