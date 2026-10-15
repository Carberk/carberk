import type * as NextNavigation from "next/navigation";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

const mockState = vi.hoisted(() => ({
  requestHeaders: new Headers(),
  cookies: new Map<string, string>(),
  cookieStore: {
    get: vi.fn((name: string) => {
      const value = mockState.cookies.get(name);
      return value === undefined ? undefined : { value };
    }),
    set: vi.fn((name: string, value: string) => {
      mockState.cookies.set(name, value);
    }),
  },
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  }),
}));

vi.mock("next/headers", () => ({
  headers: async () => mockState.requestHeaders,
  cookies: vi.fn(() => Promise.resolve(mockState.cookieStore)),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...await importOriginal<typeof NextNavigation>(),
  redirect: mockState.redirect,
}));

import { enrollTotp, requireAuthWithReturnTo, verifyOtp, verifyTotp } from "./actions";

function mockFetchQueue(responses: Array<{ status: number; body: unknown }>) {
  const queue = [...responses];
  global.fetch = vi.fn(() => {
    const next = queue.shift();
    if (!next) {
      throw new Error("Unexpected fetch call");
    }
    return Promise.resolve(
      new Response(JSON.stringify(next.body), { status: next.status }),
    );
  }) as Mock;
}

describe("admin auth server actions", () => {
  it("cancels a rejected auth action before validation or API work", async () => {
    mockState.requestHeaders.set("x-admin-session-expired", "1");
    mockFetchQueue([]);
    await expect(verifyOtp(null, new FormData())).rejects.toThrow("NEXT_REDIRECT:/login?reason=session-expired");
    expect(fetch).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.requestHeaders = new Headers();
    mockState.cookies.clear();
  });

  it("shows the Russian wrong-code error for API 400 INVALID_OTP", async () => {
    mockFetchQueue([{ status: 400, body: { code: "INVALID_OTP", message: "Invalid OTP code" } }]);
    const formData = new FormData();
    formData.set("phone", "+99365000001");
    formData.set("code", "654321");

    await expect(verifyOtp(null, formData)).resolves.toEqual({
      ok: false, error: "Неверный код. Попробуйте ещё раз.",
    });
  });

  it.each([429, 500, 503])("layout gate surfaces API %s without signing the operator out", async (status) => {
    mockFetchQueue([{ status, body: { code: "UNAVAILABLE", message: "Unavailable" } }]);
    await expect(requireAuthWithReturnTo("/reports")).rejects.toMatchObject({ status });
    expect(mockState.redirect).not.toHaveBeenCalled();
    expect(mockState.cookieStore.set).not.toHaveBeenCalled();
  });

  it("layout gate adds the expiry reason only after API401", async () => {
    mockFetchQueue([{ status: 401, body: {} }]);
    await expect(requireAuthWithReturnTo("/reports")).rejects.toThrow("NEXT_REDIRECT:/login?reason=session-expired&returnTo=%2Freports");
  });

  it("shows Russian feedback for API400 INVALID_TOTP", async () => {
    mockFetchQueue([{ status: 400, body: { code: "INVALID_TOTP", message: "Invalid TOTP code" } }]);
    const formData = new FormData();
    formData.set("code", "654321");
    await expect(verifyTotp(null, formData)).resolves.toEqual({ ok: false, error: "Неверный код. Попробуйте ещё раз." });
  });

  it("verifyOtp reports when the admin already has TOTP enrolled", async () => {
    mockFetchQueue([
      {
        status: 200,
        body: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          user: {
            id: "442332a0-97d2-4e22-91c0-08c3c81d5f84",
            phone: "+99365000001",
            displayName: null,
            role: "admin",
            deletionScheduledAt: null,
          },
        },
      },
      {
        status: 200,
        body: {
          enrolled: true,
          elevated: false,
        },
      },
    ]);

    const formData = new FormData();
    formData.set("phone", "+99365000001");
    formData.set("code", "123456");

    const result = await verifyOtp(null, formData);

    expect(result).toEqual({
      ok: true,
      next: "totp",
      totpEnrolled: true,
    });
  });

  it("verifyOtp reports when the admin still needs TOTP setup", async () => {
    mockFetchQueue([
      {
        status: 200,
        body: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          user: {
            id: "442332a0-97d2-4e22-91c0-08c3c81d5f84",
            phone: "+99365000001",
            displayName: null,
            role: "admin",
            deletionScheduledAt: null,
          },
        },
      },
      {
        status: 200,
        body: {
          enrolled: false,
          elevated: false,
        },
      },
    ]);

    const formData = new FormData();
    formData.set("phone", "+99365000001");
    formData.set("code", "123456");

    const result = await verifyOtp(null, formData);

    expect(result).toEqual({
      ok: true,
      next: "totp",
      totpEnrolled: false,
    });
  });

  it("enrollTotp marks verified-enrollment conflicts for the login UI", async () => {
    mockState.cookies.set("auto_tm_admin_access", "access-token");
    mockFetchQueue([
      {
        status: 409,
        body: {
          code: "CONFLICT",
          message: "TOTP already enrolled",
          details: { reason: "TOTP_ALREADY_ENROLLED" },
        },
      },
    ]);

    const result = await enrollTotp();

    expect(result).toEqual({
      ok: false,
      reason: "already-enrolled",
      error: "Двухфакторная аутентификация уже настроена.",
    });
  });
});

describe('current scoped staff sign-in',()=>{
  it('admits a non-admin only after current server capability eligibility, without exposing credentials',async()=>{
    mockFetchQueue([
      {status:200,body:{accessToken:'scoped-access',refreshToken:'scoped-refresh',user:{role:'buyer'}}},
      {status:200,body:{capabilities:['founder.admission'],elevated:false}},
      {status:200,body:{enrolled:true,elevated:false}},
    ]);
    const form=new FormData();form.set('phone','+99365000001');form.set('code','123456');
    const result=await verifyOtp(null,form);
    expect(result).toEqual({ok:true,next:'totp',totpEnrolled:true});
    expect(JSON.stringify(result)).not.toContain('scoped-access');
    expect(mockState.cookies.get('auto_tm_admin_access')).toBe('scoped-access');
  });
});
