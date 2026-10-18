// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

import { OperationsWorkspace } from "./OperationsWorkspace";
import { operationsCopy } from "./copy";

import { AdminLocaleProvider } from "@/lib/i18n";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-access" }) }), headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(path); }, unstable_rethrow: () => undefined }));
let denied = false, unavailable = false;
const now = new Date("2026-10-18T00:00:00Z");
function setup(locale: "en" | "tk" | "ru" = "en") { return render(<AdminLocaleProvider initialLocale={locale}><OperationsWorkspace/></AdminLocaleProvider>); }
beforeEach(() => {
  denied = false; unavailable = false;
  vi.setSystemTime(now);
  vi.stubGlobal("fetch", async () => {
    if (denied) return Response.json({ code: "FORBIDDEN" }, { status: 403 });
    return Response.json(unavailable ? { state: "unavailable", snapshot: null } : { state: "available", snapshot: {
      version: 1, observedAt: now.toISOString(), api: "healthy", collector: "unknown", worker: "failing",
      queues: [{ name: "video-transcode", waiting: 2, sustainedBacklog: false }], incident: null,
    } });
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("actual operational workspace and server action", () => {
  it.each(["en", "ru", "tk"] as const)("shows measured states and honest missing budget evidence in %s", async locale => {
    const c = operationsCopy[locale], view = setup(locale);
    await view.findByText(c.healthy);
    expect(view.getAllByText(c.unknown)).toHaveLength(3);
    expect(view.getByText(c.failing)).toBeTruthy();
    expect(view.getByText(c.budgetScope)).toBeTruthy();
    expect(view.getByText(c.readinessScope)).toBeTruthy();
  });
  it("clears previously displayed infrastructure evidence after current access is revoked", async () => {
    const c = operationsCopy.en, view = setup();
    await view.findByText("video-transcode");
    denied = true; fireEvent.click(view.getByRole("button", { name: c.refresh }));
    await view.findByRole("alert");
    expect(view.queryByText("video-transcode")).toBeNull();
    expect(view.queryByText(c.budgetScope)).toBeNull();
  });
  it("keeps absent watchdog evidence distinct from measured zero", async () => {
    unavailable = true;
    const view = setup();
    await view.findByText(operationsCopy.en.unavailable);
    expect(view.queryByRole("table")).toBeNull();
    expect(view.queryByText(operationsCopy.en.healthy)).toBeNull();
  });
  it("expires an old displayed snapshot without requiring another successful server request", async () => {
    vi.useFakeTimers();
    let view: ReturnType<typeof setup> | undefined;
    await act(async () => { view = setup(); });
    expect(view?.getByText("video-transcode")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(90_001); });
    expect(view?.getByText(operationsCopy.en.unavailable)).toBeTruthy();
    expect(view?.queryByText("video-transcode")).toBeNull();
  });
});
