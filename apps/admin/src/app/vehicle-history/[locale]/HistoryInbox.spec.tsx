// @vitest-environment happy-dom
import { PassThrough } from "node:stream";

import { act, cloneElement, isValidElement, type ReactNode } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

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
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("API_BASE_URL", "http://api.test");
  platform.token = token(); assigned = false; requests = [];
  window.history.replaceState(null, "", "/vehicle-history/en");
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input); requests.push({ path: url.pathname + url.search, method: init?.method ?? "GET", body: init?.body });
    if (url.pathname.endsWith("/desk")) return Response.json({ purpose: "vehicle-history", mode: "synthetic", actor, requests: [] });
    if (url.pathname.endsWith("/claim")) { assigned = true; return Response.json(detail()); }
    if (url.pathname.endsWith("/messages")) return Response.json({ items: [{ id, clientMessageId: id, order: "1", kind: "TEXT",
      text: "Can you check this car?", author: { ...actor, kind: "requester" }, createdAt: row.createdAt }], nextCursor: null });
    if (url.pathname.endsWith(id)) return Response.json(detail());
    return Response.json({ items: [assigned ? { ...row, mine: true, assignmentVersion: 1, assignedOperator: actor } : row], nextCursor: null });
  }));
});
afterEach(async () => {
  cleanup();
  await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
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
  expect(requests.filter((r) => r.method === "POST")).toEqual([{ path: `/api/v1/vehicle-history/operator/requests/${id}/claim`, method: "POST", body: '{"expectedAssignmentVersion":0}' }]);
  expect(requests.some((r) => r.path.includes("receipts"))).toBe(false);
  expect(screen.queryByRole("textbox", { name: /reply|note/i })).toBeNull();
  await waitFor(() => expect(document.activeElement?.id).toBe("selected-enquiry"));
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
it("pages the queue and transcript through real cursor URLs without receipt writes", async () => {
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
  expect(requests.filter((r) => r.method === "POST")).toEqual([]);
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
    expect(requests.some((request) => request.method === "POST")).toBe(false);
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
