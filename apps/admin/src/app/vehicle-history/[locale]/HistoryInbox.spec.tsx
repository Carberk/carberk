// @vitest-environment happy-dom
import { PassThrough } from "node:stream";

import { act, cloneElement, isValidElement, type ReactNode } from "react";
import { renderToPipeableStream } from "react-dom/server";
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
import HistoryDeskPage from "./page";

import { HistoryWorkbench } from "@/components/HistoryWorkbench";
const actor = { id: "12150000-0000-4000-8000-000000000001", displayName: "Ayna", nameNumber: 1215 };
const id = "12150000-0000-4000-8000-000000000002";
const row = { id, status: "enquiry", createdAt: "2026-11-15T01:00:00.000Z", mine: false, assignmentVersion: 0,
  requester: { displayName: "Merdan", nameNumber: 4444, deleted: false }, assignedOperator: null };
let assigned: boolean;
let requests: { path: string; method: string; body: unknown }[];
const token = (sid = id, sub = actor.id) => `e30.${Buffer.from(JSON.stringify({ sub, sid })).toString("base64url")}.synthetic`;
function view() { return <HistoryWorkbench locale="en" section="desk"><HistoryInbox locale="en" /></HistoryWorkbench>; }
function detail() { return { ...row, mine: true, assignmentVersion: 1, assignedOperator: actor, sourceListingId: null }; }
const server = setupServer(http.all("http://api.test/api/v1/*", async ({ request }) => {
    const input = request.url;
    const init = { method: request.method, body: request.method === "POST" ? await request.text() : undefined };
    const url = new URL(input); requests.push({ path: url.pathname + url.search, method: init?.method ?? "GET", body: init?.body });
    if (url.pathname.endsWith("/desk")) return Response.json({ purpose: "vehicle-history", mode: "synthetic", actor, requests: [] });
    if (url.pathname.endsWith("/claim")) { assigned = true; return Response.json(detail()); }
    if (url.pathname.endsWith("/receipts")) {
      if (init?.method !== "POST") return Response.json({ items: [] });
      const body = JSON.parse(String(init.body));
      const order = body.cursor === id ? "1" : body.cursor === actor.id ? "2" : String(Number(String(body.cursor).slice(-12)));
      return Response.json({ participantId: actor.id, assignmentVersion: 1, receivedOrder: order, readOrder: body.kind === "read" ? order : "0" });
    }
    if (url.pathname.endsWith("/messages")) return Response.json({ items: [{ id, clientMessageId: id, order: "1", kind: "TEXT",
      text: "Can you check this car?", author: { ...actor, kind: "requester" }, createdAt: row.createdAt }], nextCursor: null });
    if (url.pathname.endsWith("/notes")) {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return Response.json({ id: body.clientNoteId, clientNoteId: body.clientNoteId, text: body.text,
          createdAt: row.createdAt, author: actor }, { status: 201 });
      }
      return Response.json({ items: [], nextCursor: null });
    }
    if (url.pathname.endsWith(id)) return Response.json(detail());
    return Response.json({ items: [assigned ? { ...row, mine: true, assignmentVersion: 1, assignedOperator: actor } : row], nextCursor: null });
}));
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("API_BASE_URL", "http://api.test");
  platform.token = token(); assigned = false; requests = [];
  window.history.replaceState(null, "", "/vehicle-history/en");
  vi.stubGlobal("fetch", vi.fn(fetch));
});
afterEach(async () => {
  cleanup();
  await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
  server.resetHandlers();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
it("shows safe enquiry metadata, then claims atomically before opening the real transcript", async () => {
  render(view());
  await waitFor(() => expect(requests.map(r => r.path)).toContain("/api/v1/vehicle-history/operator/requests?filter=unassigned"));
  fireEvent.click(await screen.findByRole("link", { name: /Merdan/ }));
  await screen.findByRole("button", { name: "Claim enquiry" });
  expect(screen.queryByText("Can you check this car?")).toBeNull();
  expect(requests.some((r) => r.path.includes("/messages"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Claim enquiry" }));
  await screen.findByText("Can you check this car?");
  expect(screen.getAllByText("Ayna").length).toBeGreaterThan(0);
  expect(requests.filter((r) => r.method === "POST" && !r.path.includes("receipts"))).toEqual([{ path: `/api/v1/vehicle-history/operator/requests/${id}/claim`, method: "POST", body: '{"expectedAssignmentVersion":0}' }]);
  expect(requests.filter((r) => r.path.includes("receipts") && r.method === "POST").every((r) => JSON.parse(String(r.body)).kind === "received")).toBe(true);
  expect(screen.getByRole("textbox", { name: "Reply to customer" })).toBeDefined();
  expect(screen.getByRole("textbox", { name: "Internal note" })).toBeDefined();
  await waitFor(() => expect(document.activeElement?.id).toBe("selected-enquiry"));
});
it("keeps an attributed private note in the staff panel and out of the customer conversation", async () => {
  selectAssigned();
  render(view());
  await screen.findByText("Can you check this car?");
  const note = await screen.findByRole("textbox", { name: "Internal note" });
  expect(note).not.toBe(screen.getByRole("textbox", { name: "Reply to customer" }));
  fireEvent.change(note, { target: { value: "Check the record before replying" } });
  fireEvent.click(screen.getByRole("button", { name: "Add private note" }));
  await waitFor(() => expect(requests.some((request) => request.method === "POST" && request.path.endsWith("/notes"))).toBe(true));
  expect(requests.some((request) => request.method === "POST" && request.path.endsWith("/messages"))).toBe(false);
  expect(screen.getByRole("list", { name: "Enquiry conversation" }).textContent).not.toContain("Check the record before replying");
  expect(screen.getByRole("region", { name: "Private staff notes" }).textContent).toContain("Check the record before replying");
});
it("restores an unsent private note separately from the public reply after remount", async () => {
  selectAssigned();
  const mounted = render(view());
  const note = await screen.findByRole("textbox", { name: "Internal note" });
  fireEvent.change(note, { target: { value: "Staff-only draft" } });
  await screen.findByText("Draft saved on this device.");
  expect((screen.getByRole("textbox", { name: "Reply to customer" }) as HTMLTextAreaElement).value).toBe("");
  mounted.unmount();
  render(view());
  await waitFor(() => expect((screen.getByRole("textbox", { name: "Internal note" }) as HTMLTextAreaElement).value).toBe("Staff-only draft"));
  expect((screen.getByRole("textbox", { name: "Reply to customer" }) as HTMLTextAreaElement).value).toBe("");
  expect(localStorage.getItem(`carberk.history.private-note.v1:${actor.id}:${id}:1`)).toContain("Staff-only draft");
});
it("retries an unconfirmed private note with its original identity while retaining a newer draft", async () => {
  selectAssigned();
  const network = networkHandler();
  let attempts = 0;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (new URL(String(input)).pathname.endsWith("/notes") && init?.method === "POST") {
      attempts++;
      const response = await network(input, init);
      if (attempts === 1) throw new Error("Response lost");
      return response;
    }
    return network(input, init);
  });
  render(view());
  const note = await screen.findByRole("textbox", { name: "Internal note" });
  fireEvent.change(note, { target: { value: "First staff note" } });
  fireEvent.click(screen.getByRole("button", { name: "Add private note" }));
  await screen.findByRole("button", { name: "Retry this note" });
  fireEvent.change(note, { target: { value: "Newer staff draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Retry this note" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Retry this note" })).toBeNull());
  expect((note as HTMLTextAreaElement).value).toBe("Newer staff draft");
  const posts = requests.filter((request) => request.method === "POST" && request.path.endsWith("/notes"));
  expect(posts).toHaveLength(2);
  expect(JSON.parse(String(posts[0]?.body)).clientNoteId).toBe(JSON.parse(String(posts[1]?.body)).clientNoteId);
  expect(screen.getByRole("region", { name: "Private staff notes" }).textContent).toContain("First staff note");
  expect(screen.getByRole("list", { name: "Enquiry conversation" }).textContent).not.toContain("First staff note");
});
it("blocks a private note when its durable intent cannot be stored, then allows explicit recovery", async () => {
  selectAssigned();
  render(view());
  const note = await screen.findByRole("textbox", { name: "Internal note" });
  fireEvent.change(note, { target: { value: "Durable note" } });
  const storage = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("Disk full"); });
  fireEvent.click(screen.getByRole("button", { name: "Add private note" }));
  await screen.findByText("Note draft not saved. Retry saving it.");
  expect(requests.some((request) => request.method === "POST" && request.path.endsWith("/notes"))).toBe(false);
  storage.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: "Retry saving note draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Retry this note" }));
  await waitFor(() => expect(requests.some((request) => request.method === "POST" && request.path.endsWith("/notes"))).toBe(true));
});
it("shows a separate private-note read failure and recovers through its own Retry", async () => {
  selectAssigned();
  const network = networkHandler();
  let failed = true;
  vi.mocked(fetch).mockImplementation((input, init) => {
    if (new URL(String(input)).pathname.endsWith("/notes") && failed) return Promise.resolve(Response.json({}, { status: 503 }));
    return network(input, init);
  });
  render(view());
  await screen.findByText("Could not load private notes.");
  expect((screen.getByRole("button", { name: "Add private note" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Can you check this car?")).toBeDefined();
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry loading notes" }));
  await screen.findByText("No private notes yet.");
  expect((screen.getByRole("textbox", { name: "Internal note" }) as HTMLTextAreaElement).disabled).toBe(false);
});
it("discards a delayed private-note page after the selected request is disposed", async () => {
  selectAssigned();
  const network = networkHandler(), delayed = deferred<Response>();
  vi.mocked(fetch).mockImplementation((input, init) => new URL(String(input)).pathname.endsWith("/notes")
    ? delayed.promise : network(input, init));
  render(view());
  await screen.findByText("Can you check this car?");
  fireEvent.click(screen.getByRole("button", { name: "Unassigned" }));
  await waitFor(() => expect(screen.queryByRole("textbox", { name: "Internal note" })).toBeNull());
  await act(async () => delayed.resolve(Response.json({ items: [{ id, clientNoteId: id, text: "Old private body",
    createdAt: row.createdAt, author: actor }], nextCursor: null })));
  expect(screen.queryByText("Old private body")).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Reply to customer" })).toBeNull();
});
it("removes loaded private text when the note read loses current authority", async () => {
  selectAssigned();
  const network = networkHandler();
  let refused = false;
  vi.mocked(fetch).mockImplementation((input, init) => {
    if (new URL(String(input)).pathname.endsWith("/notes")) return Promise.resolve(refused
      ? Response.json({}, { status: 403 }) : Response.json({ items: [{ id, clientNoteId: id, text: "Staff-only fact",
        createdAt: row.createdAt, author: actor }], nextCursor: null }));
    return network(input, init);
  });
  render(view());
  await screen.findByText("Staff-only fact");
  refused = true;
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(screen.queryByText("Staff-only fact")).toBeNull());
  expect(screen.queryByRole("textbox", { name: "Internal note" })).toBeNull();
});
it("pages attributed private notes without adding them to the customer transcript", async () => {
  selectAssigned();
  const network = networkHandler();
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith("/notes")) return network(input, init);
    const second = url.searchParams.has("cursor");
    return Promise.resolve(Response.json({ items: [{ id: second ? id : actor.id, clientNoteId: id,
      text: second ? "Second private note" : "First private note", createdAt: row.createdAt,
      author: second ? { ...actor, displayName: "Selbi" } : actor }], nextCursor: second ? null : actor.id }));
  });
  render(view());
  await screen.findByText("First private note");
  fireEvent.click(screen.getByRole("button", { name: "More notes" }));
  await screen.findByText("Second private note");
  expect(screen.getByRole("region", { name: "Private staff notes" }).textContent).toContain("Selbi");
  expect(screen.getByRole("list", { name: "Enquiry conversation" }).textContent).not.toContain("private note");
});
it.each([
  ["tk", "Içerki bellik", "Şahsy bellik goş", "Müşderä iberilmeýär."],
  ["ru", "Внутренняя заметка", "Добавить личную заметку", "Не отправляются клиенту."],
  ["en", "Internal note", "Add private note", "Never sent to the customer."],
] as const)("keeps the private action and privacy consequence clear in %s", async (locale, label, action, consequence) => {
  assigned = true; platform.path = `/vehicle-history/${locale}`;
  window.history.replaceState(null, "", `${platform.path}?filter=mine&selected=${id}&v=1`);
  render(<HistoryWorkbench locale={locale} section="desk"><HistoryInbox locale={locale} /></HistoryWorkbench>);
  expect(await screen.findByRole("textbox", { name: label })).toBeDefined();
  expect(screen.getByRole("button", { name: action })).toBeDefined();
  expect(screen.getByText(consequence)).toBeDefined();
});
it("retains queue, search, page and selection in locale links and restores Back/refresh", async () => {
  const snapshot = `/vehicle-history/en?filter=mine&search=Merdan&cursor=${id}&selected=${id}&v=1`;
  window.history.replaceState(null, "", snapshot); assigned = true;
  const mounted = render(view());
  await screen.findByText("Can you check this car?");
  expect(screen.getByRole("link", { name: "RU" }).getAttribute("href"))
    .toBe(`/vehicle-history/ru?filter=mine&search=Merdan&cursor=${id}&selected=${id}&v=1`);
  fireEvent.click(screen.getByRole("button", { name: "Unassigned" }));
  expect(window.location.search).toBe("?filter=unassigned&search=Merdan");
  expect(screen.queryByText("Can you check this car?")).toBeNull();
  await act(async () => { window.history.replaceState(null, "", snapshot); window.dispatchEvent(new Event("popstate")); });
  await screen.findByText("Can you check this car?");
  mounted.unmount(); render(view());
  await screen.findByText("Can you check this car?");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "New name" } });
  fireEvent.submit(searchForm());
  expect(window.location.search).toBe("?filter=mine&search=New+name");
});
it("retains the transcript when offline and reconciles after reconnect", async () => {
  assigned = true; window.history.replaceState(null, "", `?selected=${id}&v=1`);
  render(view()); await screen.findByText("Can you check this car?");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  await act(async () => window.dispatchEvent(new Event("offline")));
  expect(screen.getByText("Can you check this car?")).toBeDefined();
  await screen.findByText("You’re offline. Check your connection and retry.");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  await act(async () => window.dispatchEvent(new Event("online")));
  await screen.findByText("Can you check this car?");
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
it("never paints a delayed queue over the newer filter", async () => {
  const network = networkHandler();
  const delayed = deferred<Response>();
  let captured = false;
  vi.mocked(fetch).mockImplementation((input, init) => {
    if (String(input).includes("requests?filter=unassigned") && !captured) { captured = true; return delayed.promise; }
    return network(input, init);
  });
  render(view()); await waitFor(() => expect(captured).toBe(true));
  expect(screen.getByRole("status").textContent).toBe("Checking access…");
  fireEvent.click(screen.getByRole("button", { name: "Assigned to me" }));
  await screen.findByRole("link", { name: /Merdan/ });
  await act(async () => delayed.resolve(Response.json({ items: [{ ...row, requester: { ...row.requester, displayName: "Old queue" } }], nextCursor: null })));
  expect(screen.queryByRole("link", { name: /Old queue/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Assigned to me" }).getAttribute("aria-pressed")).toBe("true");
});
it.each(["detail", "transcript", "claim"] as const)("discards a delayed %s after selecting a different enquiry", async (kind) => {
  assigned = kind !== "claim";
  const network = networkHandler();
  const delayed = deferred<Response>();
  let captured = false;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const path = new URL(String(input)).pathname;
    const match = kind === "detail" ? path.endsWith(id) : path.endsWith(kind === "claim" ? "/claim" : "/messages");
    if (match && !captured) { captured = true; return delayed.promise; }
    return network(input, init);
  });
  render(view()); fireEvent.click(await screen.findByRole("link", { name: /Merdan/ }));
  if (kind === "claim") fireEvent.click(await screen.findByRole("button", { name: "Claim enquiry" }));
  await waitFor(() => expect(captured).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Assigned to me" }));
  await act(async () => delayed.resolve(kind === "transcript" ? Response.json({ items: [], nextCursor: null }) : Response.json(detail())));
  await screen.findByText("Select an enquiry to view its details.");
  expect(screen.queryByText("Can you check this car?")).toBeNull();
  expect(document.querySelector("#selected-enquiry")).toBeNull();
});
it.each(["actor", "session"] as const)("excludes delayed transcript after a new %s is authenticated", async (change) => {
  assigned = true;
  const delayed = deferred<Response>();
  const network = networkHandler();
  let captured = false;
  vi.mocked(fetch).mockImplementation((input, init) => {
    if (String(input).includes("/messages") && !captured) { captured = true; return delayed.promise; }
    if (String(input).endsWith("/desk") && change === "actor" && platform.token !== token()) {
      return Promise.resolve(Response.json({ purpose: "vehicle-history", mode: "synthetic", actor: { ...actor, id }, requests: [] }));
    }
    return network(input, init);
  });
  render(view()); fireEvent.click(await screen.findByRole("link", { name: /Merdan/ }));
  await waitFor(() => expect(captured).toBe(true));
  platform.token = change === "actor" ? token(id, id) : token(actor.id);
  await act(async () => delayed.resolve(Response.json({ items: [], nextCursor: null })));
  await screen.findByText("Access denied");
  expect(screen.queryByRole("list", { name: "Enquiry conversation" })).toBeNull();
  expect(document.querySelector("#selected-enquiry")).toBeNull();
});
it("removes earlier transcript pages on assignment loss and offers Refresh", async () => {
  assigned = true;
  const network = networkHandler();
  let changed = false;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (String(input).includes("/messages")) {
      if (changed) return Response.json({}, { status: 409 });
      const result = await network(input, init);
      return Response.json({ ...await result.json(), nextCursor: id });
    }
    return network(input, init);
  });
  render(view()); fireEvent.click(await screen.findByRole("link", { name: /Merdan/ }));
  await screen.findByText("Can you check this car?"); changed = true;
  fireEvent.click(screen.getByRole("button", { name: "More messages" }));
  await screen.findByText("Assignment changed. Refresh before continuing.");
  expect(screen.queryByText("Can you check this car?")).toBeNull();
  expect(screen.getAllByRole("button", { name: "Refresh" })).toHaveLength(2);
  changed = false; fireEvent.click(screen.getAllByRole("button", { name: "Refresh" }).at(-1) as HTMLButtonElement);
  await screen.findByText("Select an enquiry to view its details.");
  fireEvent.click(await screen.findByRole("link", { name: /Merdan/ }));
  await screen.findByText("Can you check this car?");
});
it.each([403, 503])("shows a genuine HTTP %s refusal and recovers with Retry", async (status) => {
  const network = networkHandler();
  let failed = true;
  vi.mocked(fetch).mockImplementation((input, init) => String(input).includes("/operator/") && failed
    ? Promise.resolve(Response.json({}, { status })) : network(input, init));
  render(view()); await screen.findByText(status === 403 ? "Access denied" : "Could not open the desk");
  expect(screen.queryByRole("link", { name: /Merdan/ })).toBeNull();
  failed = false; fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: /Merdan/ });
});
it("distinguishes an empty queue from search without results and refuses unsafe URL inputs", async () => {
  const network = networkHandler();
  vi.mocked(fetch).mockImplementation((input, init) => String(input).includes("/operator/")
    ? Promise.resolve(Response.json({ items: [], nextCursor: null })) : network(input, init));
  const mounted = render(view()); await screen.findByText("No enquiries yet");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Missing" } });
  fireEvent.submit(searchForm());
  await screen.findByText("No matching enquiries. Try another name or reference.");
  mounted.unmount();
  window.history.replaceState(null, "", "?filter=paid&cursor=https://foreign.test&selected=not-a-request");
  render(view()); await screen.findByText("This queue address is invalid. Retry to open the unassigned queue.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("No enquiries yet");
  expect(window.location.pathname + window.location.search).toBe("/vehicle-history/en?filter=unassigned");
  await act(async () => {
    window.history.replaceState(null, "", `?cursor=${id}`);
    window.dispatchEvent(new Event("popstate"));
  });
  await screen.findByText("No enquiries on this page.");
  expect(screen.getByRole("button", { name: "First page" })).toBeDefined();
});
it("ignores a pending result after the workbench is disposed", async () => {
  const delayed = deferred<Response>();
  vi.mocked(fetch).mockReturnValue(delayed.promise);
  const mounted = render(view()); mounted.unmount();
  await act(async () => delayed.resolve(Response.json({ purpose: "vehicle-history", mode: "synthetic", actor, requests: [] })));
  expect(document.body.textContent).toBe("");
});
it("shows an unavailable selection when its unclaimed row is no longer in the authorized queue", async () => {
  window.history.replaceState(null, "", `?selected=${actor.id}&v=0`);
  render(view());
  await screen.findByText("This enquiry is unavailable. Refresh the queue.");
  expect(screen.queryByRole("button", { name: "Claim enquiry" })).toBeNull();
  expect(screen.queryByText("Can you check this car?")).toBeNull();
});

it.each(["detail", "transcript", "claim", "page"] as const)("keeps a different enquiry visible when an old %s completes", async (kind) => {
  const other = "12150000-0000-4000-8000-000000000003";
  const another = { ...row, id: other, mine: true, assignmentVersion: 1, assignedOperator: actor,
    requester: { ...row.requester, displayName: "Selbi" } };
  assigned = kind !== "claim";
  const network = networkHandler();
  const delayed = deferred<Response>();
  let captured = false;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/requests")) return Response.json({ items: [assigned ? { ...row, mine: true, assignmentVersion: 1, assignedOperator: actor } : row, another], nextCursor: null });
    if (url.pathname.includes(other)) return url.pathname.endsWith("/messages")
      ? Response.json({ items: [], nextCursor: null }) : Response.json({ ...another, sourceListingId: null });
    const match = kind === "page" ? url.searchParams.has("cursor") : kind === "detail" ? url.pathname.endsWith(id) : url.pathname.endsWith(kind === "claim" ? "/claim" : "/messages");
    if (match && !captured) { captured = true; return delayed.promise; }
    const response = await network(input, init);
    if (kind === "page" && url.pathname.endsWith("/messages")) return Response.json({ ...await response.json(), nextCursor: id });
    return response;
  });
  render(view()); fireEvent.click(await screen.findByRole("link", { name: /Merdan/ }));
  if (kind === "claim") fireEvent.click(await screen.findByRole("button", { name: "Claim enquiry" }));
  if (kind === "page") fireEvent.click(await screen.findByRole("button", { name: "More messages" }));
  await waitFor(() => expect(captured).toBe(true));
  fireEvent.click(await screen.findByRole("link", { name: /Selbi/ }));
  await screen.findByText("No messages yet.");
  await act(async () => delayed.resolve(kind === "transcript" || kind === "page" ? Response.json({ items: [], nextCursor: null }) : Response.json(detail())));
  expect(screen.getByRole("heading", { name: "Selbi" }).id).toBe("selected-enquiry");
  expect(screen.queryByText("Can you check this car?")).toBeNull();
  expect(window.location.search).toContain(`selected=${other}`);
});

