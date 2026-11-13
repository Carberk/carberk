import { createHmac, timingSafeEqual } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { normalizeIp, verifiedGatewayIp, type ClientIpRequest } from "./client-ip";

const PROOF_HEADER = "x-carberk-client-proof";
const MAX_AGE_MS = 30_000;
const FUTURE_SKEW_MS = 5_000;
// Covers a proof accepted at the earliest allowed future timestamp.
export const GATEWAY_NONCE_TTL_MS = MAX_AGE_MS + FUTURE_SKEW_MS + 1;

export const gatewayKeysEnvSchema = z.string().default("{}").transform((value, ctx) => {
  try {
    const keys = z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/), z.string().regex(/^[0-9a-f]{64}$/))
      .refine((entries) => Object.keys(entries).length <= 4).parse(JSON.parse(value));
    return keys;
  } catch {
    ctx.addIssue({ code: "custom", message: "Use a JSON object of up to four key IDs and 32-byte lowercase hex secrets" });
    return z.NEVER;
  }
});

interface AttributionOptions {
  keys: Record<string, string>;
  /** Atomic, shared across API instances/restarts. False means already used. */
  claimNonce: (key: string) => Promise<boolean>;
  now?: () => number;
}

/** Runs before body parsing, guards and controllers; a proof never grants API permission. */
export function registerGatewayAttributionHook(
  app: FastifyInstance,
  { keys, claimNonce, now = Date.now }: AttributionOptions,
): void {
  app.addHook("onRequest", async (req, reply) => {
    const proofNames = Object.keys(req.headers).filter((name) => name.startsWith("x-carberk-client-"));
    if (!proofNames.length) return; // Direct Railway ingress keeps its existing policy.
    const deny = () => reply.code(403).send({ code: "INVALID_GATEWAY_PROOF" });
    const proof = req.headers[PROOF_HEADER];
    if (proofNames.length !== 1 || typeof proof !== "string" || proof.length > 512) return deny();
    const parts = /^(v1)\.([a-zA-Z0-9_-]{1,32})\.(\d{13})\.([0-9a-f]{32})\.([A-Za-z0-9_-]{2,64})\.([0-9a-f]{64})$/.exec(proof);
    if (!parts) return deny();
    const keyId = parts[2] ?? "";
    const timestamp = parts[3] ?? "";
    const nonce = parts[4] ?? "";
    const encodedIp = parts[5] ?? "";
    const signature = parts[6] ?? "";
    const secret = Object.hasOwn(keys, keyId) ? keys[keyId] : undefined;
    const age = now() - Number(timestamp);
    const ip = Buffer.from(encodedIp, "base64url").toString("utf8");
    const normalizedIp = normalizeIp(ip);
    if (!secret || age > MAX_AGE_MS || age < -FUTURE_SKEW_MS
      || Buffer.from(ip).toString("base64url") !== encodedIp || !normalizedIp) return deny();
    const unsigned = proof.slice(0, proof.lastIndexOf("."));
    const expected = createHmac("sha256", Buffer.from(secret, "hex"))
      .update(`${unsigned}\n${req.method}\n${req.raw.url}`).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return deny();
    try {
      if (!await claimNonce(`carberk:gateway-proof:v1:${keyId}:${nonce}`)) return deny();
    } catch {
      return reply.code(503).send({ code: "GATEWAY_PROOF_UNAVAILABLE" });
    }
    (req as ClientIpRequest)[verifiedGatewayIp] = normalizedIp;
  });
}
