import { resolve } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

import { AuthController } from "./AuthController";
import { RequestOtp } from "../application/RequestOtp";
import { VerifyOtp } from "../application/VerifyOtp";
import { RefreshSession } from "../application/RefreshSession";
import { Logout } from "../application/Logout";
import { LogoutAll } from "../application/LogoutAll";
import { GlobalErrorFilter } from "../../../common/error.filter";
import { InMemoryOtpRequests } from "../application/testing/InMemoryOtpRequests";

const requestContext = vi.hoisted(() => ({ headers: new Headers() }));

// Only Next's request context is replaced. The admin client, cookie reader,
// network, API router, controller and Sign-in Code use case are real.
vi.mock("next/headers", () => ({
  headers: async () => requestContext.headers,
  cookies: async () => ({ get: () => undefined }),
}));

// Loading the UI bridge as a test fixture must not pull its DOM/Next types
// into the API's CommonJS production compilation. The path is absolute
// because Vitest resolves a computed import() against the module's
// root-relative id, from which a relative path cannot leave apps/api.
const adminClientPath = resolve(__dirname, "../../../../../admin/src/lib/api-client");
type AdminClient = {
  apiFetch(path: string, options: { method: string; body: unknown }): Promise<unknown>;
  ApiError: typeof Error;
};

describe("real admin-to-API sign-in routing", () => {
  let app: NestFastifyApplication;
  let origin: string;
  const now = () => new Date("2026-11-05T00:00:00Z");
  const requests = new InMemoryOtpRequests(now);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: RequestOtp,
          useValue: new RequestOtp(
            requests, { send: async () => undefined }, { now }, false,
            { enqueue: async () => undefined }, { enabled: false, accounts: [] },
            { compare: (candidate, expected) => candidate === expected },
          ),
        },
        ...[VerifyOtp, RefreshSession, Logout, LogoutAll].map((provide) => ({
          provide, useValue: {},
        })),
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    origin = await app.getUrl();
  });

  afterAll(async () => { await app?.close(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  beforeEach(() => {
    requests.records = [];
    requestContext.headers = new Headers();
    vi.stubEnv("CLIENT_IP_HEADER", "x-real-ip");
    vi.stubEnv("CLIENT_IP_TRUSTED_HOPS", "1");
    vi.stubEnv("API_CLIENT_IP_HEADER", "x-real-ip");
  });

  it("separates operators and ignores spoofed headers when ingress owns X-Real-IP", async () => {
    vi.stubEnv("API_BASE_URL", origin);
    const { apiFetch } = await import(adminClientPath) as AdminClient;
    for (let index = 0; index < 10; index++) {
      requestContext.headers = new Headers({
        "x-forwarded-for": `198.51.100.${index + 1}`,
        "x-real-ip": "203.0.113.7",
      });
      await apiFetch("/auth/otp/request", {
        method: "POST", body: { phone: `+993650000${String(index).padStart(2, "0")}` },
      });
    }
    await expect(apiFetch("/auth/otp/request", {
      method: "POST", body: { phone: "+99365000010" },
    })).rejects.toMatchObject({ status: 400, code: "RATE_LIMITED" });

    requestContext.headers = new Headers({ "x-real-ip": "203.0.113.8" });
    await expect(apiFetch("/auth/otp/request", {
      method: "POST", body: { phone: "+99365000011" },
    })).resolves.toMatchObject({ resendInSeconds: 60 });
  });

  it.each(["", "/", "/api/v1", "/api/v1/"])(
    "reaches the running API's real OTP controller with suffix '%s'", async (suffix) => {
      vi.stubEnv("API_BASE_URL", `${origin}${suffix}`);
      const { apiFetch } = await import(adminClientPath) as AdminClient;
      await expect(apiFetch("/auth/otp/request", {
        method: "POST", body: { phone: "not-a-phone" },
      })).rejects.toMatchObject({
        status: 400, code: "VALIDATION_FAILED",
      });
    },
  );

  it("detects a misrouted API prefix over real HTTP", async () => {
    vi.stubEnv("API_BASE_URL", `${origin}/api/v2`);
    const { apiFetch, ApiError } = await import(adminClientPath) as AdminClient;
    try {
      await apiFetch("/auth/otp/request", { method: "POST", body: { phone: "not-a-phone" } });
      expect.fail("A wrong prefix must fail the admin-to-API gate");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 404 });
    }
  });
});