function networkHandler() {
  const handler = vi.mocked(fetch).getMockImplementation();
  if (!handler) throw new Error("Missing network boundary fixture");
  return handler;
}
function searchForm() {
  const form = screen.getByRole("searchbox").closest("form");
  if (!form) throw new Error("Missing rendered search form");
  return form;
}
it("pages the queue and transcript through real cursor URLs with explicit Received only", async () => {
  assigned = true;
  const network = networkHandler();
  let messagePage = 0;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const response = await network(input, init);
    if (url.pathname.endsWith("/requests")) return Response.json({ ...await response.json(), nextCursor: url.searchParams.has("cursor") ? null : id });
    if (url.pathname.endsWith("/messages")) {
      messagePage++;
      const page = await response.json();
      return Response.json(messagePage === 1 ? { ...page, nextCursor: id } : { items: [{ ...page.items[0], id: actor.id, order: "2", text: "Second page text" }], nextCursor: null });
    }
    return response;
  });
  render(view()); fireEvent.click(await screen.findByRole("button", { name: "Next page" }));
  await screen.findByRole("button", { name: "First page" });
  expect(window.location.search).toBe(`?cursor=${id}`);
  fireEvent.click(await screen.findByRole("link", { name: /Merdan/ }));
  await screen.findByText("Can you check this car?");
  fireEvent.click(screen.getByRole("button", { name: "More messages" }));
  await screen.findByText("Second page text");
  await waitFor(() => expect(document.activeElement?.textContent).toContain("Second page text"));
  expect(screen.getByText("Can you check this car?")).toBeDefined();
  expect(requests.filter((r) => r.method === "POST").every((r) => r.path.includes("receipts") && JSON.parse(String(r.body)).kind === "received")).toBe(true);
});
it.each([
  ["tk", "Ýüz tutmany al", "Ýüz tutmalaryň nobaty"],
  ["ru", "Взять обращение", "Очередь обращений"],
  ["en", "Claim enquiry", "Enquiry queue"],
] as const)("renders the real workbench and claim feedback in %s", async (locale, claim, filter) => {
  platform.path = `/vehicle-history/${locale}`;
  render(<HistoryWorkbench locale={locale} section="desk"><HistoryInbox locale={locale} /></HistoryWorkbench>);
  fireEvent.click(await screen.findByRole("link", { name: /Merdan/ }));
  await screen.findByRole("button", { name: claim });
  expect(document.querySelector('[lang]')?.getAttribute("lang")).toBe(locale);
  expect(screen.getByLabelText(filter)).toBeDefined();
  if (locale === "tk") expect(screen.getByText("15/11/2026, 06:00 GMT+5")).toBeDefined();
});

