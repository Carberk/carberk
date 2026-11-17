import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { confirmDeletion, requestDeletionCode } from "./actions";

import type { DeletionChannel } from "@/lib/account-deletion";
import type { Locale } from "@/i18n/locales";

let incoming = new Headers();

vi.mock("next/headers", () => ({
  headers: async () => incoming,
}));

const fetchMock = vi.fn<typeof fetch>();

function codeSent(): Response {
  return new Response(
    JSON.stringify({ requestId: "9f2d8c1a-3b4e-4c5d-8e6f-7a8b9c0d1e2f", resendInSeconds: 60 }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function sentHeaders(): Record<string, string> {
  const init = fetchMock.mock.calls[0]?.[1];
  if (!init) throw new Error("the API was not called");
  return init.headers as Record<string, string>;
}



const untrusted = <T,>(value: unknown) => value as T;

describe("account deletion Server Functions", () => {
  beforeEach(() => {
    incoming = new Headers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects an unknown channel or a non-string value without calling the API", async () => {
    await expect(
      requestDeletionCode("en", untrusted<DeletionChannel>("sms"), "61234567"),
    ).resolves.toEqual({ ok: false, error: "invalid-value" });
    await expect(
      requestDeletionCode("en", "phone", untrusted<string>({ phone: "61234567" })),
    ).resolves.toEqual({ ok: false, error: "invalid-value" });
    await expect(
      confirmDeletion("en", untrusted<DeletionChannel>("sms"), "+99361234567", "123456"),
    ).resolves.toEqual({ ok: false, error: "invalid-value" });
    await expect(
      confirmDeletion("en", "phone", "+99361234567", untrusted<string>(123456)),
    ).resolves.toEqual({ ok: false, error: "invalid-code-format" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the default locale for an unknown one", async () => {
    fetchMock.mockResolvedValue(codeSent());

    await requestDeletionCode(untrusted<Locale>("fr"), "phone", "61234567");

    expect(sentHeaders()["Accept-Language"]).toBe("ru");
  });

  it("keeps a supported locale", async () => {
    fetchMock.mockResolvedValue(codeSent());

    await requestDeletionCode("tk", "phone", "61234567");

    expect(sentHeaders()["Accept-Language"]).toBe("tk");
  });

  it("forwards the edge's X-Real-IP, which the API trusts, rather than a visitor-supplied X-Forwarded-For", async () => {
    incoming = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" });
    fetchMock.mockResolvedValue(codeSent());

    await requestDeletionCode("en", "email", "person@example.com");

    expect(sentHeaders()["x-real-ip"]).toBe("203.0.113.7");
    expect(sentHeaders()["X-Forwarded-For"]).toBeUndefined();
  });

  it("never forwards a visitor-written X-Forwarded-For when X-Real-IP is absent", async () => {
    incoming = new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" });
    fetchMock.mockResolvedValue(codeSent());

    await requestDeletionCode("en", "email", "person@example.com");

    expect(sentHeaders()["x-real-ip"]).toBeUndefined();
  });

  it("sends no forwarded IP when the request carries none", async () => {
    fetchMock.mockResolvedValue(codeSent());

    await requestDeletionCode("en", "email", "person@example.com");

    expect(sentHeaders()["x-real-ip"]).toBeUndefined();
  });
});
