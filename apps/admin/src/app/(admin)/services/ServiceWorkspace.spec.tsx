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
 const screen = render(<AdminLocaleProvider initialLocale="en"><ServiceWorkspace/></AdminLocaleProvider>);
 await waitFor(() => expect(screen.getByRole("button", { name: "General Support" })).toBeTruthy());
 fireEvent.click(screen.getByRole("button", { name: "General Support" }));
 await waitFor(() => expect(screen.getByText("Synthetic service reply")).toBeTruthy());
 fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Retry this synthetic reply" } });
 fireEvent.submit(screen.getByRole("button", { name: "Send message" }).closest("form")!);
 await waitFor(() => expect(screen.getByRole("button", { name: "Retry sending" })).toBeTruthy());
 expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("Retry this synthetic reply");
 fireEvent.submit(screen.getByRole("button", { name: "Retry sending" }).closest("form")!);
 await waitFor(() => expect(sends).toHaveLength(2)); expect(sends[0]?.clientMessageId).toBe(sends[1]?.clientMessageId);
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