it.each(["page", "refresh"])("disposes the old inbox on a same-actor new-session render during %s, even with fixed old request cookies", async (work) => {
  assigned = true;
  window.history.replaceState(null, "", `?selected=${id}&v=1`);
  const network = networkHandler();
  const oldPage = deferred<Response>();
  const newPage = deferred<Response>();
  let phase: "initial" | "old-page" | "new-session" = "initial";
  let capturedOld = false;
  const message = (text: string) => ({ id, clientMessageId: id, order: "1", kind: "TEXT", text,
    author: { ...actor, kind: "requester" }, createdAt: row.createdAt });
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (String(input).includes("/messages")) {
      if (phase === "old-page") { capturedOld = true; return oldPage.promise; }
      if (phase === "new-session") return newPage.promise;
      return Response.json({ items: [message("Old session private text")], nextCursor: id });
    }
    return network(input, init);
  });
  const mounted = render(await resolveServerTree(await HistoryDeskPage({ params: Promise.resolve({ locale: "en" }) })));
  await screen.findByText("Old session private text");
  phase = "old-page";
  platform.requestCookies.run(platform.token, () => fireEvent.click(screen.getByRole("button", { name: work === "page" ? "More messages" : "Refresh" })));
  await waitFor(() => expect(capturedOld).toBe(true));
  platform.token = token(actor.id);
  phase = "new-session";
  await act(async () => mounted.rerender(await resolveServerTree(await HistoryDeskPage({ params: Promise.resolve({ locale: "en" }) }))));
  expect(screen.queryByText("Old session private text")).toBeNull();
  await act(async () => newPage.resolve(Response.json({ items: [message("Current session private text")], nextCursor: null })));
  await screen.findByText("Current session private text");
  await act(async () => oldPage.resolve(Response.json({ items: [message("Late old session private text")], nextCursor: null })));
  expect(screen.queryByText("Late old session private text")).toBeNull();
  expect(screen.getByText("Current session private text")).toBeDefined();
});

it("streams the first-entry loading state before the queue bootstrap resolves", async () => {
  const delayed = deferred<Response>();
  const network = networkHandler();
  vi.mocked(fetch).mockImplementation((input, init) => new URL(String(input)).pathname.endsWith("/requests")
    ? delayed.promise : network(input, init));
  let html = "";
  const finished = HistoryDeskPage({ params: Promise.resolve({ locale: "en" }) }).then((tree) => new Promise<void>((resolve, reject) => {
    const output = new PassThrough();
    output.on("data", (chunk) => { html += String(chunk); });
    output.on("end", resolve);
    output.on("error", reject);
    const stream = renderToPipeableStream(tree, { onShellReady: () => stream.pipe(output), onError: reject });
  }));
  try {
    await waitFor(() => expect(html).toContain("Checking access…"));
    expect(html).not.toContain("Merdan");
  } finally {
    delayed.resolve(Response.json({ items: [row], nextCursor: null }));
    await finished;
  }
  expect(html).toContain("Merdan");
});

async function resolveServerTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServerTree));
  if (!isValidElement<{ children?: ReactNode }>(node)) return node;
  if (typeof node.type === "function" && node.type.constructor.name === "AsyncFunction") {
    const serverComponent = node.type as (props: unknown) => Promise<ReactNode>;
    return resolveServerTree(await serverComponent(node.props));
  }
  return cloneElement(node, {}, await resolveServerTree(node.props.children));
}
it("retries a server failure without losing the selected enquiry URL", async () => {
  assigned = true;
  window.history.replaceState(null, "", `?filter=mine&selected=${id}&v=1`);
  const network = networkHandler();
  let unavailable = false;
  vi.mocked(fetch).mockImplementation((input, init) => unavailable && String(input).includes("/operator/")
    ? Promise.resolve(Response.json({}, { status: 503 })) : network(input, init));
  render(view()); await screen.findByText("Can you check this car?");
  unavailable = true;
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Could not update messages. Showing previously loaded messages.");
  expect(screen.getByText("Can you check this car?")).toBeDefined();
  unavailable = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(window.location.search).toBe(`?filter=mine&selected=${id}&v=1`);
  await screen.findByText("Can you check this car?");
});

const message = (index: number, text = `Reader message ${index}`) => ({
  id: `12670000-0000-4000-8000-${String(index).padStart(12, "0")}`, clientMessageId: id,
  order: String(index), kind: "TEXT", text, author: { ...actor, kind: "requester" }, createdAt: row.createdAt,
});
function selectAssigned() {
  assigned = true;
  window.history.replaceState(null, "", `?filter=mine&selected=${id}&v=1`);
}

it("keeps the clipped tall-message anchor and focus while a pending page serializes focus and manual refresh", async () => {
  selectAssigned();
  const network = networkHandler(), page = deferred<Response>();
  const cursors: (string | null)[] = [];
  let incoming = false;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith("/messages")) return network(input, init);
    const cursor = url.searchParams.get("cursor"); cursors.push(cursor);
    if (cursor === message(2).id) return page.promise;
    if (cursor === message(3).id) return Promise.resolve(Response.json({ items: [message(4)], nextCursor: null }));
    if (cursor === message(4).id) return Promise.resolve(Response.json({ items: incoming ? [message(5)] : [], nextCursor: null }));
    return Promise.resolve(Response.json({ items: [message(1), message(2, "Uzyn tekst\nДлинный текст\n".repeat(60))], nextCursor: message(2).id }));
  });
  // happy-dom has no layout. Substitute only browser geometry; the whole caller,
  // production actions and HTTP/schema/authority checks above remain real.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const pane = this.closest("ol") as HTMLOListElement | null;
    const index = Number(this.id.slice(-12));
    const top = this.tagName === "OL" ? 100 : pane ? 100 + (index === 1 ? 0 : index === 2 ? 80 : 880 + (index - 3) * 80) - pane.scrollTop : 0;
    return { top, bottom: top + (this.tagName === "OL" ? 300 : index === 2 ? 800 : 80), height: 80, left: 0, right: 400, width: 400, x: 0, y: top, toJSON: () => ({}) };
  });
  render(view()); await screen.findByText("Reader message 1");
  const pane = screen.getByRole("list", { name: "Enquiry conversation" });
  pane.scrollTop = 150; fireEvent.scroll(pane);
  const tall = pane.children[1] as HTMLElement;
  tall.focus();
  const more = screen.getByRole("button", { name: "More messages" }); more.focus();
  fireEvent.click(more);
  await waitFor(() => expect(cursors).toEqual([null, message(2).id]));
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(screen.getByText("Reader message 1")).toBeDefined();
  expect(cursors).toEqual([null, message(2).id]);
  await act(async () => page.resolve(Response.json({ items: [message(3)], nextCursor: null })));
  await screen.findByText("Reader message 4");
  await waitFor(() => expect(document.activeElement?.textContent).toContain("Reader message 3"));
  expect(cursors).toEqual([null, message(2).id, message(3).id]);
  expect(screen.getByRole("list", { name: "Enquiry conversation" })).toBe(pane);
  expect(tall.getBoundingClientRect().top - pane.getBoundingClientRect().top).toBe(-70);
  expect(pane.scrollTop).toBe(150);
  tall.focus(); incoming = true;
  await act(async () => window.dispatchEvent(new Event("focus")));
  await screen.findByText("Reader message 5");
  expect(document.activeElement).toBe(tall);
  expect(pane.scrollTop).toBe(150);
  expect([...pane.children].map((node) => node.id)).toEqual([1, 2, 3, 4, 5].map((n) => `history-message-${message(n).id}`));
});

it.each(["gap", "duplicate", "reversed", "cursor"])("retains its contiguous prefix after an invalid %s page and retries from the same frontier", async (fault) => {
  selectAssigned();
  const network = networkHandler();
  let broken = true;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith("/messages")) return network(input, init);
    if (!url.searchParams.has("cursor")) return Promise.resolve(Response.json({ items: [message(1), message(2)], nextCursor: message(2).id }));
    const items = !broken || fault === "cursor" ? [message(3)] : fault === "gap" ? [message(4)] : fault === "duplicate" ? [message(3), message(3)] : [message(4), message(3)];
    return Promise.resolve(Response.json({ items, nextCursor: broken && fault === "cursor" ? message(1).id : null }));
  });
  render(view()); await screen.findByText("Reader message 2");
  fireEvent.click(screen.getByRole("button", { name: "More messages" }));
  await screen.findByText("Could not update messages. Showing previously loaded messages.");
  expect(screen.queryByText("Reader message 3")).toBeNull();
  expect(screen.queryByText("Reader message 4")).toBeNull();
  expect(screen.getByText("Reader message 2")).toBeDefined();
  broken = false; fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Reader message 3");
  expect(screen.getByRole("list", { name: "Enquiry conversation" }).children).toHaveLength(3);
});

