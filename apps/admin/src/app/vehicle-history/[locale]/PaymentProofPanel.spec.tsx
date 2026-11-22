// @vitest-environment happy-dom
import { createHash } from "node:crypto";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "http://admin.test" }),
  cookies: async () => ({ get: () => ({ value: state.token }) }) }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined }));
import { PaymentProofPanel } from "./PaymentProofPanel";
import { HistoricalPaymentEvidence } from "./payment-evidence/HistoricalPaymentEvidence";

const actor = { id: "10000000-0000-4000-8000-000000001213", displayName: "Synthetic operator", nameNumber: 1213 };
const id = "10000000-0000-4000-8000-000000001231", fileId = "20000000-0000-4000-8000-000000001231";
const sid = "30000000-0000-4000-8000-000000001231";
const scope = createHash("sha256").update(`history-inbox\0${actor.id}\0${sid}`).digest("hex");
const file = { id: fileId, orderId: id, purpose: "payment_evidence", status: "submitted", contentType: "image/png", sizeBytes: 100,
  createdAt: "2026-11-21T05:00:00.000Z", expiresAt: "2026-11-22T05:00:00.000Z", submittedAt: "2026-11-21T05:01:00.000Z" };
let root: Root, container: HTMLDivElement;
let denied: boolean, empty: boolean, unavailable: boolean, received: unknown[];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("API_BASE_URL", "http://api.test"); vi.stubEnv("ADMIN_ORIGIN", "http://admin.test");
  state.token = `e30.${Buffer.from(JSON.stringify({ sub: actor.id, sid, exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.synthetic`;
  denied = false; empty = false; unavailable = false; received = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/desk")) return Response.json({ purpose: "vehicle-history", mode: "synthetic", actor, requests: [] });
    if (path.includes("payment-proof") || path.includes("payment-evidence")) {
      if (init?.body) received.push(JSON.parse(String(init.body)));
      if (denied) return Response.json({ code: "HISTORY_PROOF_DENIED" }, { status: 403 });
      if (unavailable) return Response.json({ code: "HISTORY_PROOF_UNAVAILABLE" }, { status: 503 });
      return Response.json(path.endsWith("/content") || path.endsWith("/read") ? { file, dataBase64: "c3ludGhldGlj" } : { items: empty ? [] : [file] });
    }
    return Response.json({ id, createdAt: "2026-11-21T05:00:00.000Z", status: "enquiry", mine: true, assignmentVersion: 1,
      requester: { displayName: "Synthetic customer", nameNumber: 1231, deleted: false }, assignedOperator: actor, sourceListingId: null });
  }));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const element = (selector: string) => {
  const node = container.querySelector(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
};
const button = (name: string) => {
  const node = [...container.querySelectorAll("button")].find((item) => item.textContent === name);
  if (!node) throw new Error(`Missing button ${name}`);
  return node;
};
const panel = (locale: "en" | "ru" | "tk" = "en", revision = 0) => <PaymentProofPanel {...{ locale, id, version: 1, scope, actorId: actor.id, revision }} invalidate={() => undefined} />;

it.each([["en", "View receipt"], ["ru", "Посмотреть квитанцию"], ["tk", "Çegi gör"]] as const)("opens private assignee evidence in %s through the real action/API bridge", async (locale, view) => {
  await act(async () => root.render(panel(locale)));
  await waitFor(() => expect(button(view)).toBeTruthy());
  await act(async () => button(view).click());
  await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,c3ludGhldGlj"));
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes(`/${fileId}/content?expectedAssignmentVersion=1`))).toBe(true);
});
it("shows empty/error recovery and removes open evidence when current authority is refused", async () => {
  empty = true;
  await act(async () => root.render(panel()));
  await waitFor(() => expect(container.textContent).toContain("No receipt submitted yet."));
  empty = false; unavailable = true;
  await act(async () => button("Refresh receipts").click());
  await waitFor(() => expect(container.textContent).toContain("Could not open receipts."));
  unavailable = false;
  await act(async () => button("Refresh receipts").click());
  await waitFor(() => expect(button("View receipt")).toBeTruthy());
  await act(async () => button("View receipt").click());
  await waitFor(() => expect(container.querySelector("img")).toBeTruthy());
  denied = true;
  await act(async () => button("Refresh receipts").click());
  await waitFor(() => expect(container.textContent).toContain("Receipt access changed."));
  expect(container.querySelector("img")).toBeNull();
});
it("does not reveal delayed bytes after selection changes", async () => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const original = vi.mocked(fetch).getMockImplementation();
  if (!original) throw new Error("Missing HTTP boundary");
  vi.mocked(fetch).mockImplementation(async (...args) => {
    const response = await original(...args);
    if (String(args[0]).includes("/content")) await hold;
    return response;
  });
  await act(async () => root.render(panel()));
  await waitFor(() => expect(button("View receipt")).toBeTruthy());
  await act(async () => button("View receipt").click());
  await act(async () => root.render(<PaymentProofPanel locale="en" id="10000000-0000-4000-8000-000000001299" version={1} scope={scope} actorId={actor.id} revision={1} invalidate={() => undefined} />));
  await act(async () => release());
  expect(container.querySelector("img")).toBeNull();
});

