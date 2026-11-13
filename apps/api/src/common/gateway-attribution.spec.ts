import { createHmac, randomBytes } from "node:crypto";

import { Controller, Get, Req } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { resolveClientIp } from "./client-ip";
import { ClientIpThrottlerGuard } from "./client-ip-throttler.guard";
import { gatewayKeysEnvSchema, registerGatewayAttributionHook } from "./gateway-attribution";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { Public } from "./public.decorator";

const secret = "ab".repeat(32);
const clock = 1_800_000_000_000;
const target = "/probe?x=a%2Fb&x=1+2";
function proof({ ip = "203.0.113.7", url = target, method = "GET", timestamp = clock,
  nonce = randomBytes(16).toString("hex"), keyId = "current", key = secret } = {}) {
  const unsigned = `v1.${keyId}.${timestamp}.${nonce}.${Buffer.from(ip).toString("base64url")}`;
  return `${unsigned}.${createHmac("sha256", Buffer.from(key, "hex")).update(`${unsigned}\n${method}\n${url}`).digest("hex")}`;
}

/** One shared fake for the atomic nonce-store boundary. */
class Nonces {
  private readonly seen = new Set<string>();
  async claim(key: string): Promise<boolean> {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }
}

@Controller()
class ProbeController {
  @Public()
  @Get("probe")
  probe(@Req() req: FastifyRequest) { return { ip: resolveClientIp(req) }; }

  @Get("protected")
  protected() { return { ok: true }; }
}

describe("gateway attribution ingress", () => {
  const apps: Array<{ close: () => Promise<unknown> }> = [];
  afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

  function ingress(keys: Record<string, string> = { current: secret }, nonces = new Nonces(), now = () => clock) {
    const app = Fastify();
    apps.push(app);
    registerGatewayAttributionHook(app, { keys, now, claimNonce: (key) => nonces.claim(key) });
    app.get("/probe", (req) => ({ ip: resolveClientIp(req) }));
    return app;
  }
  async function send(app: FastifyInstance, value: string, url = target) {
    return app.inject({ url, headers: { "x-real-ip": "198.51.100.1", "x-carberk-client-proof": value } });
  }

  it("uses a verified observed client instead of the relay IP, then rejects replay", async () => {
    const app = ingress();
    const value = proof();
    expect((await send(app, value)).json()).toEqual({ ip: "203.0.113.7" });
    expect((await send(app, value)).statusCode).toBe(403);
  });

  it.each([
    ["method", () => proof({ method: "PATCH" })],
    ["raw escaping", () => proof({ url: "/probe?x=a%2fb&x=1+2" })],
    ["raw query order", () => proof({ url: "/probe?x=1+2&x=a%2Fb" })],
    ["IP", () => proof().replace(Buffer.from("203.0.113.7").toString("base64url"), Buffer.from("203.0.113.8").toString("base64url"))],
    ["key ID", () => proof({ keyId: "unknown" })],
    ["signature", () => proof({ key: "cd".repeat(32) })],
    ["expired", () => proof({ timestamp: clock - 30_001 })],
    ["future", () => proof({ timestamp: clock + 5_001 })],
    ["invalid IP", () => proof({ ip: "203.0.113.7:80" })],
    ["malformed", () => "forged"],
    ["duplicate", () => `${proof()}, ${proof()}`],
  ])("rejects %s tampering without falling through to Railway identity", async (_name, make) => {
    expect((await send(ingress(), make())).statusCode).toBe(403);
  });

  it("accepts the bounded clock edges and canonicalizes equivalent IPs", async () => {
    const app = ingress();
    expect((await send(app, proof({ timestamp: clock - 30_000 }))).statusCode).toBe(200);
    expect((await send(app, proof({ timestamp: clock + 5_000, ip: "::ffff:203.0.113.7" }))).json()).toEqual({ ip: "203.0.113.7" });
  });

  it("shares replay claims across API instances and restarts, including simultaneous copies", async () => {
    const nonces = new Nonces();
    const value = proof();
    const statuses = await Promise.all([send(ingress(undefined, nonces), value), send(ingress(undefined, nonces), value)]);
    expect(statuses.map((r) => r.statusCode).sort()).toEqual([200, 403]);
    expect((await send(ingress(undefined, nonces), value)).statusCode).toBe(403);
  });

  it("supports overlapping rotation keys, and rejects removed or disabled keys", async () => {
    const oldProof = proof({ keyId: "previous", key: "cd".repeat(32) });
    const app = ingress({ current: secret, previous: "cd".repeat(32) });
    expect((await send(app, oldProof)).statusCode).toBe(200);
    expect((await send(app, proof())).statusCode).toBe(200);
    expect((await send(ingress(), oldProof)).statusCode).toBe(403);
    expect((await send(ingress({}), proof())).statusCode).toBe(403);
    expect((await ingress({}).inject({ url: target, headers: { "x-carberk-client-ip": "203.0.113.7" } })).statusCode).toBe(403);
  });

  it("fails closed when replay storage is unavailable while direct clients still work", async () => {
    const app = Fastify(); apps.push(app);
    registerGatewayAttributionHook(app, { keys: { current: secret }, now: () => clock, claimNonce: async () => { throw Error("private backend details"); } });
    app.get("/probe", (req) => ({ ip: resolveClientIp(req) }));
    const result = await send(app, proof());
    expect(result.statusCode).toBe(503);
    expect(result.body).not.toContain("private");
    expect((await app.inject({ url: target, headers: { "x-real-ip": "198.51.100.1" } })).json()).toEqual({ ip: "198.51.100.1" });
  });

  it("keeps direct and proxied clients independent through the real rate limiter and bearer guard", async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret }), ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1 }])],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: ClientIpThrottlerGuard }],
    }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter()); apps.push(app);
    const fastify = app.getHttpAdapter().getInstance() as FastifyInstance;
    const nonces = new Nonces();
    registerGatewayAttributionHook(fastify, { keys: { current: secret }, now: () => clock, claimNonce: (key) => nonces.claim(key) });
    await app.init(); await fastify.ready();
    for (const ip of ["203.0.113.7", "203.0.113.8"]) {
      expect((await send(fastify, proof({ ip }))).statusCode).toBe(200);
      expect((await send(fastify, proof({ ip }))).statusCode).toBe(429);
    }
    for (const ip of ["198.51.100.1", "198.51.100.2"]) {
      expect((await fastify.inject({ url: target, headers: { "x-real-ip": ip, "x-forwarded-for": "1.1.1.1", "cf-ipcountry": "TM" } })).statusCode).toBe(200);
      expect((await fastify.inject({ url: target, headers: { "x-real-ip": ip, "x-forwarded-for": "2.2.2.2", "cf-ipcountry": "US" } })).statusCode).toBe(429);
    }
    expect((await send(fastify, proof({ url: "/protected" }), "/protected")).statusCode).toBe(401);
  });

  it("validates secret configuration without echoing secret material", () => {
    for (const value of ['[]', '{"bad.id":"secret"}', '{"current":"private-invalid-key"}']) {
      const parsed = gatewayKeysEnvSchema.safeParse(value);
      expect(parsed.success).toBe(false);
      expect(JSON.stringify(parsed)).not.toContain("private-invalid-key");
    }
    expect(gatewayKeysEnvSchema.parse("{}")).toEqual({});
  });
});