it.each(["page", "refresh"] as const)("retains prior pages through a transient %s failure and reconnects without replacing the pane", async (work) => {
  selectAssigned();
  const network = networkHandler();
  let failed = false;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith("/messages")) return network(input, init);
    if (failed) return Promise.resolve(Response.json({}, { status: 503 }));
    if (url.searchParams.get("cursor") === message(2).id) return Promise.resolve(Response.json({ items: [], nextCursor: null }));
    return Promise.resolve(Response.json(url.searchParams.has("cursor") ? { items: [message(2)], nextCursor: null }
      : { items: [message(1)], nextCursor: message(1).id }));
  });
  render(view()); await screen.findByText("Reader message 1");
  const pane = screen.getByRole("list", { name: "Enquiry conversation" });
  pane.scrollTop = 34;
  const first = pane.firstElementChild as HTMLElement; first.focus();
  failed = true; fireEvent.click(screen.getByRole("button", { name: work === "page" ? "More messages" : "Refresh" }));
  await screen.findByText("Could not update messages. Showing previously loaded messages.");
  expect(pane.scrollTop).toBe(34);
  expect(document.activeElement).toBe(first);
  failed = false;
  await act(async () => window.dispatchEvent(new Event("online")));
  await screen.findByText("Connection restored. Messages updated.");
  expect(screen.getByRole("list", { name: "Enquiry conversation" })).toBe(pane);
  expect(screen.getByText("Reader message 2")).toBeDefined();
  expect(document.activeElement).toBe(first);
});

it.each([403, 409, 401])("immediately hides loaded text after an observed HTTP %s during refresh", async (status) => {
  selectAssigned();
  const network = networkHandler();
  let refused = false;
  vi.mocked(fetch).mockImplementation((input, init) => refused && String(input).includes("/messages")
    ? Promise.resolve(Response.json({}, { status })) : network(input, init));
  render(view()); await screen.findByText("Can you check this car?");
  refused = true; fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText(status === 409 ? "Assignment changed. Refresh before continuing." : "Access denied");
  expect(screen.queryByRole("list", { name: "Enquiry conversation" })).toBeNull();
  expect(screen.queryByText("Can you check this car?")).toBeNull();
});

it.each(["actor", "session", "assignment", "request", "disposal"] as const)("excludes a delayed refresh after current %s changes", async (change) => {
  selectAssigned();
  const network = networkHandler(), delayed = deferred<Response>();
  let refreshing = false, captured = false, changed = false;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const path = new URL(String(input)).pathname;
    if (refreshing && path.endsWith("/messages") && !captured) { captured = true; return delayed.promise; }
    if (changed && change === "actor" && path.endsWith("/desk")) return Promise.resolve(Response.json({ purpose: "vehicle-history", mode: "synthetic", actor: { ...actor, id }, requests: [] }));
    if (changed && change === "assignment" && path.endsWith(id)) return Promise.resolve(Response.json({ ...detail(), assignmentVersion: 2 }));
    if (path.endsWith("/messages")) return Promise.resolve(Response.json({ items: [message(1)], nextCursor: null }));
    return network(input, init);
  });
  const mounted = render(view()); await screen.findByText("Reader message 1");
  refreshing = true; fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(captured).toBe(true));
  changed = true;
  if (change === "actor") platform.token = token(id, id);
  if (change === "session") platform.token = token(actor.id);
  if (change === "request") fireEvent.click(screen.getByRole("button", { name: "Unassigned" }));
  if (change === "disposal") mounted.unmount();
  await act(async () => delayed.resolve(Response.json({ items: [message(2, "Late private refresh")], nextCursor: null })));
  if (change === "actor" || change === "session") await screen.findByText("Access denied");
  if (change === "assignment") await screen.findByText("Assignment changed. Refresh before continuing.");
  expect(screen.queryByText("Late private refresh")).toBeNull();
  expect(screen.queryByText("Reader message 1")).toBeNull();
});

it.each([
  ["tk", "Rugsat barlanýar…", "Entek habar ýok.", "Habarlar täzelenmedi. Öň ýüklenen habarlar görkezilýär.", "Gaýtadan synanyş", "Baglanyşyk dikeldilýär…", "Baglanyşyk dikeldildi. Habarlar täzelendi.", "Tor ýok. Baglanyşygy barlaň we gaýtadan synanyşyň."],
  ["ru", "Проверяем доступ…", "Сообщений пока нет.", "Не удалось обновить сообщения. Показаны ранее загруженные.", "Попробовать ещё раз", "Восстанавливаем соединение…", "Соединение восстановлено. Сообщения обновлены.", "Нет сети. Проверьте соединение и повторите попытку."],
  ["en", "Checking access…", "No messages yet.", "Could not update messages. Showing previously loaded messages.", "Try again", "Reconnecting…", "Connection restored. Messages updated.", "You’re offline. Check your connection and retry."],
] as const)("announces first-entry, empty, transient Retry and reconnection in %s", async (locale, loading, empty, error, retry, reconnecting, recovered, offline) => {
  selectAssigned(); platform.path = `/vehicle-history/${locale}`;
  const network = networkHandler();
  let pending = deferred<Response>(), phase: "pending" | "failed" = "pending";
  vi.mocked(fetch).mockImplementation((input, init) => String(input).includes("/messages")
    ? phase === "failed" ? Promise.resolve(Response.json({}, { status: 503 })) : pending.promise : network(input, init));
  render(<HistoryWorkbench locale={locale} section="desk"><HistoryInbox locale={locale} /></HistoryWorkbench>);
  await screen.findByText(loading);
  await act(async () => pending.resolve(Response.json({ items: [], nextCursor: null })));
  await screen.findByText(empty);
  phase = "failed"; fireEvent.click(screen.getByRole("button", { name: locale === "tk" ? "Täzele" : locale === "ru" ? "Обновить" : "Refresh" }));
  await screen.findByText(error);
  phase = "pending"; pending = deferred<Response>();
  fireEvent.click(screen.getByRole("button", { name: retry }));
  await screen.findByText(reconnecting);
  expect(screen.getByText(empty)).toBeDefined();
  await act(async () => pending.resolve(Response.json({ items: [], nextCursor: null })));
  await screen.findByText(recovered);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  await act(async () => window.dispatchEvent(new Event("offline")));
  await screen.findByText(offline);
  expect(screen.getByText(empty)).toBeDefined();
});

it("reconciles missed incoming text on the poll clock without push or a focus event", async () => {
  selectAssigned();
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const network = networkHandler();
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    return url.pathname.endsWith("/messages") ? Promise.resolve(Response.json({
      items: [message(url.searchParams.has("cursor") ? 2 : 1)], nextCursor: null,
    })) : network(input, init);
  });
  try {
    render(view()); await screen.findByText("Reader message 1");
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    await screen.findByText("Reader message 2");
    expect(screen.getByRole("list", { name: "Enquiry conversation" }).children).toHaveLength(2);
    expect(requests.filter((request) => request.method === "POST").every((request) => JSON.parse(String(request.body)).kind === "received")).toBe(true);
  } finally { vi.useRealTimers(); }
});

it.each(["version", "owner", "mine"])("hides text as soon as the queue observes %s loss while a page is pending", async (change) => {
  selectAssigned();
  const network = networkHandler(), pending = deferred<Response>();
  let lost = false, captured = false;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/requests") && lost) return Promise.resolve(Response.json({ items: [{ ...row, mine: true, assignmentVersion: 1, assignedOperator: actor,
      ...(change === "version" ? { assignmentVersion: 2 } : change === "mine" ? { mine: false } : { assignedOperator: { ...actor, id } }),
    }], nextCursor: null }));
    if (url.pathname.endsWith("/messages")) {
      if (url.searchParams.has("cursor")) { captured = true; return pending.promise; }
      return Promise.resolve(Response.json({ items: [message(1)], nextCursor: message(1).id }));
    }
    return network(input, init);
  });
  render(view()); await screen.findByText("Reader message 1");
  fireEvent.click(screen.getByRole("button", { name: "More messages" }));
  await waitFor(() => expect(captured).toBe(true));
  lost = true;
  await act(async () => window.dispatchEvent(new Event("focus")));
  await screen.findByText("Assignment changed. Refresh before continuing.");
  expect(screen.queryByText("Reader message 1")).toBeNull();
  await act(async () => pending.resolve(Response.json({ items: [message(2)], nextCursor: null })));
  expect(screen.queryByText("Reader message 2")).toBeNull();
});

it("does not steal keyboard focus moved to search while a page is pending", async () => {
  selectAssigned();
  const network = networkHandler(), pending = deferred<Response>();
  let captured = false;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith("/messages")) return network(input, init);
    if (url.searchParams.has("cursor")) { captured = true; return pending.promise; }
    return Promise.resolve(Response.json({ items: [message(1)], nextCursor: message(1).id }));
  });
  render(view()); await screen.findByText("Reader message 1");
  fireEvent.click(screen.getByRole("button", { name: "More messages" }));
  await waitFor(() => expect(captured).toBe(true));
  const search = screen.getByRole("searchbox"); search.focus();
  await act(async () => pending.resolve(Response.json({ items: [message(2)], nextCursor: null })));
  await screen.findByText("Reader message 2");
  expect(document.activeElement).toBe(search);
});

it("announces loss of connection before an unclaimed enquiry can be claimed", async () => {
  render(view()); fireEvent.click(await screen.findByRole("link", { name: /Merdan/ }));
  await screen.findByRole("button", { name: "Claim enquiry" });
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  await act(async () => window.dispatchEvent(new Event("offline")));
  await screen.findByText("You’re offline. Check your connection and retry.");
  expect(requests.some((request) => request.method === "POST")).toBe(false);
});

it("uses one reader reconciliation for a single focus event while the queue also refreshes", async () => {
  selectAssigned();
  const network = networkHandler(), pending = deferred<Response>();
  const cursors: (string | null)[] = [];
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith("/messages")) return network(input, init);
    const cursor = url.searchParams.get("cursor"); cursors.push(cursor);
    return cursor ? pending.promise : Promise.resolve(Response.json({ items: [message(1)], nextCursor: null }));
  });
  render(view()); await screen.findByText("Reader message 1");
  await act(async () => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(cursors).toEqual([null, message(1).id]));
  await act(async () => pending.resolve(Response.json({ items: [], nextCursor: null })));
  expect(cursors).toEqual([null, message(1).id]);
  expect(screen.getByText("Reader message 1")).toBeDefined();
});

it.each([
  ["tk", "Hat alyşma ýüklenmedi.", "Gaýtadan synanyş", "Entek habar ýok."],
  ["ru", "Не удалось загрузить переписку.", "Попробовать ещё раз", "Сообщений пока нет."],
  ["en", "Could not load the conversation.", "Try again", "No messages yet."],
] as const)("recovers a first-entry conversation failure with a specific %s error", async (locale, error, retry, empty) => {
  selectAssigned();
  const network = networkHandler(); let failed = true;
  vi.mocked(fetch).mockImplementation((input, init) => String(input).includes("/messages")
    ? Promise.resolve(failed ? Response.json({}, { status: 503 }) : Response.json({ items: [], nextCursor: null })) : network(input, init));
  render(<HistoryWorkbench locale={locale} section="desk"><HistoryInbox locale={locale} /></HistoryWorkbench>);
  await screen.findByText(error);
  expect(screen.queryByRole("list", { name: /hat alyşmasy|Переписка|Enquiry conversation/ })).toBeNull();
  failed = false; fireEvent.click(screen.getByRole("button", { name: retry }));
  await screen.findByText(empty);
});

