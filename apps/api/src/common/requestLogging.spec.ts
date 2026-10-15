import "reflect-metadata";

import { Writable } from "node:stream";

import { Controller, Get, Post } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { LoggerModule } from "nestjs-pino";
import supertest from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { requestLoggingOptions } from "./requestLogging";

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.secret-access-token";

@Controller("api/v1")
class ProbeController {
  @Get("listings")
  listings() {
    return { items: [] };
  }

  @Get("me")
  me() {
    return { ok: true };
  }

  @Post("auth/otp/request")
  requestSignInCode() {
    return { ok: true };
  }

  @Post("account-deletion/request")
  requestDeletionCode() {
    return { ok: true };
  }

  @Post("me/sign-in-methods/request")
  requestSignInMethodCode() {
    return { ok: true };
  }

  @Post("me/contact-phones/request")
  requestContactPhoneCode() {
    return { ok: true };
  }
}

describe("API request logging", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  /**
   * Logs one request through the stack the API runs: `LoggerModule` on Nest's
   * Fastify adapter, whose middleware layer hands pino the parsed query as
   * well as the URL.
   */
  async function logOneRequest(
    headers: Record<string, string>,
    path = "/api/v1/me",
    method: "get" | "post" = "get",
    clientIpHeader: string | null = "x-real-ip",
  ): Promise<string> {
    const lines: string[] = [];
    const out = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule.forRoot({ pinoHttp: [requestLoggingOptions("info", clientIpHeader), out] })],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.getHttpAdapter().getInstance().addHook("onSend", async (_req, reply) => {
      reply.header("set-cookie", "refresh=secret-refresh-cookie");
    });
    await app.listen(0, "127.0.0.1");

    await supertest(app.getHttpServer())[method](path).set(headers).expect(method === "get" ? 200 : 201);
    return lines.join("");
  }

  it("logs the path of a search without its query string or its parsed query", async () => {
    const log = await logOneRequest({}, "/api/v1/listings?q=toyota+camry+secret-search&limit=20");

    expect(log).toContain('"url":"/api/v1/listings"');
    expect(log).not.toContain("secret-search");
    expect(log).not.toContain("limit");
    expect(log).not.toContain('"query"');
  });

  it("redacts the scoped guest association credential from every request log", async () => {
    const log = await logOneRequest({ "x-measurement-guest": "mg_scoped-guest-secret-sentinel" });
    expect(log).not.toContain("scoped-guest-secret-sentinel");
  });

  it("never retains the raw app-install identifier in request logs", async () => {
    const log = await logOneRequest({ "x-app-install-id": "raw-install-sentinel" });
    expect(log).not.toContain("raw-install-sentinel");
  });

  it("never writes a bearer token, a cookie or a set-cookie to the log", async () => {
    const log = await logOneRequest({
      authorization: `Bearer ${TOKEN}`,
      cookie: "session=secret-cookie",
    });

    expect(log).toContain("/api/v1/me");
    expect(log).toContain("[Redacted]");
    expect(log).not.toContain("secret-access-token");
    expect(log).not.toContain("secret-cookie");
    expect(log).not.toContain("secret-refresh-cookie");
  });

  it.each([
    "/api/v1/auth/otp/request",
    "/api/v1/account-deletion/request",
    "/api/v1/me/sign-in-methods/request",
    "/api/v1/me/contact-phones/request",
  ])("keeps the request IP and its forwarding headers out of the log line of %s", async (path) => {
    const log = await logOneRequest(
      {
        "x-real-ip": "sentine1-real-ip",
        "x-forwarded-for": "sentine1-forwarded-for",
        forwarded: "for=sentine1-forwarded",
      },
      path,
      "post",
    );

    expect(log).toContain(path);
    expect(log).not.toContain("sentine1-real-ip");
    expect(log).not.toContain("sentine1-forwarded-for");
    expect(log).not.toContain("sentine1-forwarded");
    expect(log).not.toContain("remoteAddress");
    expect(log).not.toContain("remotePort");
  });

  it("also drops the header the deployment is configured to read the client IP from", async () => {
    const log = await logOneRequest(
      { "cf-connecting-ip": "sentine1-configured-ip" },
      "/api/v1/auth/otp/request",
      "post",
      "cf-connecting-ip",
    );

    expect(log).toContain("/api/v1/auth/otp/request");
    expect(log).not.toContain("sentine1-configured-ip");
  });

  it("still logs the request IP for requests that issue no sign-in code", async () => {
    const log = await logOneRequest({ "x-real-ip": "sentine1-real-ip" });

    expect(log).toContain("remoteAddress");
    expect(log).toContain("sentine1-real-ip");
  });
});
