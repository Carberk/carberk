// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
const navigation = vi.hoisted(() => ({ path: "/vehicle-history/en/staff" }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {}, redirect: vi.fn(),
  usePathname: () => navigation.path, useSearchParams: () => new URLSearchParams(window.location.search) }));
import { HistoryStaffForm } from "./HistoryStaffForm";

import { HistoryWorkbench } from "@/components/HistoryWorkbench";
const actor = { id: "11760000-0000-4000-8000-000000000001", displayName: "Synthetic founder", nameNumber: 1176 };
const target = { id: "11760000-0000-4000-8000-000000000002", displayName: "Synthetic named operator", nameNumber: 1177, eligible: true,
  capabilities: { "vehicle-history": false, "vehicle-history-payment-evidence": true } };
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  navigation.path = "";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn());
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
it("keeps the confirmed target and written reason while changing the workbench language", async () => {
  navigation.path = "/vehicle-history/en/staff";
  window.history.replaceState(null, "", `/vehicle-history/en/staff?targetId=${target.id}`);
  const view = <HistoryWorkbench locale="en" section="staff"><HistoryStaffForm locale="en" initial={{ actor, target }} /></HistoryWorkbench>;
  await act(async () => root.render(view));
  await act(async () => fireEvent.change(element<HTMLTextAreaElement>('textarea[name="reason"]'), { target: { value: "Preserve this reason across languages" } }));
  const replace = vi.spyOn(window.history, "replaceState");
  await act(async () => element<HTMLAnchorElement>('a[lang="ru"]').click());
  expect(replace.mock.calls.at(-1)?.[2]).toContain(`/vehicle-history/ru/staff?targetId=${target.id}`);
  navigation.path = "/vehicle-history/ru/staff";
  await act(async () => root.render(<HistoryWorkbench locale="en" section="staff"><HistoryStaffForm locale="en" initial={{ actor, target }} /></HistoryWorkbench>));
  expect(container.querySelector("h1")?.textContent).toBe("Доступ сотрудников к истории");
  expect(element<HTMLTextAreaElement>('textarea[name="reason"]').value).toBe("Preserve this reason across languages");
  replace.mockRestore();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("offers exact named lookup without a directory or permission inheritance", async () => {
  await act(async () => root.render(<HistoryStaffForm locale="en" />));
  expect(container.textContent).toContain("Exact user ID");
  expect(container.querySelector('input[name="targetId"]')).not.toBeNull();
  expect(container.textContent).toContain("Find person");
});
it("retains the requested target when the initial access check needs retry", async () => {
  await act(async () => root.render(<HistoryStaffForm locale="en" initial={{ status: "error" }} lookupId={target.id} />));
  expect(container.querySelector<HTMLInputElement>('input[name="targetId"]')?.value).toBe(target.id);
  expect(container.querySelector("a")?.href).toContain(`?targetId=${target.id}`);
});
function element<T extends Element>(selector: string, index = 0): T {
  const found = container.querySelectorAll<T>(selector)[index];
  if (!found) throw new Error(`Missing rendered ${selector}`);
  return found;
}
async function submit(index = 0) {
  await act(async () => element<HTMLFormElement>("form", index).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
}
it.each([
  ["en", "Access checked for Synthetic named operator"],
  ["ru", "Доступ проверен для Synthetic named operator"],
  ["tk", "Rugsat barlandy: Synthetic named operator"],
] as const)("announces the named lookup result in %s", async (locale, announcement) => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ actor, target }));
  await act(async () => root.render(<HistoryStaffForm locale={locale} initial={{ actor, target: null }} />));
  await act(async () => fireEvent.change(element<HTMLInputElement>('input[name="targetId"]'), { target: { value: target.id } }));
  await submit();
  expect(element<HTMLElement>('[role="status"][aria-live="polite"]').textContent).toBe(announcement);
});
it.each(["en", "ru", "tk"] as const)("keeps a missing submitted ID editable in %s", async (locale) => {
  const missingId = "11760000-0000-4000-8000-000000000099";
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ actor, target: null }))
    .mockResolvedValueOnce(Response.json({ actor, target }));
  await act(async () => root.render(<HistoryStaffForm locale={locale} initial={{ actor, target: null }} />));
  await act(async () => fireEvent.change(element<HTMLInputElement>('input[name="targetId"]'), { target: { value: missingId } }));
  await submit();
  expect(element<HTMLInputElement>('input[name="targetId"]').value).toBe(missingId);
  expect(container.querySelector("fieldset")).toBeNull();
  await act(async () => fireEvent.change(element<HTMLInputElement>('input[name="targetId"]'), { target: { value: target.id } }));
  await submit();
  expect(element<HTMLElement>('[role="status"][aria-live="polite"]').textContent).toContain("Synthetic named operator");
});
it("confirms a named person, then sends the exact capability and reason through the real action", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ actor, target }))
    .mockResolvedValueOnce(Response.json({ actor, target: { ...target, capabilities: { ...target.capabilities, "vehicle-history": true } } }));
  await act(async () => root.render(<HistoryStaffForm locale="en" initial={{ actor, target: null }} />));
  await act(async () => fireEvent.change(element<HTMLInputElement>('input[name="targetId"]'), { target: { value: target.id } }));
  await submit();
  expect(container.textContent).toContain("Synthetic named operator");
  expect(container.textContent).toContain(target.id);
  expect(container.textContent).toContain("Historical payment evidence");
  element<HTMLTextAreaElement>('textarea[name="reason"]').value = "Synthetic desk assignment";
  await submit(1);
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Access updated.");
  expect(element<HTMLFormElement>("form", 1).textContent).toContain("Revoke access");
  const mutation = vi.mocked(fetch).mock.calls[1];
  expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({ targetId: target.id, capability: "vehicle-history", active: true, reason: "Synthetic desk assignment" });
});
it("announces pending and prevents double-submit until current access returns", async () => {
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await act(async () => root.render(<HistoryStaffForm locale="en" initial={{ actor, target }} />));
  element<HTMLTextAreaElement>('textarea[name="reason"]').value = "Synthetic pending assignment";
  await submit(1);
  expect(container.querySelector("section")?.getAttribute("aria-busy")).toBe("true");
  expect(container.querySelector("button")?.disabled).toBe(true);
  expect(container.querySelector("fieldset")?.disabled).toBe(true);
  await act(async () => finish(Response.json({ actor, target })));
  await waitFor(() => expect(container.querySelector("section")?.getAttribute("aria-busy")).toBe("false"));
});
it("keeps self capabilities visible but makes changing them unavailable", async () => {
  await act(async () => root.render(<HistoryStaffForm locale="en" initial={{ actor: target, target }} />));
  expect(container.textContent).toContain("You cannot change your own capabilities.");
  expect([...container.querySelectorAll("fieldset")].every((f) => f.disabled)).toBe(true);
});
it("rejects a blank reason before any network mutation", async () => {
  await act(async () => root.render(<HistoryStaffForm locale="en" initial={{ actor, target }} />));
  await submit(1);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("reason of 1–500 characters");
  expect(vi.mocked(fetch).mock.calls).toHaveLength(0);
});
it("preserves the written reason after a network failure while requiring access refresh", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("synthetic offline"));
  await act(async () => root.render(<HistoryStaffForm locale="en" initial={{ actor, target }} />));
  await act(async () => fireEvent.change(element<HTMLTextAreaElement>('textarea[name="reason"]'), { target: { value: "Keep this synthetic reason" } }));
  await submit(1);
  expect(element<HTMLTextAreaElement>('textarea[name="reason"]').value).toBe("Keep this synthetic reason");
  expect(element<HTMLFieldSetElement>("fieldset").disabled).toBe(true);
  vi.mocked(fetch).mockResolvedValue(Response.json({ actor, target }));
  await submit(1);
  expect(element<HTMLTextAreaElement>('textarea[name="reason"]').value).toBe("Keep this synthetic reason");
  expect(element<HTMLFieldSetElement>("fieldset").disabled).toBe(false);
});
it.each([
  ["tk", "Rugsat täzelendi.", "Esaslandyryjy rugsady elýeterli däl.", "Sessiýanyň möhleti gutardy.", "Rugsady barlap ýa-da täzeläp bolmady.", "Bu ID bilen adam tapylmady."],
  ["ru", "Доступ обновлён.", "Нет доступа основателя.", "Сессия истекла.", "Не удалось проверить или изменить доступ.", "Человек с таким ID не найден."],
  ["en", "Access updated.", "Founder access is unavailable.", "Your session expired.", "Could not check or update access.", "No person has this ID."],
] as const)("localizes real action outcomes and recovery in %s", async (locale, saved, denied, expired, error, missing) => {
  for (const [status, message] of [[201, saved], [403, denied], [401, expired], [503, error], [404, missing]] as const) {
    vi.mocked(fetch).mockResolvedValue(Response.json(status === 201 ? { actor, target } : { code: "FAILURE", message: "private upstream detail" }, { status }));
    await act(async () => root.render(<HistoryStaffForm key={`${locale}-${status}`} locale={locale} initial={{ actor, target }} />));
    element<HTMLTextAreaElement>('textarea[name="reason"]').value = "Synthetic reason";
    await submit(1);
    expect(container.textContent).toContain(message);
    expect(container.textContent).not.toContain("private upstream detail");
    if (status === 401 || status === 403) expect(container.querySelector("a")?.href).toContain(encodeURIComponent(`/vehicle-history/${locale}/staff`));
    if (status === 503) expect(container.querySelector("fieldset")?.disabled).toBe(true);
  }
});
