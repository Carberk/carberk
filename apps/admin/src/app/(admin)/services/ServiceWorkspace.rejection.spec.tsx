// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { serviceQueue } from "./actions";
import { serviceCopy } from "./copy";
import { ServiceWorkspace } from "./ServiceWorkspace";
import { AdminLocaleProvider } from "@/lib/i18n";
vi.mock("./actions", () => ({ serviceQueue: vi.fn(() => Promise.reject(new Error("offline"))), serviceRead: vi.fn(), serviceAssign: vi.fn(), serviceMarkRead: vi.fn(), serviceSend: vi.fn(), serviceStage: vi.fn(), serviceSupportCommand: vi.fn() }));
afterEach(cleanup);
it.each(["en", "ru", "tk"] as const)("recovers from rejected browser transport in %s", async locale => {
 const c=serviceCopy(locale);
 vi.mocked(serviceQueue).mockRejectedValue(new Error("private offline transport detail"));
 render(<AdminLocaleProvider initialLocale={locale}><ServiceWorkspace /></AdminLocaleProvider>);
 expect((await screen.findByRole("alert")).textContent).toContain(c.error);
 expect(screen.queryByText(c.loading)).toBeNull();
 expect(screen.queryByText("private offline transport detail")).toBeNull();
 vi.mocked(serviceQueue).mockResolvedValue({ ok: true, data: [] });
 fireEvent.click(screen.getByRole("button", { name: c.refresh }));
 expect(await screen.findByText(c.empty)).toBeTruthy();
});
