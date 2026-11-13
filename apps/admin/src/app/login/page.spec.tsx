// @vitest-environment happy-dom
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