it("does not let an older queue response re-admit a reader after an observed refusal", async () => {
  selectAssigned();
  const network = networkHandler(), queue = deferred<Response>(), detailRead = deferred<Response>();
  let phase: "initial" | "refusing" | "refused" = "initial", queuePending = false;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const path = new URL(String(input)).pathname;
    if (phase === "refusing" && path.endsWith("/requests")) { queuePending = true; return queue.promise; }
    if (phase === "refusing" && path.endsWith("/messages")) return Promise.resolve(Response.json({}, { status: 403 }));
    if (phase === "refused" && path.endsWith(id)) return detailRead.promise;
    return network(input, init);
  });
  render(view()); await screen.findByText("Can you check this car?");
  phase = "refusing";
  await act(async () => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(queuePending).toBe(true));
  await screen.findByText("Access denied");
  expect(document.querySelector("#selected-enquiry")).toBeNull();
  phase = "refused";
  await act(async () => queue.resolve(Response.json({ items: [{ ...row, mine: true, assignmentVersion: 1, assignedOperator: actor }], nextCursor: null })));
  expect(screen.getByText("Access denied")).toBeDefined();
  expect(document.querySelector("#selected-enquiry")).toBeNull();
  await act(async () => detailRead.resolve(Response.json(detail())));
});

it("returns keyboard focus to the conversation when recovery removes the focused Retry button", async () => {
  selectAssigned();
  const network = networkHandler(); let failed = false;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/messages") && failed) return Promise.resolve(Response.json({}, { status: 503 }));
    if (url.pathname.endsWith("/messages") && url.searchParams.has("cursor")) return Promise.resolve(Response.json({ items: [], nextCursor: null }));
    return network(input, init);
  });
  render(view()); await screen.findByText("Can you check this car?");
  const pane = screen.getByRole("list", { name: "Enquiry conversation" });
  failed = true; fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  const retry = await screen.findByRole("button", { name: "Try again" }); retry.focus();
  failed = false; fireEvent.click(retry);
  await screen.findByText("Connection restored. Messages updated.");
  await waitFor(() => expect(screen.queryByRole("button", { name: "Try again" })).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(pane));
  expect(screen.getByText("Can you check this car?")).toBeDefined();
});

it("shows operator Sent, Delivered and Read only from durable requester version-zero receipts", async () => {
  selectAssigned();
  const network = networkHandler();
  let facts = [{ participantId: actor.id, assignmentVersion: 1, receivedOrder: "1", readOrder: "1" }];
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/receipts")) return Promise.resolve(Response.json(init?.method === "POST"
      ? { participantId: actor.id, assignmentVersion: 1, receivedOrder: "1", readOrder: "0" } : { items: facts }));
    if (url.pathname.endsWith("/messages")) return Promise.resolve(Response.json({ items: url.searchParams.has("cursor") ? []
      : [{ ...message(1, "Existing operator reply"), author: { ...actor, kind: "operator" } }], nextCursor: null }));
    return network(input, init);
  });
  render(view()); await screen.findByText("Existing operator reply");
  await screen.findByText("Sent");
  expect(screen.queryByText("Read")).toBeNull();
  facts = [{ participantId: id, assignmentVersion: 0, receivedOrder: "1", readOrder: "0" }];
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Delivered");
  facts = [{ participantId: id, assignmentVersion: 0, receivedOrder: "1", readOrder: "1" }];
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Read");
  expect(screen.getByRole("textbox", { name: "Internal note" })).toBeDefined();
});

it("completes Received before a clipped tall row is 50% viewport eligible for 300ms", async () => {
  selectAssigned();
  const network = networkHandler(), received = deferred<Response>();
  const acknowledgements: { cursor: string; kind: string }[] = [];
  let rowTop = 202;
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal("innerHeight", 300);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return new DOMRect(0, this.tagName === "OL" ? 100 : rowTop, 400, this.tagName === "OL" ? 400 : 800);
  });
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/messages")) return Promise.resolve(Response.json({ items: [message(1, "Uzyn tekst\nДлинный текст\n".repeat(50))], nextCursor: null }));
    if (url.pathname.endsWith("/receipts") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)); acknowledgements.push({ cursor: body.cursor, kind: body.kind });
      return body.kind === "received" ? received.promise : Promise.resolve(Response.json({ participantId: actor.id,
        assignmentVersion: 1, receivedOrder: "1", readOrder: "1" }));
    }
    return network(input, init);
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    await act(async () => { render(view()); });
    expect(acknowledgements).toEqual([{ cursor: message(1).id, kind: "received" }]);
    await act(async () => vi.advanceTimersByTimeAsync(400));
    expect(acknowledgements).toHaveLength(1);
    await act(async () => received.resolve(Response.json({ participantId: actor.id, assignmentVersion: 1, receivedOrder: "1", readOrder: "0" })));
    await act(async () => vi.advanceTimersByTimeAsync(400));
    expect(acknowledgements).toHaveLength(1);
    rowTop = 200;
    fireEvent.scroll(screen.getByRole("list", { name: "Enquiry conversation" }));
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(acknowledgements).toHaveLength(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(acknowledgements).toEqual([{ cursor: message(1).id, kind: "received" }, { cursor: message(1).id, kind: "read" }]);
  } finally { vi.useRealTimers(); }
});

it.each([
  ["en", "Could not update message status.", "Try again", "Refresh", "Sent"],
  ["ru", "Не удалось обновить статусы сообщений.", "Попробовать ещё раз", "Обновить", "Отправлено"],
  ["tk", "Habaryň ýagdaýy täzelenmedi.", "Gaýtadan synanyş", "Täzele", "Iberildi"],
] as const)("retains text and factual Sent with specific receipt recovery in %s", async (locale, error, retry, refresh, sent) => {
  selectAssigned();
  const network = networkHandler(); let failed = false;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/messages")) return Promise.resolve(Response.json({ items: url.searchParams.has("cursor") ? []
      : [{ ...message(1, "Existing operator reply"), author: { ...actor, kind: "operator" } }], nextCursor: null }));
    if (failed && url.pathname.endsWith("/receipts")) return Promise.resolve(Response.json({}, { status: 503 }));
    return network(input, init);
  });
  render(<HistoryWorkbench locale={locale} section="desk"><HistoryInbox locale={locale} /></HistoryWorkbench>);
  await screen.findByText(sent);
  const pane = screen.getByRole("list", { name: /hat alyşmasy|Переписка|Enquiry conversation/ });
  pane.scrollTop = 40; fireEvent.scroll(pane);
  failed = true; fireEvent.click(screen.getByRole("button", { name: refresh }));
  await screen.findByText(error);
  expect(screen.getByText("Existing operator reply")).toBeDefined();
  expect(screen.getByText(sent)).toBeDefined();
  expect(pane.scrollTop).toBe(40);
  failed = false;
  const button = screen.getByRole("button", { name: retry }); button.focus(); fireEvent.click(button);
  await waitFor(() => expect(screen.queryByText(error)).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(pane));
  expect(screen.getByText(sent)).toBeDefined();
});

function receiptViewport() {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal("innerHeight", 1000);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return new DOMRect(0, 100, 400, this.tagName === "OL" ? 400 : 80);
  });
}

it.each(["focus", "hidden", "offline", "clipped"])("restarts visible Read dwell after %s interrupts eligibility", async (cause) => {
  selectAssigned(); receiptViewport();
  const network = networkHandler();
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    return url.pathname.endsWith("/messages") ? Promise.resolve(Response.json({ items: url.searchParams.has("cursor") ? []
      : [message(1)], nextCursor: null })) : network(input, init);
  });
  const writes = () => requests.filter((request) => request.path.includes("/receipts") && request.method === "POST")
    .map((request) => JSON.parse(String(request.body)).kind);
  const change = (blocked: boolean) => {
    if (cause === "focus") vi.mocked(document.hasFocus).mockReturnValue(!blocked);
    if (cause === "hidden") vi.spyOn(document, "visibilityState", "get").mockReturnValue(blocked ? "hidden" : "visible");
    if (cause === "offline") vi.spyOn(navigator, "onLine", "get").mockReturnValue(!blocked);
    if (cause === "clipped") vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
      return new DOMRect(0, blocked && this.tagName !== "OL" ? 900 : 100, 400, this.tagName === "OL" ? 400 : 80);
    });
    if (cause === "hidden") document.dispatchEvent(new Event("visibilitychange"));
    else window.dispatchEvent(new Event(cause === "focus" ? blocked ? "blur" : "focus" : cause === "offline" ? blocked ? "offline" : "online" : "scroll"));
  };
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    await act(async () => { render(view()); });
    expect(writes()).toEqual(["received"]);
    await act(async () => vi.advanceTimersByTimeAsync(200));
    await act(async () => change(true));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(writes()).toEqual(["received"]);
    await act(async () => change(false));
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(writes()).toEqual(["received"]);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(writes()).toEqual(["received", "read"]);
  } finally { vi.useRealTimers(); }
});

it("requires a fresh visible dwell after focus returns while Received is pending", async () => {
  selectAssigned(); receiptViewport();
  const network = networkHandler(), received = deferred<Response>();
  const writes: string[] = [];
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/messages")) return Promise.resolve(Response.json({
      items: url.searchParams.has("cursor") ? [] : [message(1)], nextCursor: null,
    }));
    if (url.pathname.endsWith("/receipts") && init?.method === "POST") {
      const kind = JSON.parse(String(init.body)).kind;
      writes.push(kind);
      if (kind === "received") return received.promise;
    }
    return network(input, init);
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    await act(async () => { render(view()); });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(writes).toEqual(["received"]);
    vi.mocked(document.hasFocus).mockReturnValue(false);
    await act(async () => window.dispatchEvent(new Event("blur")));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    vi.mocked(document.hasFocus).mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => received.resolve(Response.json({ participantId: actor.id,
      assignmentVersion: 1, receivedOrder: "1", readOrder: "0" })));
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(writes).toEqual(["received"]);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(writes).toEqual(["received", "read"]);
  } finally { vi.useRealTimers(); }
});

it.each(["receipts", "received", "read"].flatMap((work) =>
  (work === "receipts" ? ["http", "lost"] : ["http", "lost", "short"]).map((fault) => [work, fault])))
  ("retains factual progress after %s %s failure until explicit Retry", async (work, fault) => {
  selectAssigned(); receiptViewport();
  const network = networkHandler(), attempts: string[] = [];
  let failed = true;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/messages")) return Promise.resolve(Response.json({ items: url.searchParams.has("cursor") ? []
      : [{ ...message(1, "Durable operator text"), author: { ...actor, kind: "operator" } }], nextCursor: null }));
    if (url.pathname.endsWith("/receipts")) {
      const kind = init?.method === "POST" ? JSON.parse(String(init.body)).kind : "receipts";
      attempts.push(kind);
      if (failed && kind === work) {
        if (fault === "lost") return Promise.reject(new Error("Connection lost after request"));
        return Promise.resolve(fault === "http" ? Response.json({}, { status: 503 }) : Response.json({
          participantId: actor.id, assignmentVersion: 1, receivedOrder: work === "read" ? "1" : "0", readOrder: "0",
        }));
      }
    }
    return network(input, init);
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    await act(async () => { render(view()); });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByText("Could not update message status.")).toBeDefined();
    expect(screen.getByText("Durable operator text")).toBeDefined();
    expect(screen.getByText("Sent")).toBeDefined();
    expect(screen.queryByText("Message status updated.")).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(attempts.filter((kind) => kind === work)).toHaveLength(1);
    if (work !== "read") expect(attempts).not.toContain("read");
    failed = false;
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(screen.queryByText("Could not update message status.")).toBeNull();
    expect(attempts.filter((kind) => kind === work)).toHaveLength(2);
    expect(screen.getByText("Sent")).toBeDefined();
  } finally { vi.useRealTimers(); }
});


