// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { StaffSchemas } from "@auto-tm/contracts";

import WorkspacePage from "./page";
import ServicePage from "../(admin)/services/page";

import { AdminLocaleProvider } from "@/lib/i18n";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-access" }) }), headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); }, unstable_rethrow: () => {} }));
let capabilities: StaffSchemas.StaffCapability[] = [];
beforeEach(() => {
 capabilities = ["support.operations"];
 vi.stubGlobal("fetch", async (url: string | URL | Request) => {
  const path = String(url);
  if (path.endsWith("/staff/capabilities")) return Response.json({ capabilities, elevated: true });
  if (path.endsWith("/admin/authority")) return Response.json({ code: "FORBIDDEN" }, { status: 403 });
  if (path.endsWith("/services/queue/support")) return Response.json([]);
  return Response.json({ code: "NOT_FOUND" }, { status: 404 });
 });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each(["support.operations", "history.fulfilment", "history.payment.verify", "founder.refund.approve"] as const)("offers the service queue to a current %s operator without marketplace administration", async capability => {
 capabilities = [capability];
 const view = render(<AdminLocaleProvider initialLocale="en">{await WorkspacePage()}</AdminLocaleProvider>);
 const links = view.getAllByRole("link", { name: "Service and Support" });
 expect(links).toHaveLength(2);
 for (const link of links) expect(link.getAttribute("href")).toBe("/services");
 expect(view.queryByText("This section is not available yet. Data has not been loaded.")).toBeNull();
 expect(view.queryByRole("link", { name: "Complaints" })).toBeNull();
 view.unmount();
 const queue = render(<AdminLocaleProvider initialLocale="en"><ServicePage/></AdminLocaleProvider>);
 expect(queue.getByRole("heading", { name: "Service inbox" })).toBeTruthy();
 await waitFor(() => expect(queue.getByText("No service requests")).toBeTruthy());
});
it("does not offer private service navigation for unrelated or revoked grants", async () => {
 capabilities = ["analytics.aggregate"];
 const view = render(<AdminLocaleProvider initialLocale="en">{await WorkspacePage()}</AdminLocaleProvider>);
 expect(view.queryByRole("link", { name: "Service and Support" })).toBeNull();
 capabilities = [];
 view.unmount();
 const revoked = render(<AdminLocaleProvider initialLocale="en">{await WorkspacePage()}</AdminLocaleProvider>);
 expect(revoked.queryByRole("link", { name: "Service and Support" })).toBeNull();
});
