// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { operationsHealth } from "./actions";
import { operationsCopy } from "./copy";
import { OperationsWorkspace } from "./OperationsWorkspace";
import { AdminLocaleProvider } from "@/lib/i18n";
vi.mock("./actions", () => ({ operationsHealth: vi.fn(() => Promise.reject(new Error("offline"))) }));
afterEach(cleanup);
it.each(["en", "ru", "tk"] as const)("recovers from rejected browser transport in %s", async locale => {
 const c=operationsCopy[locale];
 vi.mocked(operationsHealth).mockRejectedValue(new Error("private offline transport detail"));
 render(<AdminLocaleProvider initialLocale={locale}><OperationsWorkspace /></AdminLocaleProvider>);
 expect((await screen.findByRole("alert")).textContent).toContain(c.error);
 expect(screen.queryByText(c.loading)).toBeNull();
 expect(screen.queryByText("private offline transport detail")).toBeNull();
 vi.mocked(operationsHealth).mockResolvedValue({ ok: true, data: { state: "unavailable", snapshot: null } });
 fireEvent.click(screen.getByRole("button", { name: c.refresh }));
 expect(await screen.findByText(c.unavailable)).toBeTruthy();
});