it.each(["receipts", "received", "read"].flatMap((work) => [401, 403, 409].map((status) => [work, status] as const)))
  ("hides protected text after %s returns HTTP %s", async (work, status) => {
  selectAssigned(); receiptViewport();
  const network = networkHandler(), writes: string[] = [];
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/messages")) return Promise.resolve(Response.json({ items: [message(1)], nextCursor: null }));
    if (url.pathname.endsWith("/receipts")) {
      const kind = init?.method === "POST" ? JSON.parse(String(init.body)).kind : "receipts";
      if (kind !== "receipts") writes.push(kind);
      if (kind === work) return Promise.resolve(Response.json({}, { status }));
    }
    return network(input, init);
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    await act(async () => { render(view()); });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByText(status === 409 ? "Assignment changed. Refresh before continuing." : "Access denied")).toBeDefined();
    expect(screen.queryByText("Reader message 1")).toBeNull();
    expect(screen.queryByRole("list", { name: "Enquiry conversation" })).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(writes).toEqual(work === "receipts" ? [] : work === "received" ? ["received"] : ["received", "read"]);
  } finally { vi.useRealTimers(); }
});

it("serializes a pending page, Received and queued refresh before eligible Read", async () => {
  selectAssigned(); receiptViewport();
  const network = networkHandler(), page = deferred<Response>(), received = deferred<Response>(), refresh = deferred<Response>();
  const events: string[] = [];
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/messages")) {
      const cursor = url.searchParams.get("cursor"); events.push(cursor === message(1).id ? "page:1" : cursor ? "page:2" : "page:start");
      return cursor === message(1).id ? page.promise : cursor ? refresh.promise
        : Promise.resolve(Response.json({ items: [message(1)], nextCursor: message(1).id }));
    }
    if (url.pathname.endsWith("/receipts")) {
      const body = init?.method === "POST" ? JSON.parse(String(init.body)) : null;
      events.push(body ? body.kind + ":" + String(Number(body.cursor.slice(-12))) : "facts");
      if (body?.kind === "received" && body.cursor === message(2).id) return received.promise;
    }
    return network(input, init);
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    await act(async () => { render(view()); });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "More messages" })));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    await act(async () => { window.dispatchEvent(new Event("focus")); fireEvent.click(screen.getByRole("button", { name: "Refresh" })); });
    expect(events).toEqual(["page:start", "facts", "received:1", "page:1"]);
    await act(async () => page.resolve(Response.json({ items: [message(2)], nextCursor: message(2).id })));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(events).toEqual(["page:start", "facts", "received:1", "page:1", "facts", "received:2"]);
    await act(async () => received.resolve(Response.json({ participantId: actor.id, assignmentVersion: 1, receivedOrder: "2", readOrder: "0" })));
    expect(events.at(-1)).toBe("page:2");
    expect(events.some((event) => event.startsWith("read:"))).toBe(false);
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
      return new DOMRect(0, this.tagName === "OL" || this.id === "history-message-" + message(3).id ? 100 : 900, 400, this.tagName === "OL" ? 400 : 80);
    });
    await act(async () => refresh.resolve(Response.json({ items: [message(3)], nextCursor: null })));
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(events.some((event) => event.startsWith("read:"))).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(events).toEqual(["page:start", "facts", "received:1", "page:1", "facts", "received:2", "page:2", "facts", "received:3", "read:3"]);
    expect(screen.getByText("Reader message 3")).toBeDefined();
  } finally { vi.useRealTimers(); }
});

it("never skips an unseen row or acknowledges an unfetched lookahead", async () => {
  selectAssigned(); receiptViewport();
  const network = networkHandler(), writes: { cursor: string; kind: string }[] = [];
  let firstVisible = false;
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
    const target = firstVisible ? message(1).id : message(2).id;
    return new DOMRect(0, this.tagName === "OL" || this.id === "history-message-" + target ? 100 : 900, 400, this.tagName === "OL" ? 400 : 80);
  });
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/messages")) return Promise.resolve(Response.json(url.searchParams.has("cursor")
      ? { items: [message(3)], nextCursor: null } : { items: [message(1), message(2)], nextCursor: message(2).id }));
    if (url.pathname.endsWith("/receipts") && init?.method === "POST") writes.push(JSON.parse(String(init.body)));
    return network(input, init);
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    await act(async () => { render(view()); });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(writes).toMatchObject([{ cursor: message(2).id, kind: "received" }]);
    expect(screen.queryByText("Reader message 3")).toBeNull();
    firstVisible = true; fireEvent.scroll(screen.getByRole("list", { name: "Enquiry conversation" }));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(writes).toHaveLength(1);
    firstVisible = false;
    await act(async () => fireEvent.scroll(screen.getByRole("list", { name: "Enquiry conversation" })));
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(writes).toHaveLength(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(writes).toMatchObject([{ cursor: message(2).id, kind: "received" }, { cursor: message(2).id, kind: "read" }]);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "More messages" })));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByText("Reader message 3")).toBeDefined();
    expect(writes).toMatchObject([{ kind: "received" }, { kind: "read" }, { cursor: message(3).id, kind: "received" }]);
  } finally { vi.useRealTimers(); }
});

it.each(["receipts", "received", "read"].flatMap((work) =>
  ["actor", "session", "assignment", "request", "disposal"].map((change) => [work, change])))
  ("rejects pending %s after the current %s changes", async (work, change) => {
  selectAssigned(); receiptViewport();
  const network = networkHandler(), pending = deferred<Response>();
  const writes: string[] = [];
  let captured = false, changed = false;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (changed && change === "actor" && url.pathname.endsWith("/desk")) return Promise.resolve(Response.json({
      purpose: "vehicle-history", mode: "synthetic", actor: { ...actor, id }, requests: [],
    }));
    if (changed && change === "assignment" && url.pathname.endsWith(id)) return Promise.resolve(Response.json({ ...detail(), assignmentVersion: 2 }));
    if (url.pathname.endsWith("/messages")) return Promise.resolve(Response.json({ items: [message(1)], nextCursor: null }));
    if (url.pathname.endsWith("/receipts")) {
      const kind = init?.method === "POST" ? JSON.parse(String(init.body)).kind : "receipts";
      if (kind !== "receipts") writes.push(kind);
      if (kind === work && !captured) { captured = true; return pending.promise; }
    }
    return network(input, init);
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    const mounted = render(view());
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(work === "read" ? 300 : 0));
    expect(captured).toBe(true);
    changed = true;
    if (change === "actor") platform.token = token(id, id);
    if (change === "session") platform.token = token(actor.id);
    if (change === "request") fireEvent.click(screen.getByRole("button", { name: "Unassigned" }));
    if (change === "disposal") mounted.unmount();
    await act(async () => pending.resolve(Response.json(work === "receipts" ? { items: [] } : {
      participantId: actor.id, assignmentVersion: 1, receivedOrder: "1", readOrder: work === "read" ? "1" : "0",
    })));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(screen.queryByText("Reader message 1")).toBeNull();
    expect(writes).toEqual(work === "receipts" ? [] : work === "received" ? ["received"] : ["received", "read"]);
    if (change === "actor" || change === "session") expect(screen.getByText("Access denied")).toBeDefined();
    if (change === "assignment") expect(screen.getByText("Assignment changed. Refresh before continuing.")).toBeDefined();
  } finally { vi.useRealTimers(); }
});

it.each(["received", "read"])("refetches a fresh session before ACK while old %s has fixed initiating cookies", async (work) => {
  selectAssigned(); receiptViewport();
  const network = networkHandler(), oldAck = deferred<Response>(), freshPage = deferred<Response>();
  const oldToken = platform.token, freshToken = token(actor.id);
  const writes: { session: string; kind: string }[] = [];
  let fresh = false, captured = false, freshFetch = false, oldFinal = false;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    const authorization = new Headers(init?.headers).get("Authorization");
    const current = authorization === `Bearer ${freshToken}`;
    if (fresh && authorization === `Bearer ${oldToken}` && url.pathname.endsWith("/desk")) oldFinal = true;
    if (url.pathname.endsWith("/messages")) {
      if (current) { freshFetch = true; return freshPage.promise; }
      return Promise.resolve(Response.json({ items: [message(1, "Old session private text")], nextCursor: null }));
    }
    if (url.pathname.endsWith("/receipts") && init?.method === "POST") {
      const kind = JSON.parse(String(init.body)).kind;
      writes.push({ session: current ? "fresh" : "old", kind });
      if (!current && kind === work && !captured) { captured = true; return oldAck.promise; }
    }
    return network(input, init);
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  try {
    const tree = await resolveServerTree(await HistoryDeskPage({ params: Promise.resolve({ locale: "en" }) }));
    const mounted = platform.requestCookies.run(oldToken, () => render(tree));
    await act(async () => {});
    await act(async () => platform.requestCookies.run(oldToken, () => vi.advanceTimersByTimeAsync(work === "read" ? 300 : 0)));
    expect(captured).toBe(true);
    fresh = true; platform.token = freshToken;
    const replacement = await resolveServerTree(await HistoryDeskPage({ params: Promise.resolve({ locale: "en" }) }));
    await act(async () => platform.requestCookies.run(freshToken, () => mounted.rerender(replacement)));
    expect(freshFetch).toBe(true);
    expect(screen.queryByText("Old session private text")).toBeNull();
    expect(writes.filter((write) => write.session === "fresh")).toEqual([]);
    await act(async () => oldAck.resolve(Response.json({ participantId: actor.id, assignmentVersion: 1,
      receivedOrder: "1", readOrder: work === "read" ? "1" : "0" })));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(oldFinal).toBe(true);
    expect(writes.filter((write) => write.session === "fresh")).toEqual([]);
    await act(async () => freshPage.resolve(Response.json({ items: [message(1, "Fresh session private text")], nextCursor: null })));
    expect(screen.getByText("Fresh session private text")).toBeDefined();
    expect(writes.filter((write) => write.session === "fresh")).toEqual([{ session: "fresh", kind: "received" }]);
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(writes.filter((write) => write.session === "fresh")).toHaveLength(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(writes.filter((write) => write.session === "fresh")).toEqual([
      { session: "fresh", kind: "received" }, { session: "fresh", kind: "read" },
    ]);
    expect(writes.filter((write) => write.session === "old")).toEqual(work === "read" ? [
      { session: "old", kind: "received" }, { session: "old", kind: "read" },
    ] : [{ session: "old", kind: "received" }]);
  } finally { vi.useRealTimers(); }
});

it("keeps the public reply draft through request navigation, reload and same-account reauthentication", async () => {
  selectAssigned();
  const mounted = render(view());
  const input = await screen.findByRole("textbox", { name: "Reply to customer" });
  fireEvent.change(input, { target: { value: "  Here is the history\nTäze maglumat · Новые сведения  " } });
  await screen.findByText("Draft saved on this device.");
  fireEvent.click(screen.getByRole("button", { name: "Unassigned" }));
  expect(screen.queryByRole("textbox", { name: "Reply to customer" })).toBeNull();
  fireEvent.click(await screen.findByRole("link", { name: /Merdan/ }));
  await waitFor(() => expect((screen.getByRole("textbox", { name: "Reply to customer" }) as HTMLTextAreaElement).value)
    .toBe("  Here is the history\nTäze maglumat · Новые сведения  "));
  mounted.unmount();
  platform.token = token(actor.id);
  render(view());
  await waitFor(() => expect((screen.getByRole("textbox", { name: "Reply to customer" }) as HTMLTextAreaElement).value)
    .toBe("  Here is the history\nTäze maglumat · Новые сведения  "));
  expect((screen.getByRole("textbox", { name: "Internal note" }) as HTMLTextAreaElement).value).toBe("");
});

it("sends exact public text once, announces Pending and Sent, and keeps typing done before acknowledgement", async () => {
  selectAssigned();
  const network = networkHandler(), pending = deferred<Response>();
  let sent: { clientMessageId: string; text: string; expectedAssignmentVersion: number } | undefined;
  let storedBeforeSend = "";
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/messages")) {
      if (init?.method === "POST") {
        sent = JSON.parse(String(init.body));
        storedBeforeSend = Object.values(localStorage).join("");
        return pending.promise;
      }
      return Promise.resolve(Response.json({ items: [], nextCursor: null }));
    }
    return network(input, init);
  });
  const mounted = render(view());
  fireEvent.change(await screen.findByRole("textbox", { name: "Reply to customer" }), { target: { value: "  Exact reply\nSalam  " } });
  fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
  await screen.findByText("Pending");
  await waitFor(() => expect(sent?.text).toBe("  Exact reply\nSalam  "));
  expect(sent?.expectedAssignmentVersion).toBe(1);
  expect(storedBeforeSend).toContain(sent?.clientMessageId);
  fireEvent.change(screen.getByRole("textbox", { name: "Reply to customer" }), { target: { value: "Newer reply" } });
  await act(async () => pending.resolve(Response.json({ ...message(1, sent?.text), clientMessageId: sent?.clientMessageId,
    author: { ...actor, kind: "operator" } })));
  await screen.findByText("Sent");
  expect((screen.getByRole("textbox", { name: "Reply to customer" }) as HTMLTextAreaElement).value).toBe("Newer reply");
  mounted.unmount(); render(view());
  await waitFor(() => expect((screen.getByRole("textbox", { name: "Reply to customer" }) as HTMLTextAreaElement).value).toBe("Newer reply"));
});

