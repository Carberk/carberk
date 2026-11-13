// @vitest-environment happy-dom
import { waitFor } from "@testing-library/react";
import type * as NextNavigation from "next/navigation";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...await importOriginal<typeof NextNavigation>(),
  useSearchParams: () => navigation.params,
  useRouter: () => ({ push: navigation.push }),
  redirect: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: vi.fn() }) }));

import LoginPage from "./page";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn());
  navigation.params = new URLSearchParams();
  navigation.push.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render() { await act(async () => root.render(<LoginPage />)); }
function element<T extends Element>(selector: string): T {
  const found = container.querySelector<T>(selector);
  if (!found) throw new Error(`missing rendered element: ${selector}`);
  return found;
}
async function submit() {
  await act(async () => element<HTMLFormElement>("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}

describe("operator login errors", () => {
  it("keeps exact request metadata on the genuine OTP form after a rejected code", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T02:00:00.000Z"));
    try {
      vi.mocked(fetch).mockResolvedValueOnce(Response.json({ requestId: "abcdef01-1234-4567-89ab-123456789abc", resendInSeconds: 60 }))
        .mockResolvedValueOnce(Response.json({ code: "INVALID_OTP", message: "Invalid OTP code" }, { status: 400 }));
      await render();
      element<HTMLInputElement>('input[name="phone"]').value = "+99365000901";
      await submit();
      const form = element<HTMLFormElement>("form[data-otp-request-id]");
      expect(form.dataset["otpRequestId"]).toBe("abcdef01-1234-4567-89ab-123456789abc");
      expect(form.dataset["otpRequestedAt"]).toBe("2026-11-14T02:00:00.000Z");
      expect(container.textContent).not.toContain("abcdef01");
      element<HTMLInputElement>('input[name="code"]').value = "654321";
      await submit();
      expect(element<HTMLFormElement>("form[data-otp-request-id]").dataset["otpRequestId"]).toBe("abcdef01-1234-4567-89ab-123456789abc");
    } finally { vi.useRealTimers(); }
  });
  it("resets a mounted TOTP form when an expired action redirects within login", async () => {
    navigation.params.set("mode", "totp");
    await render();
    expect(container.querySelector('input[name="code"]')).not.toBeNull();
    navigation.params = new URLSearchParams("reason=session-expired");
    await render();
    expect(container.textContent).toContain("Сессия истекла. Войдите снова.");
    expect(container.querySelector('input[name="phone"]')).not.toBeNull();
    expect(container.querySelector('input[name="code"]')).toBeNull();
  });
  it("renders the Russian expired-session message with a fresh sign-in form", async () => {
    navigation.params.set("reason", "session-expired");
    await render();
    expect(container.textContent).toContain("Сессия истекла. Войдите снова.");
    expect(container.querySelector('input[name="phone"]')).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders Russian feedback for a wrong TOTP code through the real action", async () => {
    navigation.params.set("mode", "totp");
    vi.mocked(fetch).mockResolvedValue(Response.json({ code: "INVALID_TOTP", message: "Invalid TOTP code" }, { status: 400 }));
    await render();
    element<HTMLInputElement>('input[name="code"]').value = "654321";
    await submit();
    expect(container.textContent).toContain("Неверный код. Попробуйте ещё раз.");
    expect(container.textContent).not.toContain("Invalid TOTP code");
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("submits a wrong code through the real action and renders Russian API400 feedback", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ resendInSeconds: 60 }))
      .mockResolvedValueOnce(Response.json({ code: "INVALID_OTP", message: "Invalid OTP code" }, { status: 400 }));
    await render();
    element<HTMLInputElement>('input[name="phone"]').value = "+99365000001";
    await submit();
    element<HTMLInputElement>('input[name="code"]').value = "654321";
    await submit();
    expect(container.textContent).toContain("Неверный код. Попробуйте ещё раз.");
    expect(container.textContent).not.toContain("Invalid OTP code");
    expect(navigation.push).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});


describe("scoped History sign-in", () => {
  it("takes an explicitly granted ordinary user through phone, TOTP and the preserved English desk", async () => {
    navigation.params.set("returnTo", "/vehicle-history/en?queue=unpaid");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ resendInSeconds: 60 }))
      .mockResolvedValueOnce(Response.json({ user: { role: "buyer" }, accessToken: "synthetic-access", refreshToken: "synthetic-refresh" }))
      .mockResolvedValueOnce(Response.json({ enrolled: true, elevated: false }))
      .mockResolvedValueOnce(Response.json({ adminTotpExpiresAt: "2026-11-15T12:00:00Z" }));
    await render();
    expect(container.textContent).toContain("Sign in to Vehicle History");
    element<HTMLInputElement>('input[name="phone"]').value = "+99365000001";
    await submit();
    element<HTMLInputElement>('input[name="code"]').value = "123456";
    await submit();
    expect(container.textContent).toContain("Authenticator code");
    element<HTMLInputElement>('input[name="code"]').value = "654321";
    await submit();
    expect(navigation.push).toHaveBeenCalledWith("/vehicle-history/en?queue=unpaid");
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining("/auth/otp/request"), expect.stringContaining("/auth/otp/verify"),
      expect.stringContaining("/auth/admin/totp/status?purpose=vehicle-history"),
      expect.stringContaining("/auth/admin/totp/verify?purpose=vehicle-history"),
    ]);
    expect(container.innerHTML).not.toContain("synthetic-access");
    expect(container.innerHTML).not.toContain("synthetic-refresh");
  });
});

