// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { diagnosticCopy } from "./copy";
import { DiagnosticWorkspace } from "./DiagnosticWorkspace";

import { AdminLocaleProvider } from "@/lib/i18n";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-access" }) }), headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); }, unstable_rethrow: () => {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each(["en", "ru", "tk"] as const)("retries a failed upstream HTTP transport through real actions in %s", async locale => {
 const c=diagnosticCopy[locale];
 vi.stubGlobal("fetch", async () => { throw new TypeError("private upstream transport detail"); });
 render(<AdminLocaleProvider initialLocale={locale}><DiagnosticWorkspace /></AdminLocaleProvider>);
 expect((await screen.findByRole("alert")).textContent).toContain(c.error);
 expect(screen.queryByText(c.loading)).toBeNull();
 expect(screen.queryByText("private upstream transport detail")).toBeNull();
 vi.stubGlobal("fetch", async () => Response.json([]));
 fireEvent.click(screen.getByRole("button", { name: c.refresh }));
 expect(await screen.findByText(c.empty)).toBeTruthy();
});