it("retries an uncertain send after reload with the original intent and reconciles one visible message", async () => {
  selectAssigned();
  const network = networkHandler();
  const bodies: { clientMessageId: string; text: string }[] = [];
  let responseLost = true;
  let durable: ReturnType<typeof message> | null = null;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/messages")) {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)); bodies.push(body);
        durable ??= { ...message(1, body.text), clientMessageId: body.clientMessageId, author: { ...actor, kind: "operator" } };
        return responseLost ? Promise.reject(new Error("Lost response")) : Promise.resolve(Response.json(durable));
      }
      return Promise.resolve(Response.json({ items: responseLost || url.searchParams.has("cursor") ? [] : [durable], nextCursor: null }));
    }
    return network(input, init);
  });
  const mounted = render(view());
  fireEvent.change(await screen.findByRole("textbox", { name: "Reply to customer" }), { target: { value: "Retain this uncertain reply" } });
  fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
  await screen.findByText("Send not confirmed. Retry sends the same reply.");
  mounted.unmount();
  const fresh = render(view());
  await screen.findByRole("button", { name: "Retry reply" });
  responseLost = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry reply" }));
  await screen.findByText("Sent");
  await waitFor(() => expect(screen.getAllByText("Retain this uncertain reply")).toHaveLength(1));
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  expect((screen.getByRole("textbox", { name: "Reply to customer" }) as HTMLTextAreaElement).value).toBe("");
  fresh.unmount(); render(view());
  await screen.findByRole("textbox", { name: "Reply to customer" });
  expect(screen.queryByRole("button", { name: "Retry reply" })).toBeNull();
});

it.each(["read", "write"])("recovers a storage %s failure without claiming saved or sending unrecorded text", async (fault) => {
  selectAssigned();
  const storage = vi.spyOn(window.localStorage, fault === "read" ? "getItem" : "setItem");
  storage.mockImplementation(() => { throw new Error("Storage unavailable"); });
  render(view());
  const input = await screen.findByRole("textbox", { name: "Reply to customer" });
  if (fault === "write") fireEvent.change(input, { target: { value: "Keep my unsaved work" } });
  await screen.findByText(fault === "read" ? "Could not open the saved draft. Retry before writing." : "Draft not saved. Keep this page open and retry saving.");
  expect(screen.queryByText("Draft saved on this device.")).toBeNull();
  expect((screen.getByRole("button", { name: "Send reply" }) as HTMLButtonElement).disabled).toBe(true);
  expect(requests.filter((request) => request.method === "POST" && request.path.endsWith("/messages"))).toEqual([]);
  storage.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: fault === "read" ? "Retry loading draft" : "Retry saving draft" }));
  if (fault === "write") {
    await screen.findByText("Draft saved on this device.");
    expect((input as HTMLTextAreaElement).value).toBe("Keep my unsaved work");
  } else await waitFor(() => expect((input as HTMLTextAreaElement).disabled).toBe(false));
});

it.each(["actor", "session", "assignment", "request", "disposal"] as const)("fences a pending public reply acknowledgement after %s changes", async (change) => {
  selectAssigned();
  const network = networkHandler(), pending = deferred<Response>();
  let changed = false;
  let intent: { clientMessageId: string; text: string } | undefined;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (changed && change === "actor" && url.pathname.endsWith("/desk")) return Promise.resolve(Response.json({
      purpose: "vehicle-history", mode: "synthetic", actor: { ...actor, id }, requests: [],
    }));
    if (changed && change === "assignment" && url.pathname.endsWith(id)) return Promise.resolve(Response.json({ ...detail(), assignmentVersion: 2 }));
    if (url.pathname.endsWith("/messages")) {
      if (init?.method === "POST") { intent = JSON.parse(String(init.body)); return pending.promise; }
      return Promise.resolve(Response.json({ items: [], nextCursor: null }));
    }
    return network(input, init);
  });
  const mounted = render(view());
  fireEvent.change(await screen.findByRole("textbox", { name: "Reply to customer" }), { target: { value: "Original operator draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
  await waitFor(() => expect(intent?.text).toBe("Original operator draft"));
  fireEvent.change(screen.getByRole("textbox", { name: "Reply to customer" }), { target: { value: "Still private newer work" } });
  const stored = JSON.stringify(Object.values(localStorage));
  changed = true;
  if (change === "actor") platform.token = token(id, id);
  if (change === "session") platform.token = token(actor.id);
  if (change === "request") fireEvent.click(screen.getByRole("button", { name: "Unassigned" }));
  if (change === "disposal") mounted.unmount();
  await act(async () => pending.resolve(Response.json({ ...message(1, intent?.text), clientMessageId: intent?.clientMessageId,
    author: { ...actor, kind: "operator" } })));
  await waitFor(() => expect(screen.queryByRole("textbox", { name: "Reply to customer" })).toBeNull());
  expect(JSON.stringify(Object.values(localStorage))).toBe(stored);
  expect(screen.queryByText("Original operator draft")).toBeNull();
  expect(screen.queryByText("Sent")).toBeNull();
});

it.each([401, 403, 409])("hides protected reply text after a send refuses HTTP %s and retains its retry intent", async (status) => {
  selectAssigned();
  const network = networkHandler();
  vi.mocked(fetch).mockImplementation((input, init) => String(input).endsWith("/messages") && init?.method === "POST"
    ? Promise.resolve(Response.json({}, { status })) : network(input, init));
  render(view());
  fireEvent.change(await screen.findByRole("textbox", { name: "Reply to customer" }), { target: { value: "Protected refused draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
  await screen.findByText(status === 409 ? "Assignment changed. Refresh before continuing." : "Access denied");
  expect(screen.queryByRole("textbox", { name: "Reply to customer" })).toBeNull();
  expect(screen.queryByText("Protected refused draft")).toBeNull();
  expect(Object.values(localStorage).join("")).toContain("Protected refused draft");
});

it("keeps each request and account draft separate and never restores a previous assignment's draft", async () => {
  selectAssigned();
  const network = networkHandler();
  let currentActor = actor, selectedId = id, selectedVersion = 1;
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/desk")) return Promise.resolve(Response.json({ purpose: "vehicle-history", mode: "synthetic", actor: currentActor, requests: [] }));
    if (url.pathname.endsWith("/requests")) return Promise.resolve(Response.json({ items: [{ ...row, mine: true, id: selectedId, assignedOperator: currentActor, assignmentVersion: selectedVersion }], nextCursor: null }));
    if (url.pathname.endsWith(selectedId)) return Promise.resolve(Response.json({ ...detail(), id: selectedId, assignedOperator: currentActor, assignmentVersion: selectedVersion }));
    if (url.pathname.endsWith("/messages")) return Promise.resolve(Response.json({ items: [], nextCursor: null }));
    if (url.pathname.endsWith("/receipts")) return Promise.resolve(Response.json({ items: [] }));
    return network(input, init);
  });
  let mounted = render(view());
  fireEvent.change(await screen.findByRole("textbox", { name: "Reply to customer" }), { target: { value: "Ayna first request" } });
  mounted.unmount(); selectedId = actor.id;
  window.history.replaceState(null, "", `?filter=mine&selected=${selectedId}&v=1`);
  mounted = render(view());
  let input = await screen.findByRole("textbox", { name: "Reply to customer" });
  expect((input as HTMLTextAreaElement).value).toBe("");
  fireEvent.change(input, { target: { value: "Ayna second request" } });
  mounted.unmount(); selectedId = id; currentActor = { ...actor, id }; platform.token = token(actor.id, id);
  window.history.replaceState(null, "", `?filter=mine&selected=${id}&v=1`);
  mounted = render(view());
  input = await screen.findByRole("textbox", { name: "Reply to customer" });
  expect((input as HTMLTextAreaElement).value).toBe("");
  fireEvent.change(input, { target: { value: "Other operator draft" } });
  mounted.unmount(); currentActor = actor; platform.token = token(); selectedVersion = 2;
  window.history.replaceState(null, "", `?filter=mine&selected=${id}&v=2`);
  render(view());
  input = await screen.findByRole("textbox", { name: "Reply to customer" });
  expect((input as HTMLTextAreaElement).value).toBe("");
  expect(Object.values(localStorage).join("")).toContain("Ayna first request");
  expect(Object.values(localStorage).join("")).toContain("Other operator draft");
});

it("never sends if recording the intent fails, then recovers the same draft with explicit Retry", async () => {
  selectAssigned();
  const network = networkHandler();
  const bodies: { clientMessageId: string; text: string }[] = [];
  vi.mocked(fetch).mockImplementation((input, init) => {
    if (String(input).endsWith("/messages") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)); bodies.push(body);
      return Promise.resolve(Response.json({ ...message(1, body.text), clientMessageId: body.clientMessageId, author: { ...actor, kind: "operator" } }));
    }
    if (String(input).includes("/messages")) return Promise.resolve(Response.json({ items: [], nextCursor: null }));
    return network(input, init);
  });
  render(view());
  fireEvent.change(await screen.findByRole("textbox", { name: "Reply to customer" }), { target: { value: "Do not lose this reply" } });
  const storage = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("Disk full"); });
  fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
  await screen.findByText("Draft not saved. Keep this page open and retry saving.");
  expect(bodies).toEqual([]);
  storage.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: "Retry saving draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Retry reply" }));
  await screen.findByText("Sent");
  expect(bodies).toHaveLength(1);
  expect(bodies[0]?.text).toBe("Do not lose this reply");
});

it("reconciles an uncertain reply through the active HTTP poll after reconnect and only shows factual receipts", async () => {
  selectAssigned();
  const network = networkHandler();
  let durable: ReturnType<typeof message> | null = null;
  let recovered = false, receipt = "sent";
  vi.mocked(fetch).mockImplementation((input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/messages")) {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        durable = { ...message(1, body.text), clientMessageId: body.clientMessageId, author: { ...actor, kind: "operator" } };
        return Promise.reject(new Error("Response lost"));
      }
      return Promise.resolve(Response.json({ items: recovered && !url.searchParams.has("cursor") ? [durable] : [], nextCursor: null }));
    }
    if (url.pathname.endsWith("/receipts") && init?.method !== "POST") return Promise.resolve(Response.json({ items: receipt === "sent" ? [] : [{
      participantId: id, assignmentVersion: 0, receivedOrder: "1", readOrder: receipt === "read" ? "1" : "0",
    }] }));
    return network(input, init);
  });
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  try {
    await act(async () => { render(view()); });
    fireEvent.change(screen.getByRole("textbox", { name: "Reply to customer" }), { target: { value: "Missed response" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send reply" })));
    expect(screen.getByRole("button", { name: "Retry reply" })).toBeDefined();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => window.dispatchEvent(new Event("offline")));
    expect((screen.getByRole("button", { name: "Retry reply" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("You’re offline. Check your connection and retry.")).toBeDefined();
    recovered = true;
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(screen.getByText("Connection restored. Messages updated.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Retry reply" })).toBeNull();
    expect(screen.getAllByText("Missed response")).toHaveLength(1);
    expect(screen.getByText("Sent")).toBeDefined();
    expect(screen.queryByText("Delivered")).toBeNull();
    receipt = "delivered";
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByText("Delivered")).toBeDefined();
    receipt = "read";
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByText("Read")).toBeDefined();
  } finally { vi.useRealTimers(); }
});

