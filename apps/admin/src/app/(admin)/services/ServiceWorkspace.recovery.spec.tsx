// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

import { ServiceWorkspace } from "./ServiceWorkspace";

import { AdminLocaleProvider } from "@/lib/i18n";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-access" }) }), headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); }, unstable_rethrow: () => {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const id = "11111111-1111-4111-8111-111111111111";
async function openWorkspace(purpose: "support" | "history" = "support", now?: () => number) {
 const commands: Record<string, unknown>[] = [], stages: Record<string, unknown>[] = [];
 vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (String(url).includes("/queue/")) return Response.json([{ id, resourceId: id, assigned: true, assignmentVersion: 1, createdAt: "2026-10-15T10:00:00Z" }]);
  if (String(url).endsWith("/history")) return Response.json({ synthetic: true, quotes: [], order: null, payments: [] });
  if (String(url).endsWith("/history/reports")) return Response.json({ delivered: [], archive: [], staged: [] });
  if (String(url).endsWith("/support")) { commands.push(JSON.parse(String(init?.body))); return Response.json({ ok: true }); }
  if (String(url).endsWith("/attachments")) { stages.push(JSON.parse(String(init?.body))); return Response.json({ id }); }
  if (String(url).startsWith("/services/files/")) return Response.json({ ok: true });
  return Response.json({ id, resourceId: id, purpose, status: "open", assignmentVersion: 1, assigned: true, operatorName: null, sourceListingId: null, canSend: true, support: { unansweredSince: null, awaitingCustomerSince: "2026-10-01T10:00:00Z", investigation: false, category: "ordinary", escalatedAt: null, staffedElapsedMs: 0, overdue: false }, messages: [], lastSequence: 0, readThrough: 0, unread: 0, hasMore: false });
 });
 const view = render(<AdminLocaleProvider initialLocale="en"><ServiceWorkspace {...(now ? { now } : {})}/></AdminLocaleProvider>);
 if (purpose === "history") fireEvent.change(view.getByRole("combobox", { name: "Service inbox" }), { target: { value: "history" } });
 fireEvent.click(await view.findByRole("button", { name: purpose === "history" ? "Vehicle History" : "General Support" }));
 await view.findByLabelText("Message");
 return { ...view, commands, stages };
}
it("keeps the notice and close-awaiting reason and message independent", async () => {
 const view = await openWorkspace();
 fireEvent.change(view.getByLabelText("Public reply"), { target: { value: "notice" } });
 fireEvent.change(view.getByLabelText("Reason"), { target: { value: "Notice reason" } });
 fireEvent.change(view.getByLabelText("Message"), { target: { value: "Notice draft" } });
 const closeReason = view.getByLabelText("Close after 14 days awaiting customer: Reason") as HTMLInputElement;
 expect(closeReason.value).toBe("");
 const closeMessage = view.getByLabelText("Close after 14 days awaiting customer: Message");
 fireEvent.change(closeReason, { target: { value: "Close reason" } });
 fireEvent.change(closeMessage, { target: { value: "Closure explanation" } });
 fireEvent.click(view.getByRole("button", { name: "Close after 14 days awaiting customer" }));
 await waitFor(() => expect(view.commands).toHaveLength(1));
 expect(view.commands[0]).toMatchObject({ kind: "close_awaiting", reason: "Close reason", body: "Closure explanation" });
 expect((view.getByLabelText("Reason") as HTMLInputElement).value).toBe("Notice reason");
 expect((view.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("Notice draft");
});

it.each(["real", "synthetic"])("stages only staff-described %s image rights", async mode => {
 const view = await openWorkspace();
 const picker = view.getByLabelText("Upload attachment") as HTMLInputElement;
 expect(picker.disabled).toBe(true);
 fireEvent.change(view.getByLabelText("Image source"), { target: { value: mode } });
 fireEvent.change(view.getByLabelText("Rights basis"), { target: { value: "Owner permission for this case" } });
 fireEvent.change(view.getByLabelText("Source and permission evidence"), { target: { value: "Operator-created example, permission record CASE-17" } });
 expect(picker.disabled).toBe(false);
 const file = new File([new Uint8Array([1, 2, 3])], "case.jpg", { type: "image/jpeg" });
 Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([1, 2, 3]).buffer });
 fireEvent.change(picker, { target: { files: [file] } });
 await waitFor(() => expect(view.stages).toHaveLength(1));
 await view.findByText("Attachment ready to send");
 expect(view.stages[0]).toMatchObject({ rights: { basis: "Owner permission for this case", provenance: `${mode}: Operator-created example, permission record CASE-17`, schedule: { kind: "support_case", closedDays: 90, eraseOnAccountDeletion: true }, use: ["service"] } });
});

 it("requires the actual History communication expiry and reason instead of inventing a TTL", async () => {
 const view = await openWorkspace("history");
 const picker = view.getByLabelText("Upload attachment") as HTMLInputElement;
 fireEvent.change(view.getByLabelText("Image source"), { target: { value: "real" } });
 fireEvent.change(view.getByLabelText("Rights basis"), { target: { value: "Customer permission for case H17" } });
 fireEvent.change(view.getByLabelText("Source and permission evidence"), { target: { value: "Owner image, recorded consent H17" } });
 expect(picker.disabled).toBe(true);
 fireEvent.change(view.getByLabelText("Retention expiry in UTC"), { target: { value: "2099-01-01T00:00:00Z" } });
 expect(picker.disabled).toBe(true);
 fireEvent.change(view.getByLabelText("Retention reason"), { target: { value: "Case-specific permitted retention H17" } });
 expect(picker.disabled).toBe(false);
 const file = new File([new Uint8Array([1])], "history.jpg", { type: "image/jpeg" });
 Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([1]).buffer });
 fireEvent.change(picker, { target: { files: [file] } });
 await view.findByText("Attachment ready to send");
 expect(view.stages[0]).toMatchObject({ category: "history_communication", rights: { provenance: "real: Owner image, recorded consent H17", schedule: { kind: "until", until: "2099-01-01T00:00:00.000Z", reason: "Case-specific permitted retention H17" } } });
 });

