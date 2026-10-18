// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { diagnosticAssigned } from "./actions";
import { diagnosticCopy } from "./copy";
import { DiagnosticWorkspace } from "./DiagnosticWorkspace";
import { AdminLocaleProvider } from "@/lib/i18n";
vi.mock("./actions", () => ({ diagnosticAssigned: vi.fn(() => Promise.reject(new Error("offline"))), diagnosticWorkspace: vi.fn(), diagnosticCreateDraft: vi.fn(), diagnosticSave: vi.fn(), diagnosticTransition: vi.fn(), diagnosticCorrect: vi.fn(), diagnosticIntake: vi.fn(), diagnosticAbandon: vi.fn() }));
afterEach(cleanup);
it.each(["en", "ru", "tk"] as const)("recovers from rejected browser transport in %s", async locale => {
 const c=diagnosticCopy[locale];
 vi.mocked(diagnosticAssigned).mockRejectedValue(new Error("private offline transport detail"));
 render(<AdminLocaleProvider initialLocale={locale}><DiagnosticWorkspace /></AdminLocaleProvider>);
 expect((await screen.findByRole("alert")).textContent).toContain(c.error);
 expect(screen.queryByText(c.loading)).toBeNull();
 expect(screen.queryByText("private offline transport detail")).toBeNull();
 vi.mocked(diagnosticAssigned).mockResolvedValue({ ok: true, data: [] });
 fireEvent.click(screen.getByRole("button", { name: c.refresh }));
 expect(await screen.findByText(c.empty)).toBeTruthy();
});
