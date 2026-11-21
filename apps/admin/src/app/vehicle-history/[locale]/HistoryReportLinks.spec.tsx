// @vitest-environment happy-dom

import { act } from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { http } from "msw";
import { setupServer } from "msw/node";

const platform = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  return { token: "", path: "/vehicle-history/en", requestCookies: new AsyncLocalStorage<string>() };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers(),
  cookies: async () => ({ get: () => {
    const value = platform.requestCookies.getStore() ?? platform.token;
    return value ? { value } : undefined;
  } }) }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {},
  usePathname: () => platform.path, useSearchParams: () => new URLSearchParams(window.location.search) }));
import { HistoryInbox } from "./HistoryInbox";

import { HistoryWorkbench } from "@/components/HistoryWorkbench";
const actor = { id: "12150000-0000-4000-8000-000000000001", displayName: "Ayna", nameNumber: 1215 };
const colleague = { id: "12150000-0000-4000-8000-000000000003", displayName: "Murat", nameNumber: 1216 };
const id = "12150000-0000-4000-8000-000000000002";
const row = { id, status: "enquiry", createdAt: "2026-11-15T01:00:00.000Z", mine: false, assignmentVersion: 0,
  requester: { displayName: "Merdan", nameNumber: 4444, deleted: false }, assignedOperator: null };
