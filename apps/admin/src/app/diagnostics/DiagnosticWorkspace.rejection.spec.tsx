// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiagnosticWorkspace } from "./DiagnosticWorkspace";
import { AdminLocaleProvider } from "@/lib/i18n";
vi.mock("./actions", () => ({ diagnosticAssigned: vi.fn(() => Promise.reject(new Error("offline"))), diagnosticWorkspace: vi.fn(), diagnosticCreateDraft: vi.fn(), diagnosticSave: vi.fn(), diagnosticTransition: vi.fn(), diagnosticCorrect: vi.fn(), diagnosticIntake: vi.fn(), diagnosticAbandon: vi.fn() }));
it("ends loading and offers retry when the assigned diagnostics action rejects", async () => {
 render(<AdminLocaleProvider initialLocale="en"><DiagnosticWorkspace /></AdminLocaleProvider>);
 expect(await screen.findByRole("alert")).toHaveTextContent("The action could not be completed");
 expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
});