const locales = [
  ["tk", "Awtoulag taryhyna giriş", "Sessiýanyň möhleti gutardy. Gaýtadan giriň.", "Kod nädogry. Gaýtadan synanyşyň.", "Awtoulag taryhyna häzirki rugsat ýok.", "Baglanyşyk ýok.", "Kod 6 sandan ybarat bolmaly."],
  ["ru", "Вход в историю автомобиля", "Сессия истекла. Войдите снова.", "Неверный код. Попробуйте ещё раз.", "Нет действующего доступа к истории автомобиля.", "Нет соединения.", "Код должен содержать 6 цифр."],
  ["en", "Sign in to Vehicle History", "Your session expired. Sign in again.", "Incorrect code. Try again.", "Current Vehicle History access is missing.", "Connection unavailable.", "Enter a 6-digit code."],
] as const;

describe.each(locales)("real localized History auth: %s", (locale, title, expired, invalid, denied, network, validation) => {
  beforeEach(() => { navigation.params.set("returnTo", `/vehicle-history/${locale}`); });
  it("offers a fresh localized form after expiry", async () => {
    navigation.params.set("reason", "session-expired");
    await render();
    expect(container.textContent).toContain(title);
    expect(container.querySelector("[role=alert]")?.textContent).toContain(expired);
    expect(element<HTMLElement>("main").lang).toBe(locale);
  });
  it.each([400, 401, 403, 503, 0])("keeps API %s recovery actionable without exposing raw errors", async (status) => {
    navigation.params.set("mode", "totp");
    if (status === 0) vi.mocked(fetch).mockRejectedValue(new Error("private upstream failure"));
    else vi.mocked(fetch).mockResolvedValue(Response.json({ code: "INVALID_TOTP", message: "private upstream failure" }, { status }));
    await render();
    element<HTMLInputElement>('input[name="code"]').value = "654321";
    await submit();
    expect(container.querySelector("[role=alert]")?.textContent).toContain(status === 400 ? invalid : status === 401 ? expired : status === 403 ? denied : network);
    expect(container.textContent).not.toContain("private upstream failure");
    expect(navigation.push).not.toHaveBeenCalled();
    await act(async () => element<HTMLButtonElement>('button[type="button"]').click());
    expect(container.querySelector('input[name="phone"]')).not.toBeNull();
  });
  it("validates the sign-in code on the server in the selected locale", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ resendInSeconds: 60 }));
    await render();
    element<HTMLInputElement>('input[name="phone"]').value = "+99365000001";
    await submit();
    element<HTMLInputElement>('input[name="code"]').value = "123";
    await submit();
    expect(container.querySelector("[role=alert]")?.textContent).toContain(validation);
  });
  it("recovers enrollment after a network failure and keeps the desk destination through backup codes", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ resendInSeconds: 60 }))
      .mockResolvedValueOnce(Response.json({ user: { role: "buyer" }, accessToken: "synthetic-access", refreshToken: "synthetic-refresh" }))
      .mockResolvedValueOnce(Response.json({ enrolled: false, elevated: false }))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ qrCodeUrl: "otpauth://totp/Synthetic?secret=JBSWY3DPEHPK3PXP" }))
      .mockResolvedValueOnce(Response.json({ adminTotpExpiresAt: "2026-11-15T12:00:00Z", backupCodes: ["abcdef0123456789"] }));
    await render();
    element<HTMLInputElement>('input[name="phone"]').value = "+99365000001";
    await submit();
    element<HTMLInputElement>('input[name="code"]').value = "123456";
    await submit();
    expect(container.querySelector("[role=alert]")?.textContent).toContain(network);
    expect(container.querySelector("img")).toBeNull();
    await act(async () => element<HTMLButtonElement>('button').click());
    await waitFor(() => expect(element<HTMLImageElement>("img").src).toMatch(/^data:image\/png/));
    element<HTMLInputElement>('input[name="code"]').value = "654321";
    await submit();
    expect(container.textContent).toContain("abcdef0123456789");
    const buttons = container.querySelectorAll("button");
    await act(async () => buttons[buttons.length - 1]?.click());
    expect(navigation.push).toHaveBeenCalledWith(`/vehicle-history/${locale}`);
  });
});

it("disables repeated submission and announces progress while the real request is pending", async () => {
  navigation.params.set("returnTo", "/vehicle-history/en");
  let resolveRequest!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
  await render();
  element<HTMLInputElement>('input[name="phone"]').value = "+99365000001";
  await submit();
  expect(element<HTMLFormElement>("form").getAttribute("aria-busy")).toBe("true");
  expect(element<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);
  expect(container.textContent).toContain("Sending…");
  await act(async () => resolveRequest(Response.json({ resendInSeconds: 60 })));
  expect(container.textContent).toContain("Sign-in code");
});
