// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vitest";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";

import { ServiceWorkspace } from "./ServiceWorkspace";

import { AdminLanguageSwitch, AdminLocaleProvider } from "@/lib/i18n";
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-access" }) }), headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); }, unstable_rethrow: () => {} }));
const id = "11111111-1111-4111-8111-111111111111";
let sends: Record<string, unknown>[] = [], deny = false, firstFailure = false;
const message = { id, clientMessageId: id, sequence: 1, sender: "carberk", operatorName: null, visibility: "customer", body: "Synthetic service reply", attachment: null, createdAt: "2026-10-15T10:00:00Z" };
beforeEach(() => {
 cleanup(); sends = []; deny = false; firstFailure = false;
 vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (deny) return Response.json({ code: "NO_ACCESS" }, { status: 403 });
  if (String(url).includes("/queue/")) return Response.json([{ id, resourceId: id, assigned: true, assignmentVersion: 1, createdAt: "2026-10-15T10:00:00Z" }]);
  if (String(url).endsWith("/messages")) { sends.push(JSON.parse(String(init?.body))); if (firstFailure && sends.length === 1) return Response.json({ code: "UNAVAILABLE" }, { status: 503 }); return Response.json(message); }
  return Response.json({ id, resourceId: id, purpose: "support", status: "open", assignmentVersion: 1, assigned: true, operatorName: null, sourceListingId: null, canSend: true, messages: [message], lastSequence: 1, readThrough: 0, unread: 1, hasMore: false });
 });
});
it.each([["en", "Service inbox"], ["ru", "Входящие сервисов"], ["tk", "Hyzmat ýüz tutmalary"]] as const)("renders purpose-specific service queue in %s", async (locale, title) => {
 const screen = render(<AdminLocaleProvider initialLocale={locale}><ServiceWorkspace/></AdminLocaleProvider>);
 expect(screen.getByRole("heading", { name: title })).toBeTruthy();
});
it("keeps a failed draft and retries with the same idempotency identity through real actions", async () => {
 firstFailure = true;
 const generated = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
 const screen = render(<AdminLocaleProvider initialLocale="en"><ServiceWorkspace idGenerator={() => generated.shift() ?? id}/></AdminLocaleProvider>);
 await waitFor(() => expect(screen.getByRole("button", { name: "General Support" })).toBeTruthy());
 fireEvent.click(screen.getByRole("button", { name: "General Support" }));
 await waitFor(() => expect(screen.getByText("Synthetic service reply")).toBeTruthy());
 fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Retry this synthetic reply" } });
 const form = screen.getByRole("button", { name: "Send message" }).closest("form"); if (!form) throw new Error("Missing message form"); fireEvent.submit(form);
 await waitFor(() => expect(screen.getByRole("button", { name: "Retry sending" })).toBeTruthy());
 expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("Retry this synthetic reply");
 fireEvent.submit(form);
 await waitFor(() => expect(sends).toHaveLength(2)); expect(sends.map(send => send["clientMessageId"])).toEqual(["22222222-2222-4222-8222-222222222222", "22222222-2222-4222-8222-222222222222"]);
});
it("removes protected content after denial and preserves draft while switching locale", async () => {
 const screen = render(<AdminLocaleProvider initialLocale="en"><AdminLanguageSwitch/><ServiceWorkspace/></AdminLocaleProvider>);
 await waitFor(() => expect(screen.getByRole("button", { name: "General Support" })).toBeTruthy()); fireEvent.click(screen.getByRole("button", { name: "General Support" }));
 await waitFor(() => expect(screen.getByText("Synthetic service reply")).toBeTruthy()); fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Unfinished draft" } });
 fireEvent.change(screen.getByLabelText("Language"), { target: { value: "tk" } });
 expect((screen.getByLabelText("Habar") as HTMLTextAreaElement).value).toBe("Unfinished draft");
 deny = true; fireEvent.click(screen.getByRole("button", { name: "Täzele" }));
 await waitFor(() => expect(screen.queryByText("Synthetic service reply")).toBeNull());
});
it("keeps a failed operator upload separate from sending and retries its exact staged image", async () => {
 let uploadCalls = 0, stageCalls = 0;
 const fetcher = globalThis.fetch;
 vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (String(url).startsWith("/services/files/")) { uploadCalls++; return Response.json({ ok: true }, { status: uploadCalls === 1 ? 503 : 200 }); }
  if (String(url).endsWith("/attachments")) { stageCalls++; return Response.json({ id }); }
  return fetcher(url, init);
 });
 const screen = render(<AdminLocaleProvider initialLocale="en"><ServiceWorkspace/></AdminLocaleProvider>);
 await waitFor(() => expect(screen.getByRole("button", { name: "General Support" })).toBeTruthy()); fireEvent.click(screen.getByRole("button", { name: "General Support" }));
 await waitFor(() => expect(screen.getByText("Synthetic service reply")).toBeTruthy());
 const file = new File([new Uint8Array([1, 2, 3])], "synthetic.jpg", { type: "image/jpeg" });
 Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([1, 2, 3]).buffer });
 fireEvent.change(screen.getByLabelText("Image source"), { target: { value: "synthetic" } });
 fireEvent.change(screen.getByLabelText("Rights basis"), { target: { value: "Owned synthetic fixture" } });
 fireEvent.change(screen.getByLabelText("Source and permission evidence"), { target: { value: "Operator-created synthetic test image" } });
 fireEvent.change(screen.getByLabelText("Upload attachment"), { target: { files: [file] } });
 await waitFor(() => expect(screen.getByText("The upload failed. The message has not been sent.")).toBeTruthy()); expect(sends).toHaveLength(0);
 fireEvent.click(screen.getByRole("button", { name: "Retry upload" })); await waitFor(() => expect(screen.getByText("Attachment ready to send")).toBeTruthy());
 const form = screen.getByRole("button", { name: "Send message" }).closest("form"); if (!form) throw new Error("Missing send form"); fireEvent.submit(form);
 await waitFor(() => expect(sends).toHaveLength(1)); expect(sends[0]?.["attachmentId"]).toBe(id); expect(stageCalls).toBe(1); expect(uploadCalls).toBe(2);
});
it("acknowledges only the messages currently rendered to the assigned operator", async () => {
 let through = 0; const fetcher = globalThis.fetch;
 vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => { if (String(url).endsWith("/read")) { through = (JSON.parse(String(init?.body)) as { throughSequence: number }).throughSequence; return Response.json({ ok: true }); } return fetcher(url, init); });
 const screen = render(<AdminLocaleProvider initialLocale="en"><ServiceWorkspace/></AdminLocaleProvider>);
 await waitFor(() => expect(screen.getByRole("button", { name: "General Support" })).toBeTruthy()); fireEvent.click(screen.getByRole("button", { name: "General Support" }));
 await waitFor(() => expect(screen.getByText("Synthetic service reply")).toBeTruthy()); await waitFor(() => expect(through).toBe(1));
});

