// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";

import { BusinessAdmissionForm } from "./BusinessAdmissionForm";

import { AdminLocaleProvider } from "@/lib/i18n";

const framework = vi.hoisted(() => ({ expired: false }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "auto_tm_admin_access" ? { value: "synthetic-access" } : undefined }), headers: async () => new Headers(framework.expired ? { "x-auto-tm-session-expired": "1" } : {}) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); }, unstable_rethrow: () => {} }));
const owner = "00000000-0000-4000-8000-000000000001";
const business = "00000000-0000-4000-8000-000000000002";
const invitation = "00000000-0000-4000-8000-000000000003";
let capability = true;
let sent: Record<string, unknown> | null = null;
beforeEach(() => {
 cleanup(); capability = true; sent = null; framework.expired = false;
 vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
  if (String(url).endsWith("/staff/capabilities")) return Response.json({ capabilities: capability ? ["founder.admission", "founder.recovery"] : [], elevated: true });
  sent = JSON.parse(String(init.body)); return Response.json({ businessId: business, invitationId: invitation, token: "a".repeat(64), expiresAt: "2026-10-20T12:00:00.000Z" });
 });
});
describe("actual business admission form and server action", () => {
 it.each([["en", "Admit a business", "Prepare owner invitation"], ["ru", "Одобрить бизнес", "Подготовить приглашение владельца"], ["tk", "Işewürligi kabul et", "Eýesi üçin çakylyk taýýarla"]] as const)("renders admission and empty state in %s", (locale, title, button) => {
  const screen = render(<AdminLocaleProvider initialLocale={locale}><BusinessAdmissionForm canAdmit canRecover={false}/></AdminLocaleProvider>);
  expect(screen.getByText(title)).toBeTruthy(); expect(screen.getByRole("button", { name: button })).toBeTruthy();
 });
 it("submits validated synthetic admission through the real action and displays the one-time receipt", async () => {
  const screen = render(<AdminLocaleProvider initialLocale="en"><BusinessAdmissionForm canAdmit canRecover={false}/></AdminLocaleProvider>);
  fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "Ahal Motors" } });
  fireEvent.change(screen.getByLabelText("Public identifier"), { target: { value: "ahal-motors" } });
  fireEvent.change(screen.getByLabelText("Intended owner's account ID"), { target: { value: owner } });
  fireEvent.change(screen.getByLabelText("Checked identity evidence"), { target: { value: "Synthetic fixture only" } });
  fireEvent.change(screen.getByLabelText("Operator reason"), { target: { value: "Contract proof" } });
  const form = screen.getByRole("button", { name: "Prepare owner invitation" }).closest("form");
  if (!form) throw new Error("Admission form missing");
  fireEvent.submit(form);
  await waitFor(() => expect(screen.getByText("a".repeat(64))).toBeTruthy());
  expect(sent).toMatchObject({ mode: "synthetic", ownerUserId: owner, evidence: "Synthetic fixture only" });
 });
 it("rechecks current server purpose even if a stale page still shows an admission form", async () => {
  capability = false;
  const { prepareBusinessInvitation } = await import("./actions");
  const form = new FormData(); Object.entries({ operation: "admission", name: "Ahal", slug: "ahal", mode: "synthetic", ownerUserId: owner, evidence: "Synthetic fixture", reason: "Contract proof" }).forEach(([key, value]) => form.set(key, value));
  expect(await prepareBusinessInvitation(form)).toEqual({ ok: false, error: "permission" }); expect(sent).toBeNull();
 });
});
it("uses the shared locale switch without losing the founder's unfinished evidence", async () => {
 const { AdminLocaleProvider, AdminLanguageSwitch } = await import("@/lib/i18n");
 const { BusinessAdmissionPanel } = await import("./BusinessAdmissionForm");
 const screen = render(<AdminLocaleProvider initialLocale="ru"><AdminLanguageSwitch/><BusinessAdmissionPanel canAdmit canRecover={false}/></AdminLocaleProvider>);
 const evidence = screen.container.querySelector<HTMLTextAreaElement>('textarea[name="evidence"]');
 if (!evidence) throw new Error("Evidence input missing");
 fireEvent.change(evidence, { target: { value: "Unfinished checked evidence" } });
 fireEvent.change(screen.getByRole("combobox", { name: "Язык" }), { target: { value: "en" } });
 expect(screen.getByLabelText("Checked identity evidence")).toBe(evidence);
 expect(evidence.value).toBe("Unfinished checked evidence");
});
