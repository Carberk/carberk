// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServiceWorkspace } from "./ServiceWorkspace";
import { AdminLocaleProvider } from "@/lib/i18n";
vi.mock("./actions", () => ({ serviceQueue: vi.fn(() => Promise.reject(new Error("offline"))), serviceRead: vi.fn(), serviceAssign: vi.fn(), serviceMarkRead: vi.fn(), serviceSend: vi.fn(), serviceStage: vi.fn(), serviceSupportCommand: vi.fn() }));
it("ends loading and offers retry when the service queue action rejects", async () => {
 render(<AdminLocaleProvider initialLocale="en"><ServiceWorkspace /></AdminLocaleProvider>);
 expect(await screen.findByRole("alert")).toHaveTextContent("The action could not be completed");
 expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
});