it("sends operational notices with a required reason and explicit information-request semantics", async () => {
 const screen = render(<AdminLocaleProvider initialLocale="en"><ServiceWorkspace/></AdminLocaleProvider>);
 await waitFor(() => expect(screen.getByRole("button", { name: "General Support" })).toBeTruthy()); fireEvent.click(screen.getByRole("button", { name: "General Support" })); await screen.findByText("Synthetic service reply");
 fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Synthetic service notice" } });
 fireEvent.change(screen.getByLabelText("Public reply"), { target: { value: "notice" } });
 expect((screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Affects this synthetic account" } });
 const form = screen.getByRole("button", { name: "Send message" }).closest("form"); if (!form) throw new Error("Missing message form"); fireEvent.submit(form);
 await waitFor(() => expect(sends[0]).toMatchObject({ supportKind: "notice", reason: "Affects this synthetic account", visibility: "customer" }));
});
it("retries a failed manual awaiting-customer closure with the same notice identity", async () => {
 const commands: { clientMessageId: string }[] = []; const fetcher = globalThis.fetch;
 vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (String(url).endsWith("/support") && init?.method === "POST") { commands.push(JSON.parse(String(init?.body))); return Response.json({ ok: true }, { status: commands.length === 1 ? 503 : 201 }); }
  const response = await fetcher(url, init);
  if (String(url).includes("/conversations/") && !init?.method) {
   const payload = await response.json(); return Response.json({ ...payload, support: { unansweredSince: null, awaitingCustomerSince: "2026-10-01T12:00:00Z", investigation: false, category: "ordinary", escalatedAt: null, staffedElapsedMs: 0, overdue: false } });
  }
  return response;
 });
 const screen = render(<AdminLocaleProvider initialLocale="en"><ServiceWorkspace/></AdminLocaleProvider>);
 await waitFor(() => expect(screen.getByRole("button", { name: "General Support" })).toBeTruthy()); fireEvent.click(screen.getByRole("button", { name: "General Support" })); await screen.findByText("Synthetic service reply");
 fireEvent.change(screen.getByLabelText("Close after 14 days awaiting customer: Message"), { target: { value: "Closing this request. Reply to reopen." } });
 fireEvent.change(screen.getByLabelText("Close after 14 days awaiting customer: Reason"), { target: { value: "No requested information for 14 days" } });
 fireEvent.click(screen.getByRole("button", { name: "Close after 14 days awaiting customer" })); await waitFor(() => expect(commands).toHaveLength(1));
 await waitFor(() => expect((screen.getByRole("button", { name: "Close after 14 days awaiting customer" }) as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(screen.getByRole("button", { name: "Close after 14 days awaiting customer" })); await waitFor(() => expect(commands).toHaveLength(2));
 expect(commands[0]?.clientMessageId).toBe(commands[1]?.clientMessageId);
});

it("retains the History quote draft across locales and sends measured feasibility through real actions", async () => {
 const recorded: Record<string, unknown>[] = []; const original = globalThis.fetch;
 vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (String(url).endsWith("/history")) { if (init?.method === "POST") { recorded.push(JSON.parse(String(init.body))); return Response.json({ ok: true }); } return Response.json({ synthetic: true, quotes: [], order: null, payments: [] }); }
  const response = await original(url, init); const data = await response.json();
  return Response.json(data && typeof data === "object" && !Array.isArray(data) && data.id ? { ...data, purpose: "history" } : data);
 });
 const screen = render(<AdminLocaleProvider initialLocale="en"><AdminLanguageSwitch/><ServiceWorkspace/></AdminLocaleProvider>);
 await waitFor(() => expect(screen.getByRole("button", { name: "General Support" })).toBeTruthy());
 fireEvent.click(screen.getByRole("button", { name: "General Support" }));
 await waitFor(() => expect(screen.getByLabelText("Exact VIN")).toBeTruthy());
 fireEvent.change(screen.getByLabelText("Exact VIN"), { target: { value: "1HGCM82633A004352" } });
 fireEvent.change(screen.getByLabelText("Language"), { target: { value: "ru" } });
 expect((screen.getByLabelText("Точный VIN") as HTMLInputElement).value).toBe("1HGCM82633A004352");
 fireEvent.change(screen.getByLabelText("Основание разрешённой проверки доступности"), { target: { value: "Synthetic authorized preflight" } });
 fireEvent.change(screen.getByLabelText("Условия возврата"), { target: { value: "Synthetic refund policy" } });
 fireEvent.change(screen.getByLabelText("Начало срока в UTC"), { target: { value: "2026-10-20T04:00:00Z" } });
 fireEvent.change(screen.getByLabelText("Конец срока в UTC"), { target: { value: "2026-10-20T05:00:00Z" } });
 fireEvent.click(screen.getByLabelText("Измеренная возможность выполнить срок подтверждена"));
 fireEvent.click(screen.getByRole("button", { name: "Предложить точные условия" }));
 await waitFor(() => expect(recorded).toHaveLength(1)); expect(recorded[0]?.["vin"]).toBe("1HGCM82633A004352"); expect(recorded[0]?.["feasible"]).toBe(true);
});

it("requires original readability and matching-link checks before delivering a stored PDF", async () => {
 const recorded: Record<string, unknown>[] = []; const original = globalThis.fetch;
 let state = "staged";
 const report = () => ({ id, provider: "carfax", vin: "1HGCM82633A004352", originalDate: "2020-01-01T00:00:00Z", sizeBytes: 300, expectedPages: 2, sharedLink: null, deliveredAt: null, state, canShare: true });
 vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (String(url).endsWith("/history/artifacts")) { const command = JSON.parse(String(init?.body)); recorded.push(command); if (command.kind === "verify") state="verified"; return Response.json({ ok: true }); }
  if (String(url).endsWith("/history/reports")) return Response.json({ delivered: [], archive: [], staged: [report()] });
  if (String(url).endsWith("/history")) return Response.json({ synthetic: true, quotes: [], order: { id, quoteId: id, state: "fulfilling", version: 0, day: "2026-10-20", holdExpiresAt: "2026-10-20T04:00:00Z", promiseAt: "2026-10-20T05:00:00Z", paidAt: "2026-10-20T04:00:00Z", escalatedAt: null, recoveryDeadline: null, recoveryUsed: false, refundState: null }, payments: [] });
  const response = await original(url, init); const data = await response.json(); return Response.json(data && typeof data === "object" && !Array.isArray(data) && data.id ? { ...data, purpose: "history" } : data);
 });
 const screen = render(<AdminLocaleProvider initialLocale="en"><ServiceWorkspace/></AdminLocaleProvider>);
 await waitFor(() => expect(screen.getByRole("button", { name: "General Support" })).toBeTruthy()); fireEvent.click(screen.getByRole("button", { name: "General Support" }));
 const verify = await screen.findByRole("button", { name: "Confirm VIN, date and readable pages" }); expect((verify as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByLabelText("I opened the original and checked VIN, date, provider and every expected page")); fireEvent.click(verify);
 const deliver = await screen.findByRole("button", { name: "Deliver verified original and link" }); expect((deliver as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText("Matching approved provider link carfax"), { target: { value: "https://example.invalid/report" } });
 fireEvent.click(screen.getByLabelText("The link opens the same checked report")); fireEvent.click(deliver);
 await waitFor(() => expect(recorded).toHaveLength(2)); expect(recorded.map(command => command["kind"])).toEqual(["verify","deliver"]); expect(recorded[1]?.["linkMatches"]).toBe(true);
});
