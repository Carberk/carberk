import { isIP } from "node:net";

import { z } from "zod";

/**
 * Which address the API treats as the caller's (ADR-0078).
 *
 * `x-forwarded-for` is the one header read as a list, because every proxy
 * appends the address it received the request from. With `trustedHops` proxies
 * of ours in front, the entry that many places from the right is the client as
 * the outermost of them saw it. Entries further left arrive from the caller
 * and are never read. Any other header holds exactly one address, written by
 * the edge.
 * `header: null` trusts no header and uses the peer address.
 */
export interface ClientIpPolicy {
  header: string | null;
  trustedHops: number;
}

/** Environment fields that configure the policy, shared with `env.schema.ts`. */
export const clientIpEnvShape = {
  /** Railway's edge sets `X-Real-IP` to the client address. `none` trusts no header. */
  CLIENT_IP_HEADER: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "CLIENT_IP_HEADER must be an HTTP header name or none",
    )
    .default("x-real-ip"),
  /** Proxies we run that append to `x-forwarded-for`; read only for that header. */
  CLIENT_IP_TRUSTED_HOPS: z.coerce.number().int().min(1).max(10).default(1),
};

const clientIpEnvSchema = z.object(clientIpEnvShape);

/** Used when the configuration is invalid: trust nothing a caller can send. */
const PEER_ONLY: ClientIpPolicy = { header: null, trustedHops: 1 };

/**
 * The policy from `process.env`, parsed once. `env.schema.ts` validates the
 * same fields at boot, so this agrees with the running configuration.
 */
let processPolicy: ClientIpPolicy | undefined;

function processClientIpPolicy(): ClientIpPolicy {
  processPolicy ??= readClientIpPolicy();
  return processPolicy;
}

export function readClientIpPolicy(
  env: Record<string, string | undefined> = process.env,
): ClientIpPolicy {
  const parsed = clientIpEnvSchema.safeParse({
    CLIENT_IP_HEADER: env["CLIENT_IP_HEADER"],
    CLIENT_IP_TRUSTED_HOPS: env["CLIENT_IP_TRUSTED_HOPS"],
  });
  if (!parsed.success) return PEER_ONLY;

  const { CLIENT_IP_HEADER: header, CLIENT_IP_TRUSTED_HOPS: trustedHops } = parsed.data;
  return { header: header === "none" ? null : header, trustedHops };
}

export const verifiedGatewayIp = Symbol("verifiedGatewayIp");

/** The parts of a Fastify request that carry the address. */
export interface ClientIpRequest {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  [verifiedGatewayIp]?: string;
}

const FORWARDED_FOR = "x-forwarded-for";
/** An IPv4-mapped IPv6 address after URL serialisation, e.g. `::ffff:cb00:7107`. */
const IPV4_MAPPED = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

/**
 * A single IP address in one form per address, or null, so equivalent
 * spellings share a bucket. IPv6 is serialised as RFC 5952 (lowercase, zeros
 * compressed) and an IPv4-mapped IPv6 address becomes the IPv4 address. Zone
 * ids and ports are refused.
 */
export function normalizeIp(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.includes("%")) return null;

  const family = isIP(candidate);
  if (family === 4) return candidate;
  if (family !== 6) return null;

  // The WHATWG URL serialiser writes the RFC 5952 form of an IPv6 host.
  const canonical = new URL(`http://[${candidate}]/`).hostname.slice(1, -1);
  const mapped = IPV4_MAPPED.exec(canonical);
  if (!mapped) return canonical;

  const [high, low] = [mapped[1], mapped[2]].map((group) => parseInt(group ?? "0", 16)) as [
    number,
    number,
  ];
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

function trustedHeaderIp(
  headers: NonNullable<ClientIpRequest["headers"]>,
  policy: ClientIpPolicy & { header: string },
): string | null {
  const raw = headers[policy.header];

  if (policy.header === FORWARDED_FOR) {
    const entries = (Array.isArray(raw) ? raw.join(",") : (raw ?? ""))
      .split(",")
      .map((entry) => entry.trim());
    return normalizeIp(entries[entries.length - policy.trustedHops]);
  }

  // A repeated header is ambiguous, so it names no client.
  return typeof raw === "string" ? normalizeIp(raw) : null;
}

/** The address `resolveClientIp` returns, and whether it is the fallback. */
export interface ResolvedClientIp {
  ip: string;
  /**
   * True when a trusted header is configured but was missing or unusable, so
   * the request is counted against the peer (the proxy hop) instead.
   */
  fellBackToPeer: boolean;
}

/**
 * The caller's IP address and whether it is the peer fallback. The throttler
 * uses it to report a missing edge header; everything else needs only
 * `resolveClientIp`.
 */
export function resolveClientIpDetails(
  req: ClientIpRequest,
  policy: ClientIpPolicy = processClientIpPolicy(),
): ResolvedClientIp {
  if (req[verifiedGatewayIp]) return { ip: req[verifiedGatewayIp], fellBackToPeer: false };
  const peer = normalizeIp(req.ip) ?? "unknown";
  // Unverified proof metadata must never fall through to a trusted header.
  if (Object.keys(req.headers ?? {}).some((name) => name.startsWith("x-carberk-client-"))) {
    return { ip: peer, fellBackToPeer: true };
  }
  if (policy.header === null) return { ip: peer, fellBackToPeer: false };

  const trusted = req.headers
    ? trustedHeaderIp(req.headers, { ...policy, header: policy.header })
    : null;
  return trusted === null
    ? { ip: peer, fellBackToPeer: true }
    : { ip: trusted, fellBackToPeer: false };
}

/**
 * The caller's IP address for rate limiting. The single source for the Sign-in
 * Code per-IP budgets and the global throttler, so a caller cannot pick its own
 * bucket by sending a header the edge does not set. A missing or malformed
 * trusted header falls back to the peer address (the proxy hop when one is in
 * front), which shares a bucket rather than trusting the caller.
 */
export function resolveClientIp(
  req: ClientIpRequest,
  policy: ClientIpPolicy = processClientIpPolicy(),
): string {
  return resolveClientIpDetails(req, policy).ip;
}
