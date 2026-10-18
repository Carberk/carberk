// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OperationsWorkspace } from "./OperationsWorkspace";
import { AdminLocaleProvider } from "@/lib/i18n";
vi.mock("./actions", () => ({ operationsHealth: vi.fn(() => Promise.reject(new Error("offline"))) }));
it("shows a recoverable error when the browser cannot reach the operations action", async () => {
 render(<AdminLocaleProvider initialLocale="en"><OperationsWorkspace /></AdminLocaleProvider>);
 expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load operational evidence");
 expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
});
