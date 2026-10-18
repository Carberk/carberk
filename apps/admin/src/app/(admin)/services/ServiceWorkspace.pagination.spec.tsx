// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ServiceWorkspace } from "./ServiceWorkspace";
import { serviceCopy } from "./copy";

import { AdminLocaleProvider } from "@/lib/i18n";

const framework = vi.hoisted(() => ({ fail: false }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-access" }) }), headers: async () => { if (framework.fail) throw new Error("private request context failure"); return new Headers(); } }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); }, unstable_rethrow: () => {} }));
afterEach(() => { framework.fail = false; cleanup(); vi.unstubAllGlobals(); });
it.each(["en", "ru", "tk"] as const)("recovers rejected pagination through real actions without losing the draft in %s", async locale => {
 const c = serviceCopy(locale), id = "11111111-1111-4111-8111-111111111111";
 const message = { id, clientMessageId: id, sequence: 1, sender: "customer", operatorName: null, visibility: "customer", body: "First page", attachment: null, createdAt: "2026-10-15T10:00:00Z" };
 vi.stubGlobal("fetch", async (url: string) => {
  if (String(url).includes("/queue/")) return Response.json([{ id, resourceId: id, assigned: true, assignmentVersion: 1, createdAt: "2026-10-15T10:00:00Z" }]);
  const after = new URL(String(url)).searchParams.get("after");
  return Response.json({ id, resourceId: id, purpose: "support", status: "open", assignmentVersion: 1, assigned: true, operatorName: null, sourceListingId: null, canSend: true, messages: [{ ...message, ...(after === "1" ? { id: "33333333-3333-4333-8333-333333333333", sequence: 2, body: "Second page" } : {}) }], lastSequence: 2, readThrough: 2, unread: 0, hasMore: after !== "1" });
 });
 render(<AdminLocaleProvider initialLocale={locale}><ServiceWorkspace/></AdminLocaleProvider>);
 fireEvent.click(await screen.findByRole("button", { name: c.support }));
 await screen.findByText("First page");
 fireEvent.change(screen.getByLabelText(c.body), { target: { value: "Retained reply" } });
 framework.fail = true; fireEvent.click(screen.getByRole("button", { name: c.more }));
 await screen.findByRole("alert");
 expect(screen.queryByText("private request context failure")).toBeNull();
 expect((screen.getByRole("button", { name: c.more }) as HTMLButtonElement).disabled).toBe(false);
 expect((screen.getByLabelText(c.body) as HTMLTextAreaElement).value).toBe("Retained reply");
 framework.fail = false; fireEvent.click(screen.getByRole("button", { name: c.more }));
 await screen.findByText("Second page");
 expect(screen.getByText("First page")).toBeTruthy();
 await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});