it("rejects expired and equal-time rights through the service parent and stages a one-millisecond-future expiry unchanged", async () => {
 let currentTime = 4070908800000;
 const view = await openWorkspace("history", () => currentTime);
 fireEvent.change(view.getByLabelText("Image source"), { target: { value: "real" } });
 fireEvent.change(view.getByLabelText("Rights basis"), { target: { value: "Customer permission for case H17" } });
 fireEvent.change(view.getByLabelText("Source and permission evidence"), { target: { value: "Owner image, recorded consent H17" } });
 fireEvent.change(view.getByLabelText("Retention expiry in UTC"), { target: { value: "2098-12-31T23:59:59.999Z" } });
 fireEvent.change(view.getByLabelText("Retention reason"), { target: { value: "Case-specific permitted retention H17" } });
 const picker = view.getByLabelText("Upload attachment") as HTMLInputElement;
 expect(picker.disabled).toBe(true);
 expect(view.stages).toEqual([]);
 fireEvent.change(view.getByLabelText("Retention expiry in UTC"), { target: { value: "2099-01-01T00:00:00.000Z" } });
 expect(picker.disabled).toBe(true);
 expect(view.stages).toEqual([]);
 fireEvent.change(view.getByLabelText("Retention expiry in UTC"), { target: { value: "2099-01-01T00:00:00.001Z" } });
 expect(picker.disabled).toBe(false);
 // A field edit revalidates against the provider's current clock.
 currentTime = 4070908800001;
 fireEvent.change(view.getByLabelText("Retention reason"), { target: { value: "Current time has reached the permitted expiry" } });
 expect(picker.disabled).toBe(true);
 expect(view.stages).toEqual([]);
 fireEvent.change(view.getByLabelText("Retention expiry in UTC"), { target: { value: "2099-01-01T00:00:00.002Z" } });
 fireEvent.change(view.getByLabelText("Retention reason"), { target: { value: "Case-specific permitted retention H17" } });
 expect(picker.disabled).toBe(false);
 const file = new File([new Uint8Array([1])], "history.jpg", { type: "image/jpeg" });
 Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([1]).buffer });
 fireEvent.change(picker, { target: { files: [file] } });
 await view.findByText("Attachment ready to send");
 expect(view.stages).toEqual([{ visibility: "customer", contentType: "image/jpeg", sizeBytes: 1, filename: "history.jpg", category: "history_communication", rights: { category: "history_communication", purpose: "Vehicle History communication", basis: "Customer permission for case H17", provenance: "real: Owner image, recorded consent H17", identifiability: "personal", use: ["service"], schedule: { kind: "until", until: "2099-01-01T00:00:00.002Z", reason: "Case-specific permitted retention H17" }, supplierRestrictions: "", hold: null } }]);
});
