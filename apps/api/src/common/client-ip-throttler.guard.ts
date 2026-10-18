import { Injectable, Logger } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

import { requestLogPath } from "./requestLogging";
import { resolveClientIpDetails, type ClientIpRequest } from "./client-ip";

/** One warning per window keeps a missing edge header visible without flooding logs. */
const PEER_FALLBACK_WARNING_INTERVAL_MS = 10 * 60_000;

/**
 * The global rate limit, keyed on the caller instead of the proxy hop. Behind
 * Railway's edge `req.ip` is the proxy, so every visitor would share one
 * bucket; the key comes from the same trusted source as the Sign-in Code budget.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(ClientIpThrottlerGuard.name);
  private lastPeerFallbackWarning = Number.NEGATIVE_INFINITY;

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const { ip, fellBackToPeer } = resolveClientIpDetails(req as ClientIpRequest);
    if (fellBackToPeer) this.warnPeerFallback(ip, req["url"]);
    return Promise.resolve(ip);
  }

  /**
   * Every request without the trusted header shares the peer's bucket, so a
   * misconfigured ingress would otherwise show up only as locked-out callers.
   * The path tells that apart from expected private callers (admin, health
   * checks), which send no header.
   */
  private warnPeerFallback(peer: string, url: unknown): void {
    const now = Date.now();
    if (now - this.lastPeerFallbackWarning < PEER_FALLBACK_WARNING_INTERVAL_MS) return;
    this.lastPeerFallbackWarning = now;
    this.logger.warn(
      {
        event: "client_ip.peer_fallback",
        peer,
        path: typeof url === "string" ? requestLogPath(url) : undefined,
      },
      "Trusted client IP header missing or invalid; rate limits count this request against the peer address (ADR-0078)",
    );
  }
}
