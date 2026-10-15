import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import supertest from "supertest";
import { JwtAuthGuard } from "../../../common/jwt-auth.guard";
import { DiagnosticIntakeController } from "./DiagnosticIntakeController";

describe("diagnostic intake HTTP", () => {
  let app: NestFastifyApplication;
  let request: ReturnType<typeof supertest>;
  let jwt: JwtService;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "synthetic-diagnostic-intake-907" })],
      controllers: [DiagnosticIntakeController],
      providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
    }).compile();
    jwt = module.get(JwtService);
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.listen(0, "127.0.0.1");
    request = supertest(app.getHttpServer());
  });
  afterAll(async () => { await app?.close(); });

  it("reports an unavailable center without advertising invented price or equipment", async () => {
    const result = await request.get("/api/v1/diagnostics/availability").expect(200);
    expect(result.body).toEqual({ available: false });
  });

  it("refuses requests until operational center readiness is explicitly recorded", async () => {
    const result = await request.post("/api/v1/diagnostics/orders")
      .set("authorization", `Bearer ${jwt.sign({ sub: "buyer-a", sid: "current-session" })}`)
      .send({ audience: "buyer_private", requestKey: "synthetic-request" }).expect(403);
    expect(result.body.code).toBe("DIAGNOSTIC_SERVICE_UNAVAILABLE");
  });

  it("does not disclose whether another customer's private inspection exists", async () => {
    const result = await request.get("/api/v1/diagnostics/orders/9a758b7a-2c3c-41df-88a6-a996b010e611")
      .set("authorization", `Bearer ${jwt.sign({ sub: "buyer-b", sid: "current-session" })}`).expect(403);
    expect(result.body.code).toBe("DIAGNOSTIC_NO_ACCESS");
  });

  it("does not treat a marketplace admin token as center template authority", async () => {
    const result = await request.get("/api/v1/diagnostics/centers/9a758b7a-2c3c-41df-88a6-a996b010e611/templates")
      .set("authorization", `Bearer ${jwt.sign({ sub: "marketplace-admin", sid: "current-session", role: "admin" })}`).expect(403);
    expect(result.body.code).toBe("DIAGNOSTIC_NO_ACCESS");
  });
});
