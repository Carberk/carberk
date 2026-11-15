import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { JwtAuthGuard } from "../../common/jwt-auth.guard";

import { RoutingPolicyModule } from "./routing-policy.module";

describe("routing policy HTTP contract", () => {
  it.each([false, true])("authenticated callers receive disable=%s with a bounded lifetime", async (disable) => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => ({ ROUTING_DISABLE_TM_PREFERENCE: disable })] }),
        JwtModule.register({ global: true, secret: "routing-policy-test-secret" }),
        RoutingPolicyModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
    }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    try {
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
      const server = app.getHttpAdapter().getInstance();
      const jwt = app.get(JwtService);
      const response = await server.inject({ method: "GET", url: "/api/v1/routing/policy",
        headers: { authorization: `Bearer ${jwt.sign({ sub: "synthetic-user" })}` } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ version: 1, disableTmPreference: disable, maxAgeSeconds: 60 });
      expect(response.headers["cache-control"]).toBe("private, no-store");
      for (const authorization of [undefined, "Bearer invalid", `Bearer ${jwt.sign({ sub: "synthetic-user" }, { expiresIn: -1 })}`]) {
        const denied = await server.inject({ method: "GET", url: "/api/v1/routing/policy",
          headers: authorization ? { authorization } : {} });
        expect(denied.statusCode).toBe(401);
        expect(denied.body).not.toContain("disableTmPreference");
      }
      const write = await server.inject({ method: "POST", url: "/api/v1/routing/policy",
        headers: { authorization: `Bearer ${jwt.sign({ sub: "synthetic-user" })}` }, payload: { disableTmPreference: !disable } });
      expect(write.statusCode).toBe(404);
    } finally { await app.close(); }
  });
});
