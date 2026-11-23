// @vitest-environment happy-dom
import { createHash } from "node:crypto";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";

const auth = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "http://admin.test" }),
  cookies: async () => ({ get: () => ({ value: auth.token }) }) }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined }));
import { VinCorrectionPanel } from "./VinCorrectionPanel";

const id = "10000000-0000-4000-8000-000000001186", actorId = "20000000-0000-4000-8000-000000001186", sid = "30000000-0000-4000-8000-000000001186";
const scope = createHash("sha256").update(`history-inbox\0${actorId}\0${sid}`).digest("hex");
const offer: H.HistoryAcceptedOrder["acceptedOffer"] = { version: 2, vin: "DEMA0000000000001", synthetic: true,
  preflight: { status: "available", providers: [{ name: "Carfax", originalReportDate: "2026-10-14" }] },
  proposal: { format: "both", deliveryFrom: "2026-11-21T06:00:00.000Z", deliveryBy: "2026-11-21T07:00:00.000Z", priceTmt: 100,
    providerRule: "either_available_both_when_obtainable", terms: "service_failure_review" } };
let root: Root, container: HTMLDivElement, state: H.HistoryOrderState, sent: H.HistoryOperatorCorrectionMutation[], denied: boolean, loseResponse: boolean;
const invalidate = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("API_BASE_URL", "http://api.test"); vi.stubEnv("ADMIN_ORIGIN", "http://admin.test");
  auth.token = `e30.${Buffer.from(JSON.stringify({ sub: actorId, sid, exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.synthetic`;
  sent = []; denied = false; loseResponse = false; localStorage.clear(); invalidate.mockReset();
  state = { order: { id, acceptedOffer: offer, acceptedAt: "2026-11-21T05:00:00.000Z", holdExpiresAt: "2026-11-21T07:00:00.000Z", deliveryDay: "2026-11-21" },
    status: "payment_confirmed", serverNow: "2026-11-21T05:00:00.000Z", wallet: null, collectionEnabled: false,
    agreement: { version: 1, acceptedRevision: 0, accepted: [{ revision: 0, offer, acceptedAt: "2026-11-21T05:00:00.000Z", cause: null }],
      pending: { vin: "DEMA0000000000006", requestedAt: "2026-11-21T05:01:00.000Z", review: null }, handoff: null } };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (denied) return Response.json({ code: "HISTORY_OPERATOR_DENIED" }, { status: 403 });
    if (new URL(url).pathname.endsWith("/correction")) {
      if (init?.method === "POST") {
        const input = JSON.parse(String(init.body)) as H.HistoryOperatorCorrectionMutation;
        sent.push(input);
        const agreement = state.agreement;
        if (!agreement?.pending) throw new Error("Missing synthetic correction");
        state = { ...state, agreement: { ...agreement, version: 2, pending: { ...agreement.pending,
          review: { cause: input.cause, offer: { ...offer, version: 2, vin: "DEMA0000000000006", proposal: { ...offer.proposal, format: input.format },
            preflight: { status: "available", providers: [{ name: "AutoCheck", originalReportDate: null }] } } } } } };
        if (loseResponse) { loseResponse = false; throw new Error("Synthetic response lost"); }
      }
      return Response.json(state.agreement);
    }
    if (new URL(url).pathname.endsWith("/order")) return Response.json(state);
    return Response.json({ id, mine: true, assignmentVersion: 1, createdAt: "2026-11-21T05:00:00.000Z", status: "enquiry", sourceListingId: null,
      requester: { displayName: "Synthetic customer", nameNumber: 1186, deleted: false }, assignedOperator: { id: actorId, displayName: "Synthetic operator", nameNumber: 1187 } });
  }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function render(locale: "en" | "ru" | "tk" = "en") {
  const panel = (): React.ReactNode => <VinCorrectionPanel {...{ locale, id, version: 1, scope, actorId, state, invalidate }}
    onOrder={(next) => { state = next; root.render(panel()); }} />;
  await act(async () => root.render(panel()));
  return within(container);
}
it.each([
  ["en", "Correction responsibility", "Review and recheck availability", "Confirm the corrected VIN"],
  ["ru", "Ответственность за исправление", "Проверить исправление и доступность", "Подтвердите исправленный VIN"],
  ["tk", "Düzedişe jogapkärçilik", "Düzedişi we elýeterliligi barla", "Düzedilen VIN-i tassyklaň"],
] as const)("reviews a customer correction in %s while retaining old VIN, format and provider date", async (locale, label, button, reviewed) => {
  const view = await render(locale);
  expect((view.getByRole("button", { name: button }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => fireEvent.change(view.getByLabelText(label), { target: { value: "company_error" } }));
  await act(async () => fireEvent.click(view.getByRole("button", { name: button })));
  await waitFor(() => expect(view.getByRole("heading", { name: reviewed })).toBeTruthy());
  expect(view.getByText("DEMA0000000000001")).toBeTruthy();
  expect(view.getByText("2026-10-14")).toBeTruthy();
  expect(sent).toEqual([expect.objectContaining({ kind: "review", expectedVersion: 1, expectedAssignmentVersion: 1, cause: "company_error", format: "both" })]);
});
it("retries an uncertain review with the original immutable intent and refuses changed authority", async () => {
  loseResponse = true;
  const view = await render();
  await act(async () => fireEvent.change(view.getByLabelText("Correction responsibility"), { target: { value: "customer_correction" } }));
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Review and recheck availability" })));
  await act(async () => fireEvent.click(await view.findByRole("button", { name: "Retry correction" })));
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
  denied = true;
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Refresh correction" })));
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ status: "denied" }));
});