it("refuses malformed or private-note storage and lets the operator explicitly start a new public draft", async () => {
  selectAssigned();
  const replyKey = `carberk.history.public-reply.v1:${actor.id}:${id}:1`;
  localStorage.setItem(replyKey, JSON.stringify({ text: "Private note must not become public", revision: id, intent: null, channel: "private-note" }));
  render(view());
  await screen.findByText("The saved draft is unreadable. Start a new draft to replace it.");
  expect((screen.getByRole("textbox", { name: "Reply to customer" }) as HTMLTextAreaElement).value).toBe("");
  expect(screen.queryByText("Private note must not become public")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Start a new draft" }));
  await waitFor(() => expect((screen.getByRole("textbox", { name: "Reply to customer" }) as HTMLTextAreaElement).disabled).toBe(false));
  fireEvent.change(screen.getByRole("textbox", { name: "Reply to customer" }), { target: { value: "Only public text" } });
  await screen.findByText("Draft saved on this device.");
  expect(localStorage.getItem(replyKey)).toContain("Only public text");
  expect(localStorage.getItem(replyKey)).not.toContain("Private note");
});

it("does not hydrate stored protected text until the selected request passes current authority", async () => {
  selectAssigned();
  localStorage.setItem(`carberk.history.public-reply.v1:${actor.id}:${id}:1`, JSON.stringify({ text: "Stored protected reply", revision: id, intent: null }));
  const network = networkHandler(), pending = deferred<Response>();
  let captured = false;
  const storage = vi.spyOn(window.localStorage, "getItem");
  vi.mocked(fetch).mockImplementation((input, init) => {
    if (String(input).endsWith(id) && !captured) { captured = true; return pending.promise; }
    return network(input, init);
  });
  render(view());
  await waitFor(() => expect(captured).toBe(true));
  expect(screen.queryByRole("textbox", { name: "Reply to customer" })).toBeNull();
  expect(storage.mock.calls).toEqual([]);
  await act(async () => pending.resolve(Response.json({}, { status: 403 })));
  await screen.findByText("Access denied");
  expect(storage.mock.calls).toEqual([]);
  expect(document.body.textContent).not.toContain("Stored protected reply");
});

it("keeps fresh-session edits when an old initiating session receives its successful send response", async () => {
  selectAssigned();
  const network = networkHandler(), pending = deferred<Response>();
  const oldToken = platform.token, freshToken = token(actor.id);
  let intent: { clientMessageId: string; text: string } | undefined;
  vi.mocked(fetch).mockImplementation((input, init) => {
    if (String(input).includes("/messages")) {
      if (init?.method === "POST") { intent = JSON.parse(String(init.body)); return pending.promise; }
      return Promise.resolve(Response.json({ items: [], nextCursor: null }));
    }
    return network(input, init);
  });
  const tree = await resolveServerTree(await HistoryDeskPage({ params: Promise.resolve({ locale: "en" }) }));
  const mounted = platform.requestCookies.run(oldToken, () => render(tree));
  fireEvent.change(await screen.findByRole("textbox", { name: "Reply to customer" }), { target: { value: "Old session intent" } });
  await act(async () => platform.requestCookies.run(oldToken, () => fireEvent.click(screen.getByRole("button", { name: "Send reply" }))));
  expect(intent?.text).toBe("Old session intent");
  platform.token = freshToken;
  const replacement = await resolveServerTree(await HistoryDeskPage({ params: Promise.resolve({ locale: "en" }) }));
  await act(async () => platform.requestCookies.run(freshToken, () => mounted.rerender(replacement)));
  fireEvent.change(await screen.findByRole("textbox", { name: "Reply to customer" }), { target: { value: "Fresh session edit" } });
  const stored = JSON.stringify(Object.values(localStorage));
  await act(async () => pending.resolve(Response.json({ ...message(1, intent?.text), clientMessageId: intent?.clientMessageId,
    author: { ...actor, kind: "operator" } })));
  expect(JSON.stringify(Object.values(localStorage))).toBe(stored);
  expect((screen.getByRole("textbox", { name: "Reply to customer" }) as HTMLTextAreaElement).value).toBe("Fresh session edit");
  expect(screen.getByRole("button", { name: "Retry reply" })).toBeDefined();
  expect(screen.queryByText("Sent")).toBeNull();
});

it("keeps every acknowledged reply visible while transcript refresh is unavailable", async () => {
  selectAssigned();
  const network = networkHandler();
  let sent = 0;
  vi.mocked(fetch).mockImplementation((input, init) => {
    if (String(input).includes("/messages")) {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)); sent++;
        return Promise.resolve(Response.json({ ...message(sent + 1, body.text), clientMessageId: body.clientMessageId, author: { ...actor, kind: "operator" } }));
      }
      return Promise.resolve(sent ? Response.json({}, { status: 503 }) : Response.json({ items: [], nextCursor: null }));
    }
    return network(input, init);
  });
  render(view());
  const input = await screen.findByRole("textbox", { name: "Reply to customer" });
  for (const text of ["First acknowledged reply", "Second acknowledged reply"]) {
    fireEvent.change(input, { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
    await screen.findByText(text);
    await waitFor(() => expect((screen.getByRole("button", { name: "Send reply" }) as HTMLButtonElement).disabled).toBe(true));
    await screen.findByText("Could not update messages. Showing previously loaded messages.");
  }
  expect(screen.getByText("First acknowledged reply")).toBeDefined();
  expect(screen.getByText("Second acknowledged reply")).toBeDefined();
  expect(screen.getAllByText("Sent")).toHaveLength(2);
});

it("retains a newer draft when acknowledgement storage fails and recovers it without another send", async () => {
  selectAssigned();
  const network = networkHandler(), pending = deferred<Response>();
  let intent: { clientMessageId: string; text: string } | undefined;
  vi.mocked(fetch).mockImplementation((input, init) => {
    if (String(input).includes("/messages")) {
      if (init?.method === "POST") { intent = JSON.parse(String(init.body)); return pending.promise; }
      return Promise.resolve(Response.json({ items: [], nextCursor: null }));
    }
    return network(input, init);
  });
  const mounted = render(view());
  fireEvent.change(await screen.findByRole("textbox", { name: "Reply to customer" }), { target: { value: "Acknowledged revision" } });
  fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
  await waitFor(() => expect(intent?.text).toBe("Acknowledged revision"));
  fireEvent.change(screen.getByRole("textbox", { name: "Reply to customer" }), { target: { value: "Retain my newer revision" } });
  const writes = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
  await act(async () => pending.resolve(Response.json({ ...message(1, intent?.text), clientMessageId: intent?.clientMessageId, author: { ...actor, kind: "operator" } })));
  await screen.findByText("Sent");
  expect(screen.getByText("Draft not saved. Keep this page open and retry saving.")).toBeDefined();
  expect(screen.queryByText("Draft saved on this device.")).toBeNull();
  expect((screen.getByRole("textbox", { name: "Reply to customer" }) as HTMLTextAreaElement).value).toBe("Retain my newer revision");
  writes.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: "Retry saving draft" }));
  await screen.findByText("Draft saved on this device.");
  mounted.unmount(); render(view());
  await waitFor(() => expect((screen.getByRole("textbox", { name: "Reply to customer" }) as HTMLTextAreaElement).value).toBe("Retain my newer revision"));
  expect(screen.queryByRole("button", { name: "Retry reply" })).toBeNull();
});

it.each([
  ["tk", "Müşderä jogap", "Jogaby iber", "Iberilýär", "Jogaby gaýtadan iber", "Iberildi"],
  ["ru", "Ответ клиенту", "Отправить ответ", "Отправляется", "Повторить отправку", "Отправлено"],
  ["en", "Reply to customer", "Send reply", "Pending", "Retry reply", "Sent"],
] as const)("renders %s public reply Pending, failure and same-intent recovery through MSW", async (locale, label, send, pendingLabel, retry, sent) => {
  selectAssigned();
  const response = deferred<Response>();
  const bodies: { clientMessageId: string; text: string }[] = [];
  let stored: ReturnType<typeof message> | null = null;
  server.use(
    http.post(`http://api.test/api/v1/vehicle-history/operator/requests/${id}/messages`, async ({ request }) => {
      const body = await request.json() as { clientMessageId: string; text: string }; bodies.push(body);
      if (bodies.length === 1) return response.promise;
      stored = { ...message(1, body.text), clientMessageId: body.clientMessageId, author: { ...actor, kind: "operator" } };
      return Response.json(stored);
    }),
    http.get(`http://api.test/api/v1/vehicle-history/operator/requests/${id}/messages`, ({ request }) => Response.json({
      items: stored && !new URL(request.url).searchParams.has("cursor") ? [stored] : [], nextCursor: null,
    })),
  );
  render(<HistoryWorkbench locale={locale} section="desk"><HistoryInbox locale={locale} /></HistoryWorkbench>);
  const input = await screen.findByRole("textbox", { name: label });
  const text = "Ähli maglumatlar\nПодробные сведения\nFull details ".repeat(50);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: send }));
  await screen.findByText(pendingLabel);
  await act(async () => response.resolve(Response.json({}, { status: 503 })));
  fireEvent.click(await screen.findByRole("button", { name: retry }));
  await screen.findByText(sent);
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toEqual(bodies[1]);
  expect(bodies[0]?.text).toBe(text);
  await waitFor(() => expect(screen.getAllByText(/Ähli maglumatlar/)).toHaveLength(1));
  expect((input as HTMLTextAreaElement).value).toBe("");
});

it("offers keyboard reading of a long pending reply while keeping newer writing available", async () => {
  selectAssigned();
  const network = networkHandler(), pending = deferred<Response>();
  let sent: { clientMessageId: string; text: string } | undefined;
  vi.mocked(fetch).mockImplementation((input, init) => {
    if (String(input).includes("/messages")) {
      if (init?.method === "POST") { sent = JSON.parse(String(init.body)); return pending.promise; }
      return Promise.resolve(Response.json({ items: [], nextCursor: null }));
    }
    return network(input, init);
  });
  render(view());
  const text = "Длинный ответ\nUzyn jogap\n".repeat(100);
  fireEvent.change(await screen.findByRole("textbox", { name: "Reply to customer" }), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
  const readingArea = await screen.findByRole("region", { name: "Reply text" });
  expect(readingArea.textContent).toBe(text);
  readingArea.focus();
  expect(document.activeElement).toBe(readingArea);
  fireEvent.change(screen.getByRole("textbox", { name: "Reply to customer" }), { target: { value: "Next reply remains editable" } });
  expect(readingArea.textContent).toBe(text);
  await waitFor(() => expect(sent?.text).toBe(text));
  await act(async () => pending.resolve(Response.json({ ...message(1, text), clientMessageId: sent?.clientMessageId, author: { ...actor, kind: "operator" } })));
  await screen.findByText("Sent");
  expect((screen.getByRole("textbox", { name: "Reply to customer" }) as HTMLTextAreaElement).value).toBe("Next reply remains editable");
});