let assigned: boolean, handedOver: boolean;
let text: string;
let requests: { path: string; method: string; body: unknown }[];
const token = (sid = id, sub = actor.id) => `e30.${Buffer.from(JSON.stringify({ sub, sid })).toString("base64url")}.synthetic`;
function view() { return <HistoryWorkbench locale="en" section="desk"><HistoryInbox locale="en" /></HistoryWorkbench>; }
function detail() { return { ...row, mine: true, assignmentVersion: 1, assignedOperator: actor, sourceListingId: null }; }
async function editableComposer(name: string) {
  return waitFor(() => {
    const input = screen.getByRole<HTMLTextAreaElement>("textbox", { name });
    expect(input.disabled).toBe(false);
    return input;
  });
}
async function enabledButton(name: string) {
  return waitFor(() => {
    const button = screen.getByRole<HTMLButtonElement>("button", { name });
    expect(button.disabled).toBe(false);
    return button;
  });
}
const server = setupServer(http.all("http://api.test/api/v1/*", async ({ request }) => {
    const input = request.url;
    const init = { method: request.method, body: request.method === "POST" ? await request.text() : undefined };
    const url = new URL(input); requests.push({ path: url.pathname + url.search, method: init?.method ?? "GET", body: init?.body });
    if (url.pathname.endsWith("/desk")) return Response.json({ purpose: "vehicle-history", mode: "synthetic", actor, requests: [] });
    if (url.pathname.endsWith("/offer")) return Response.json({ version: 0, vin: null, preflight: null, proposal: null, synthetic: true });
    if (url.pathname.endsWith("/assignees")) return Response.json({ items: [colleague] });
    if (url.pathname.endsWith("/handover")) {
      handedOver = true;
      return Response.json({ id, assignmentVersion: 2, assignedOperator: colleague }, { status: 201 });
    }
    if (url.pathname.endsWith("/claim")) { assigned = true; return Response.json(detail()); }
    if (url.pathname.endsWith("/receipts")) {
      if (init?.method !== "POST") return Response.json({ items: [] });
      const body = JSON.parse(String(init.body));
      const order = body.cursor === id ? "1" : body.cursor === actor.id ? "2" : String(Number(String(body.cursor).slice(-12)));
      return Response.json({ participantId: actor.id, assignmentVersion: 1, receivedOrder: order, readOrder: body.kind === "read" ? order : "0" });
    }
    if (url.pathname.endsWith("/messages") && url.searchParams.has("cursor")) return Response.json({ items: [], nextCursor: null });
    if (url.pathname.endsWith("/messages")) return Response.json({ items: [{ id, clientMessageId: id, order: "1", kind: "TEXT",
      text, author: { ...actor, kind: "requester" }, createdAt: row.createdAt }], nextCursor: null });
    if (url.pathname.endsWith("/reminder")) return Response.json(reminder());
    if (url.pathname.endsWith("/notes")) {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return Response.json({ id: body.clientNoteId, clientNoteId: body.clientNoteId, text: body.text,
          createdAt: row.createdAt, author: actor }, { status: 201 });
      }
      return Response.json({ items: [], nextCursor: null });
    }
    if (url.pathname.endsWith(id)) return handedOver ? Response.json({}, { status: 403 }) : Response.json(detail());
    if (handedOver && url.searchParams.get("filter") === "mine") return Response.json({ items: [], nextCursor: null });
    return Response.json({ items: [assigned ? { ...row, mine: true, assignmentVersion: 1, assignedOperator: actor } : row], nextCursor: null });
}));
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("API_BASE_URL", "http://api.test");
  text = "First (https://reports.example.test/a?token=A%2fb%2B&part=1&part=2),\nthen <https://reports.example.test/b?opaque=one,;.!&next=(two)>; done.";
  platform.token = token(); assigned = true; handedOver = false; requests = [];
  window.history.replaceState(null, "", `/vehicle-history/en?filter=mine&selected=${id}&v=1`);
  vi.stubGlobal("fetch", vi.fn(fetch));
});
afterEach(async () => {
  cleanup();
  await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
  server.resetHandlers();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
it("opens and copies distinct exact report targets without changing the conversation or draft", async () => {
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(view());
  await screen.findByText(text, { normalizer: value => value });
  const input = await editableComposer("Reply to customer");
  fireEvent.change(input, { target: { value: "Keep my reply" } });
  fireEvent.click(await enabledButton("Open report 1"));
  expect(open).toHaveBeenCalledWith("https://reports.example.test/a?token=A%2fb%2B&part=1&part=2", "_blank", "noopener,noreferrer");
  fireEvent.click(await enabledButton("Copy link 2"));
  await screen.findByText("Link copied.");
  expect(writeText).toHaveBeenCalledWith("https://reports.example.test/b?opaque=one,;.!&next=(two)");
  expect(input.value).toBe("Keep my reply");
  expect(requests.filter(r => r.method === "POST" && !r.path.includes("receipts"))).toEqual([]);
  expect(requests.filter(r => r.method === "POST" && r.path.includes("receipts")).every(r => JSON.parse(String(r.body)).kind === "received")).toBe(true);
});
function reminder() { return { reason: "customer_answer", since: "2026-11-14T01:00:00.000Z", version: 3,
  eligibleAt: "2026-11-15T01:00:00.000Z", eligible: true, ineligibleReason: null, declined: false, stopped: false, used: false, outcome: null }; }
it.each([
  ["Read https://reports.example.test/report.", "https://reports.example.test/report"],
  ["Read [https://reports.example.test/report?x=(one)&part=1&part=2].", "https://reports.example.test/report?x=(one)&part=1&part=2"],
  ["Read “https://reports.example.test/report?x=a%2Eb”; done.", "https://reports.example.test/report?x=a%2Eb"],
  ["https://reports.example.test/report?opaque=a,;.!", "https://reports.example.test/report?opaque=a,;.!"],
  ["Read 'https://reports.example.test/report?token=O'Reilly&part=1&part=2'.", "https://reports.example.test/report?token=O'Reilly&part=1&part=2"],
  ["https://reports.example.test/report?opaque=a,b;c.!?&empty=&part=1&&part=2#A%2fb%2B", "https://reports.example.test/report?opaque=a,b;c.!?&empty=&part=1&&part=2#A%2fb%2B"],
])("preserves the exact intended target in %s", async (message, target) => {
  text = message;
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(view());
  fireEvent.click(await enabledButton("Open report 1"));
  fireEvent.click(await enabledButton("Copy link 1"));
  await screen.findByText("Link copied.");
  expect(open).toHaveBeenCalledWith(target, "_blank", "noopener,noreferrer");
  expect(writeText).toHaveBeenCalledWith(target);
});
it("keeps immediately adjacent links distinct", async () => {
  text = "(https://reports.example.test/a),(https://reports.example.test/b)";
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  render(view());
  fireEvent.click(await enabledButton("Open report 2"));
  expect(open).toHaveBeenLastCalledWith("https://reports.example.test/b", "_blank", "noopener,noreferrer");
  fireEvent.click(await enabledButton("Open report 1"));
  expect(open).toHaveBeenLastCalledWith("https://reports.example.test/a", "_blank", "noopener,noreferrer");
});
it.each([
  "http://reports.example.test/a", "javascript:https://reports.example.test/a",
  'https://reports.example.test/a?token=one"two', "https://reports.example.test/a<unsafe",
  "https://user:secret@reports.example.test/a", "https://@reports.example.test/a",
  "https:///reports.example.test/a", "https://reports.example.test:99999/a",
  "https://reports.example.test/a%zz", "https://reports.example.test/a\\unsafe",
  "https://[broken/a", "ftp://reports.example.test/a",
])("leaves unsafe or malformed addresses as selectable plain text: %s", async message => {
  text = message;
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  render(view());
  await screen.findByText(text);
  await editableComposer("Reply to customer");
  expect(screen.queryByRole("button", { name: /Open report|Copy link/ })).toBeNull();
  expect(screen.queryByRole("link", { name: text })).toBeNull();
  expect(open).not.toHaveBeenCalled();
});
it("offers truthful recovery after a rejected clipboard action and a throwing browser action", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => { throw new Error("synthetic private diagnostics"); });
  const writeText = vi.fn().mockRejectedValueOnce(new Error("synthetic private diagnostics")).mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(view());
  fireEvent.click(await enabledButton("Copy link 1"));
  await screen.findByText("Could not copy the link. Try again or select and copy it from the message.");
  expect(screen.queryByText("Link copied.")).toBeNull();
  fireEvent.click(await enabledButton("Retry copying 1"));
  await screen.findByText("Link copied.");
  fireEvent.click(await enabledButton("Open report 1"));
  await screen.findByText("Could not open the report. Retry or copy the link.");
  expect(document.body.textContent).not.toContain("synthetic private diagnostics");
  open.mockReturnValue(null);
  fireEvent.click(await enabledButton("Retry opening 1"));
  await screen.findByText("If the report did not open, allow pop-ups and retry, or copy the link.");
});
it("waits for Clipboard completion and discards its late result after assignment loss", async () => {
  let complete!: () => void;
  const writeText = vi.fn(() => new Promise<void>(resolve => { complete = resolve; }));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(view());
  fireEvent.click(await enabledButton("Copy link 1"));
  expect(screen.queryByText("Link copied.")).toBeNull();
  expect((screen.getByRole("button", { name: "Copy link 1" }) as HTMLButtonElement).disabled).toBe(true);
  server.use(http.get(`http://api.test/api/v1/vehicle-history/operator/requests/${id}`,
    () => Response.json({ code: "HISTORY_ASSIGNMENT_CONFLICT" }, { status: 409 })));
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Assignment changed. Refresh before continuing.");
  await act(async () => complete());
  expect(screen.queryByText("Link copied.")).toBeNull();
  expect(screen.queryByRole("button", { name: "Open report 1" })).toBeNull();
});
it.each([
  ["en", "Open report", "Copy link"],
  ["ru", "Открыть отчёт", "Скопировать ссылку"],
  ["tk", "Hasabaty aç", "Salgyny göçür"],
] as const)("localizes distinguishable accessible actions in %s", async (locale, openLabel, copyLabel) => {
  render(<HistoryWorkbench locale={locale} section="desk"><HistoryInbox locale={locale} /></HistoryWorkbench>);
  await enabledButton(`${openLabel} 1`);
  expect(screen.getByRole("button", { name: `${copyLabel} 2` })).toBeDefined();
  expect(screen.getByText(text, { normalizer: value => value }).className).toContain("[overflow-wrap:anywhere]");
});
it("retains the reader position and reply across browser return", async () => {
  vi.spyOn(window, "open").mockReturnValue(null);
  render(view());
  const input = await editableComposer("Reply to customer");
  fireEvent.change(input, { target: { value: "Retained reply" } });
  const pane = screen.getByRole("list", { name: "Enquiry conversation" });
  pane.scrollTop = 120;
  fireEvent.scroll(pane);
  fireEvent.click(await enabledButton("Open report 1"));
  fireEvent(window, new Event("focus"));
  await enabledButton("Open report 1");
  expect(pane.scrollTop).toBe(120);
  expect(input.value).toBe("Retained reply");
  expect(window.location.search).toBe(`?filter=mine&selected=${id}&v=1`);
});
it("ignores old-session Clipboard completion after the viewer changes", async () => {
  let complete!: () => void;
  Object.defineProperty(navigator, "clipboard", { configurable: true,
    value: { writeText: () => new Promise<void>(resolve => { complete = resolve; }) } });
  render(view());
  fireEvent.click(await enabledButton("Copy link 1"));
  platform.token = token("12150000-0000-4000-8000-000000000004");
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Access denied");
  await act(async () => complete());
  expect(screen.queryByText("Link copied.")).toBeNull();
  expect(screen.queryByRole("button", { name: "Open report 1" })).toBeNull();
});