it("discards receipt bytes after losing focus and permits a fresh read", async () => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const original = vi.mocked(fetch).getMockImplementation();
  if (!original) throw new Error("Missing HTTP boundary");
  vi.mocked(fetch).mockImplementation(async (...args) => {
    const response = await original(...args);
    if (String(args[0]).includes("/content")) await hold;
    return response;
  });
  await act(async () => root.render(panel()));
  await waitFor(() => expect(button("View receipt")).toBeTruthy());
  await act(async () => button("View receipt").click());
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/content"))).toBe(true));
  const focus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
  try { await act(async () => window.dispatchEvent(new Event("blur"))); }
  finally { focus.mockRestore(); }
  await act(async () => release());

  expect(container.querySelector("img")).toBeNull();
  expect(button("Refresh receipts").disabled).toBe(false);
  await act(async () => button("Refresh receipts").click());
  await waitFor(() => expect(button("View receipt")).toBeTruthy());
});
it("requires an exact receipt and a reason for historical access, retaining work on denied/retry", async () => {
  await act(async () => root.render(<HistoricalPaymentEvidence locale="en" />));
  const edit = async (name: string, value: string) => act(async () => fireEvent.change(element(`[name="${name}"]`), { target: { value } }));
  await edit("requestId", id); await edit("fileId", fileId); await edit("reason", "Synthetic disputed transfer review");
  denied = true;
  const submit = () => act(async () => element("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await submit();
  await waitFor(() => expect(container.textContent).toContain("Receipt access changed."));
  expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Synthetic disputed transfer review");
  denied = false; await submit();
  await waitFor(() => expect(container.textContent).toContain("Receipt access recorded with your reason."));
  expect(received).toEqual(Array(2).fill({ requestId: id, fileId, reason: "Synthetic disputed transfer review", purpose: "payment_evidence" }));
  expect(container.querySelector("img")).toBeTruthy();
  await edit("fileId", "20000000-0000-4000-8000-000000001299");
  expect(container.querySelector("img")).toBeNull();
});

it("lets keyboard users reach the receipt and keeps focus in the dialog until Escape", async () => {
  await act(async () => root.render(panel()));
  await waitFor(() => expect(button("View receipt")).toBeTruthy());
  await act(async () => button("View receipt").click());
  const dialog = await within(container).findByRole("dialog");
  const close = within(dialog).getByRole("button", { name: "Close receipt" });
  const tab = (target: HTMLElement, shiftKey = false) => fireEvent.keyDown(target, { key: "Tab", shiftKey });

  expect(document.activeElement).toBe(close);
  expect(tab(close)).toBe(true);
  const receipt = within(dialog).getByRole("region", { name: "Private payment receipt" });
  expect(receipt.tabIndex).toBe(0);
  expect(within(receipt).getByRole("img")).toBeTruthy();

  expect(tab(close, true)).toBe(false);
  expect(document.activeElement).toBe(receipt);
  expect(fireEvent.keyDown(receipt, { key: "PageDown" })).toBe(true);
  expect(tab(receipt, true)).toBe(true);
  expect(tab(receipt)).toBe(false);
  expect(document.activeElement).toBe(close);

  await act(async () => dialog.dispatchEvent(new Event("cancel", { cancelable: true })));
  expect(container.querySelector("dialog")).toBeNull();
  expect(document.activeElement?.textContent).toBe("View receipt");
});
