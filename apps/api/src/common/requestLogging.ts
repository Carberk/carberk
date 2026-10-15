import type { Options } from "pino-http";

import { readClientIpPolicy } from "./client-ip";

/**
 * Request headers that carry credentials. pino-http logs every request
 * header by default, so without this a bearer token, a refresh cookie or a
 * reviewer secret would land in the hosting provider's logs.
 */
const SECRET_HEADER_PATHS = [
  "req.headers.authorization",
  'req.headers["x-measurement-guest"]',
  'req.headers["x-measurement-synthetic"]',
  "req.headers.cookie",
  'req.headers["x-app-install-id"]',
  'req.headers["proxy-authorization"]',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
];

/**
 * Endpoints that issue a sign-in code. The privacy policy deletes their
 * records — including the request IP — after 30 days, and the hosting log
 * outlives that, so these log lines carry neither the remote address nor
 * the headers a proxy puts the client IP into.
 */
const SIGN_IN_CODE_PATHS = new Set([
  "/api/v1/auth/otp/request",
  "/api/v1/account-deletion/request",
  "/api/v1/me/sign-in-methods/request",
  "/api/v1/me/contact-phones/request",
]);

const FORWARDING_HEADERS = ["x-real-ip", "x-forwarded-for", "forwarded"];

/**
 * Options for the API's HTTP request logger (`LoggerModule.forRoot`).
 * `clientIpHeader` is the header the deployment reads the client IP from
 * (`CLIENT_IP_HEADER`), so a sign-in code line drops it even when it is not
 * one of the usual forwarding headers.
 */
export function requestLoggingOptions(
  level: string,
  clientIpHeader: string | null = readClientIpPolicy().header,
): Options {
  const ipHeaders = new Set(FORWARDING_HEADERS);
  if (clientIpHeader) ipHeaders.add(clientIpHeader.toLowerCase());
  return {
    level,
    redact: { paths: SECRET_HEADER_PATHS, censor: "[Redacted]" },
    // Search terms and other query values are not logged: the path is
    // enough to trace a request, and Recent searches stay on the device.
    // Under Nest's Fastify middleware the parsed query also arrives as its
    // own `query` field, so both go.
    serializers: {
      req(req: {
        url?: string;
        query?: unknown;
        remoteAddress?: string;
        remotePort?: number;
        headers?: Record<string, unknown>;
      }) {
        if (typeof req.url === "string") req.url = req.url.split("?")[0] ?? req.url;
        delete req.query;
        if (SIGN_IN_CODE_PATHS.has(req.url ?? "")) {
          delete req.remoteAddress;
          delete req.remotePort;
          if (req.headers) {
            req.headers = Object.fromEntries(
              Object.entries(req.headers).filter(([name]) => !ipHeaders.has(name.toLowerCase())),
            );
          }
        }
        return req;
      },
    },
  };
}
