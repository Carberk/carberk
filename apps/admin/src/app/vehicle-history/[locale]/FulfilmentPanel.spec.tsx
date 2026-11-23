// @vitest-environment happy-dom
import { useState } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";

import { FulfilmentPanel } from "./FulfilmentPanel";
import { historyFulfilmentAction } from "./fulfilment-actions";

vi.mock("./fulfilment-actions", () => ({ historyFulfilmentAction: vi.fn() }));

const id = "10000000-0000-4000-8000-000000001231";
const actorId = "10000000-0000-4000-8000-000000001213";
const scope = "a".repeat(64);
const accepted = { acceptedRevision: 0, vin: "DEMA0000000000001", provider: "Carfax", format: "pdf", originalReportDate: "2026-10-14" } as const;
const recordedAt = "2026-11-21T05:00:00.000Z";

function order(status: "uncertain" | "retry_ready", version: number): H.HistoryOrderState {
  return { order: null, status: "payment_confirmed", serverNow: recordedAt, wallet: null, collectionEnabled: false,
    fulfilment: { accepted, gate: "ready", sources: ["new_source"],
      intent: { id, version, status, attempt: 1, source: "new_source", funding: "order", accepted, recordedAt } } };
}

function Panel() {
  const [state, setState] = useState(() => order("uncertain", 2));
  return <FulfilmentPanel locale="en" id={id} actorId={actorId} scope={scope} version={1}
    state={state} onOrder={setState} invalidate={vi.fn()} />;
}

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("shows provider capacity and offers refresh for a paid order without an eligible provider", () => {
  const view = render(<FulfilmentPanel locale="en" id={id} actorId={actorId} scope={scope} version={1}
    state={{ order: null, status: "payment_confirmed", serverNow: recordedAt, wallet: null,
      collectionEnabled: false, fulfilmentUnavailable: "capacity" }} onOrder={vi.fn()} invalidate={vi.fn()} />);
  expect(view.getByRole("status").textContent).toBe("Provider capacity is unavailable. Refresh before choosing an action.");
  expect(view.getByRole("button", { name: "Refresh preparation" })).toBeTruthy();
  expect(view.queryByRole("combobox")).toBeNull();
});

it("keeps the accepted provider visible while its reserved period is unavailable", () => {
  const view = render(<FulfilmentPanel locale="en" id={id} actorId={actorId} scope={scope} version={1}
    state={{ ...order("uncertain", 2), fulfilment: { accepted, gate: "capacity", sources: [], intent: null } }}
    onOrder={vi.fn()} invalidate={vi.fn()} />);
  expect(view.getByText("Carfax")).toBeTruthy();
  expect(view.getByText("Provider capacity is unavailable. Refresh before choosing an action.")).toBeTruthy();
  expect(view.queryByRole("combobox")).toBeNull();
});

it("requires a fresh source selection when provider capacity removes the selected lookup", () => {
  const panel = (sources: H.HistoryFulfilmentView["sources"]) =>
    <FulfilmentPanel locale="en" id={id} actorId={actorId} scope={scope} version={1}
      state={{ ...order("uncertain", 2), fulfilment: { accepted, gate: "ready", sources, intent: null } }}
      onOrder={vi.fn()} invalidate={vi.fn()} />;
  const view = render(panel(["archive", "new_source"]));
  fireEvent.change(view.getByRole("combobox"), { target: { value: "new_source" } });
  const start = view.getByRole("button", { name: "Record selected source" });
  expect(start.hasAttribute("disabled")).toBe(false);
  view.rerender(panel(["archive"]));
  expect(start.hasAttribute("disabled")).toBe(true);
});

it.each(["ok", "unavailable"] as const)("keeps keyboard focus in fulfilment and moves it to the %s action", async (status) => {
  let complete!: (result: Awaited<ReturnType<typeof historyFulfilmentAction>>) => void;
  vi.mocked(historyFulfilmentAction).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const view = render(<Panel />);
  fireEvent.change(view.getByRole("combobox", { name: "Provider outcome" }), { target: { value: "not_started" } });
  const save = view.getByRole("button", { name: "Save reconciliation" });
  save.focus();
  fireEvent.click(save);
  expect(document.activeElement).toBe(view.getByRole("heading", { name: "Prepare report" }));
  await act(async () => complete(status === "ok" ? { status, scope, actorId, data: order("retry_ready", 3) } : { status }));
  expect(document.activeElement).toBe(view.getByRole("button", { name: status === "ok" ? "Record another attempt" : "Refresh preparation" }));
});
