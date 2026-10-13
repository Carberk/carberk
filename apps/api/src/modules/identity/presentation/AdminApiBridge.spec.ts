import { resolve } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

import { AuthController } from "./AuthController";
import { RequestOtp } from "../application/RequestOtp";
import { VerifyOtp } from "../application/VerifyOtp";
import { RefreshSession } from "../application/RefreshSession";
import { Logout } from "../application/Logout";
import { LogoutAll } from "../application/LogoutAll";
import { GlobalErrorFilter } from "../../../common/error.filter";

// There is no Next request context in this network test. Only cookie storage
// is replaced; the admin API client, fetch, API router and controller are real.
vi.mock("../../../../../admin/src/lib/cookies", () => ({
  getAccessToken: async () => undefined,
  getRefreshToken: async () => undefined,
  setAuthCookies: vi.fn(),
  clearAuthCookies: vi.fn(),
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

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      // Invalid input is rejected by the real controller before any use case.
      // These providers deliberately cannot execute business logic.
      providers: [RequestOtp, VerifyOtp, RefreshSession, Logout, LogoutAll].map((provide) => ({
        provide, useValue: {},
      })),
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new GlobalErrorFilter());
    await app.listen(0, "127.0.0.1");
    origin = await app.getUrl();
  });

  afterAll(async () => { await app?.close(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

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
