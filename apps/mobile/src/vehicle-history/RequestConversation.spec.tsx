import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import * as SecureStore from "expo-secure-store";
import { focusManager, onlineManager } from "@tanstack/react-query";

import RequestScreen from "../../app/vehicle-history/requests/[id]";
import { act, fireEvent, getHost, renderMobile, routeParams, screenFocus } from "../../test/render";
import { server } from "../../test/msw";
import { storeAuthSession } from "../auth/session";

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const userId = "00000000-0000-4000-8000-000000000001";
const operatorId = "00000000-0000-4000-8000-000000000002";
const requestId = "10000000-0000-4000-8000-000000000101";
const firstId = "20000000-0000-4000-8000-000000000001";
const nextId = "20000000-0000-4000-8000-000000000002";
const session = (sid = "session-one", id = userId) => ({
  accessToken: `header.${btoa(JSON.stringify({ sid, sub: id }))}.signature`, refreshToken: `refresh-${sid}`,
  user: { id, phone: null, email: "synthetic@example.test", displayName: null, role: "buyer" as const },
});
const operator = { id: operatorId, displayName: "Ayna", nameNumber: 42 };
const enquiry = { id: requestId, sourceListingId: null, createdAt: "2026-11-14T08:00:00.000Z",
  status: "enquiry", assignedOperator: operator, assignmentVersion: 1 };
const message = (id = firstId, order = "1", own = false) => ({
  id, order, kind: "TEXT", clientMessageId: id, text: own ? "Can I ask without a VIN?" : "Questions are welcome.",
  createdAt: "2026-11-14T08:01:00.000Z",
  author: { ...(own ? { id: userId, displayName: null, nameNumber: 7 } : operator), kind: own ? "requester" : "operator" },
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
async function visible(view: Awaited<ReturnType<typeof renderMobile>>, ids = [firstId]) {
  await act(() => getHost(view.container, "RCTScrollView").props.onViewableItemsChanged({
    viewableItems: ids.map((id) => ({ isViewable: true, item: { id } })),
  }));
}
let stored: string | null;
let acknowledgements: { cursor: string; kind: string }[];
beforeEach(async () => {
  stored = null;
  acknowledgements = [];
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async () => stored);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (_key, value) => { stored = value; });
  vi.stubEnv("EXPO_PUBLIC_ENV", "development");
  vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", "true");
  focusManager.setFocused(true);
  routeParams.id = requestId;
  server.use(
    http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry)),
    http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ items: [message()], nextCursor: null })),
    http.get("*/vehicle-history/requests/:id/receipts", () => HttpResponse.json({ items: [] })),
    http.post("*/vehicle-history/requests/:id/receipts", async ({ request }) => {
      acknowledgements.push(await request.json() as { cursor: string; kind: string });
      return HttpResponse.json({ participantId: userId, assignmentVersion: 0, receivedOrder: "2", readOrder: "0" });
    }),
  );
  await storeAuthSession(session());
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); focusManager.setFocused(true); onlineManager.setOnline(true); vi.unstubAllEnvs(); });

it("appends ascending pages, retains earlier messages on failure, and retries the exact forward cursor", async () => {
  const cursors: (string | null)[] = [];
  let fail = true;
  server.use(http.get("*/vehicle-history/requests/:id/messages", ({ request }) => {
    const url = new URL(request.url);
    expect(url.searchParams.get("limit")).toBe("50");
    cursors.push(url.searchParams.get("cursor"));
    return !url.searchParams.has("cursor") ? HttpResponse.json({ items: [message(firstId, "1", true)], nextCursor: firstId })
      : fail ? HttpResponse.json({ code: "UNAVAILABLE" }, { status: 503 })
        : HttpResponse.json({ items: [message(nextId, "2")], nextCursor: null });
  }));
  const view = await renderMobile(<RequestScreen />);
  expect(await view.findByText("Can I ask without a VIN?")).toBeTruthy();
  expect(view.getByText("Operator: Ayna")).toBeTruthy();
  expect(view.getByText("Sent")).toBeTruthy();
  await fireEvent.press(view.getByRole("button", { name: "Load more messages" }));
  expect(await view.findByText("Could not load more messages.")).toBeTruthy();
  expect(view.getByText("Can I ask without a VIN?")).toBeTruthy();
  fail = false;
  await fireEvent.press(view.getByRole("button", { name: "Retry" }));
  expect(await view.findByText("Questions are welcome.")).toBeTruthy();
  expect(view.getAllByText(/Can I ask|Questions are/).map((node) => node.props.children))
    .toEqual(["Can I ask without a VIN?", "Questions are welcome."]);
  expect(cursors).toEqual([null, firstId, firstId]);
  await vi.waitFor(() => expect(acknowledgements).toEqual([
    { cursor: firstId, kind: "received" }, { cursor: nextId, kind: "received" },
  ]));
});

it("keeps the reading position and arrived messages when reconciliation fails", async () => {
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("Questions are welcome.");
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ code: "UNAVAILABLE" }, { status: 503 })));
  await act(() => onlineManager.setOnline(false));
  await act(() => onlineManager.setOnline(true));
  expect(await view.findByText("Something went wrong")).toBeTruthy();
  expect(view.getByText("Questions are welcome.")).toBeTruthy();
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ items: [message()], nextCursor: null })));
  await fireEvent.press(view.getByRole("button", { name: "Retry" }));
  await vi.waitFor(() => expect(view.queryByText("Something went wrong")).toBeNull());
  expect(view.getByText("Questions are welcome.")).toBeTruthy();
});

it("waits for Received before Read, and acknowledges only a genuinely visible loaded row", async () => {
  const received = deferred<Response>();
  server.use(http.post("*/vehicle-history/requests/:id/receipts", async ({ request }) => {
    const body = await request.json() as { cursor: string; kind: string };
    acknowledgements.push(body);
    return body.kind === "received" ? received.promise.then((reply) => reply.clone())
      : HttpResponse.json({ participantId: userId, assignmentVersion: 0, receivedOrder: "1", readOrder: "1" });
  }));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("Questions are welcome.");
  await visible(view, [nextId]);
  await visible(view);
  expect(acknowledgements).toEqual([{ cursor: firstId, kind: "received" }]);
  await act(() => received.resolve(HttpResponse.json({ participantId: userId, assignmentVersion: 0, receivedOrder: "1", readOrder: "0" })));
  await vi.waitFor(() => expect(acknowledgements).toEqual([
    { cursor: firstId, kind: "received" }, { cursor: firstId, kind: "read" },
  ]));
});

it.each(["blur", "background", "offscreen"])("never reads after a pending Received finishes while %s", async (state) => {
  const received = deferred<Response>();
  server.use(http.post("*/vehicle-history/requests/:id/receipts", async ({ request }) => {
    acknowledgements.push(await request.json() as { cursor: string; kind: string });
    return received.promise.then((reply) => reply.clone());
  }));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("Questions are welcome.");
  await visible(view);
  if (state === "blur") { screenFocus.focused = false; await view.rerender(<RequestScreen />); }
  if (state === "background") await act(() => focusManager.setFocused(false));
  if (state === "offscreen") await visible(view, []);
  await act(() => received.resolve(HttpResponse.json({ participantId: userId, assignmentVersion: 0, receivedOrder: "1", readOrder: "0" })));
  expect(acknowledgements).toEqual([{ cursor: firstId, kind: "received" }]);
});

it("never reads hidden rows after receipt access is denied during Received", async () => {
  const received = deferred<Response>();
  const receiptAccess = deferred<Response>();
  server.use(http.get("*/vehicle-history/requests/:id/receipts", () => receiptAccess.promise.then((reply) => reply.clone())),
    http.post("*/vehicle-history/requests/:id/receipts", async ({ request }) => {
      acknowledgements.push(await request.json() as { cursor: string; kind: string });
      return received.promise.then((reply) => reply.clone());
    }));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("Questions are welcome.");
  await visible(view);
  await act(() => receiptAccess.resolve(HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 })));
  await view.findByText("This request is unavailable for this session. Go back to your requests.");
  await act(() => received.resolve(HttpResponse.json({ participantId: userId, assignmentVersion: 0, receivedOrder: "1", readOrder: "0" })));
  expect(view.queryByText("Questions are welcome.")).toBeNull();
  expect(acknowledgements).toEqual([{ cursor: firstId, kind: "received" }]);
});

it("retries a lost acknowledgement without treating either GET as delivery", async () => {
  let fail = true;
  server.use(http.post("*/vehicle-history/requests/:id/receipts", async ({ request }) => {
    acknowledgements.push(await request.json() as { cursor: string; kind: string });
    return fail ? HttpResponse.error()
      : HttpResponse.json({ participantId: userId, assignmentVersion: 0, receivedOrder: "1", readOrder: "0" });
  }));
  const view = await renderMobile(<RequestScreen />);
  expect(await view.findByText("Could not update message status.")).toBeTruthy();
  expect(view.getByText("Questions are welcome.")).toBeTruthy();
  fail = false;
  await fireEvent.press(view.getByRole("button", { name: "Retry message status" }));
  await vi.waitFor(() => expect(view.queryByText("Could not update message status.")).toBeNull());
  expect(acknowledgements).toEqual([{ cursor: firstId, kind: "received" }, { cursor: firstId, kind: "received" }]);
});

it("offers receipt retry when an acknowledgement does not establish its claimed progress", async () => {
  server.use(http.post("*/vehicle-history/requests/:id/receipts", async ({ request }) => {
    acknowledgements.push(await request.json() as { cursor: string; kind: string });
    return HttpResponse.json({ participantId: userId, assignmentVersion: 0, receivedOrder: "0", readOrder: "0" });
  }));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("Questions are welcome.");
  await visible(view);
  expect(await view.findByText("Could not update message status.")).toBeTruthy();
  expect(view.getByRole("button", { name: "Retry message status" })).toBeTruthy();
  expect(acknowledgements).toEqual([{ cursor: firstId, kind: "received" }]);
});

it("uses only the other current operator epoch for Delivered and Read", async () => {
  let facts = [
    { participantId: userId, assignmentVersion: 0, receivedOrder: "9", readOrder: "9" },
    { participantId: operatorId, assignmentVersion: 0, receivedOrder: "9", readOrder: "9" },
  ];
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ items: [message(firstId, "1", true)], nextCursor: null })),
    http.get("*/vehicle-history/requests/:id/receipts", () => HttpResponse.json({ items: facts })));
  const view = await renderMobile(<RequestScreen />);
  expect(await view.findByText("Sent")).toBeTruthy();
  facts = [{ participantId: operatorId, assignmentVersion: 1, receivedOrder: "1", readOrder: "0" }];
  await act(() => view.queryClient.invalidateQueries({ predicate: (query) => query.queryKey.at(-1) === "receipts" }));
  expect(await view.findByText("Delivered")).toBeTruthy();
  facts = [{ participantId: operatorId, assignmentVersion: 1, receivedOrder: "1", readOrder: "1" }];
  await act(() => view.queryClient.invalidateQueries({ predicate: (query) => query.queryKey.at(-1) === "receipts" }));
  expect(await view.findByText("Read")).toBeTruthy();
});

it.each([
  ["lookahead", { items: [message()], nextCursor: nextId }],
  ["foreign", { items: [{ ...message(), author: { ...operator, kind: "requester" } }], nextCursor: null }],
  ["future", { items: [message(nextId, "2"), message(firstId, "1")], nextCursor: null }],
  ["malformed", { items: [{ ...message(), order: "not an order" }], nextCursor: null }],
])("does not acknowledge a %s page/cursor", async (_kind, page) => {
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json(page)));
  const view = await renderMobile(<RequestScreen />);
  expect(await view.findByText(_kind === "malformed" ? "Something went wrong" : "This request changed. Refresh it to continue.")).toBeTruthy();
  expect(view.queryByText("Questions are welcome.")).toBeNull();
  expect(acknowledgements).toEqual([]);
});

it.each(["user", "session", "request", "assignment", "unmount"])("drops a delayed page after %s changes", async (change) => {
  const response = deferred<Response>();
  const started = deferred<undefined>();
  let old = true;
  let currentRequest = enquiry;
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(currentRequest)),
    http.get("*/vehicle-history/requests/:id/messages", () => {
      if (old) { started.resolve(undefined); return response.promise.then((reply) => reply.clone()); }
      return HttpResponse.json({ items: [], nextCursor: null });
    }));
  const view = await renderMobile(<RequestScreen />);
  await started.promise;
  old = false;
  if (change === "user" || change === "session") await act(() => storeAuthSession(session("session-two", change === "user" ? operatorId : userId)));
  if (change === "request") { routeParams.id = nextId; currentRequest = { ...enquiry, id: nextId }; await view.rerender(<RequestScreen />); }
  if (change === "assignment") {
    currentRequest = { ...enquiry, assignmentVersion: 2 };
    await act(() => view.queryClient.invalidateQueries({ queryKey: ["vehicle-history", userId, "session-one", "requests", requestId], exact: true }));
  }
  if (change === "unmount") await view.unmount();
  else await view.findByText("No messages yet. This is an enquiry, not an order. No payment is needed.");
  await act(() => response.resolve(HttpResponse.json({ items: [message()], nextCursor: null })));
  if (change !== "unmount") expect(view.queryByText("Questions are welcome.")).toBeNull();
  expect(acknowledgements).toEqual([]);
});

it.each(["user", "session", "request", "assignment", "unmount"])("never follows a stale Received with Read after %s changes", async (change) => {
  const response = deferred<Response>();
  const started = deferred<undefined>();
  let currentRequest = enquiry;
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(currentRequest)),
    http.post("*/vehicle-history/requests/:id/receipts", async ({ request }) => {
      acknowledgements.push(await request.json() as { cursor: string; kind: string });
      started.resolve(undefined);
      return response.promise.then((reply) => reply.clone());
    }));
  const view = await renderMobile(<RequestScreen />);
  await started.promise;
  await visible(view);
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ items: [], nextCursor: null })));
  if (change === "user" || change === "session") await act(() => storeAuthSession(session("session-two", change === "user" ? operatorId : userId)));
  if (change === "request") { routeParams.id = nextId; currentRequest = { ...enquiry, id: nextId }; await view.rerender(<RequestScreen />); }
  if (change === "assignment") {
    currentRequest = { ...enquiry, assignmentVersion: 2 };
    await act(() => view.queryClient.invalidateQueries({ queryKey: ["vehicle-history", userId, "session-one", "requests", requestId], exact: true }));
  }
  if (change === "unmount") await view.unmount();
  else await view.findByText("No messages yet. This is an enquiry, not an order. No payment is needed.");
  await act(() => response.resolve(HttpResponse.json({ participantId: userId, assignmentVersion: 0, receivedOrder: "1", readOrder: "0" })));
  expect(acknowledgements).toEqual([{ cursor: firstId, kind: "received" }]);
});

it.each(["focus", "foreground", "reconnect", "active"])("reconciles an active transcript on %s", async (trigger) => {
  let reconcileActive: (() => void) | undefined;
  const realInterval = globalThis.setInterval;
  if (trigger === "active") vi.spyOn(globalThis, "setInterval").mockImplementation(((callback: () => void, delay: number) => {
    if (delay !== 15_000) return realInterval(callback, delay);
    reconcileActive = callback;
    return 12345;
  }) as typeof setInterval);
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("Questions are welcome.");
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [message(), { ...message(nextId, "2"), text: "A new answer" }], nextCursor: null,
  })));
  if (trigger === "focus") {
    screenFocus.focused = false; await view.rerender(<RequestScreen />);
    screenFocus.focused = true; await view.rerender(<RequestScreen />);
  }
  if (trigger === "foreground") { await act(() => focusManager.setFocused(false)); await act(() => focusManager.setFocused(true)); }
  if (trigger === "reconnect") { await act(() => onlineManager.setOnline(false)); await act(() => onlineManager.setOnline(true)); }
  if (trigger === "active") await act(() => reconcileActive?.());
  expect(await view.findByText("A new answer")).toBeTruthy();
  expect(view.getByText("Questions are welcome.")).toBeTruthy();
  await view.unmount();
  vi.restoreAllMocks();
});

it.each(["session", "assignment"])("requires new contiguous HTTP evidence after %s replacement despite populated cache", async (change) => {
  const response = deferred<Response>();
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("Questions are welcome.");
  await vi.waitFor(() => expect(acknowledgements).toHaveLength(1));
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => response.promise.then((reply) => reply.clone())));
  if (change === "session") await act(() => storeAuthSession(session("session-two")));
  else {
    server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ ...enquiry, assignmentVersion: 2 })));
    await act(() => view.queryClient.invalidateQueries({ queryKey: ["vehicle-history", userId, "session-one", "requests", requestId], exact: true }));
  }
  await view.findByLabelText("Please wait...");
  expect(view.queryByText("Questions are welcome.")).toBeNull();
  expect(acknowledgements).toHaveLength(1);
  await act(() => response.resolve(HttpResponse.json({ items: [message()], nextCursor: null })));
  await view.findByText("Questions are welcome.");
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ cursor: firstId, kind: "received" }, { cursor: firstId, kind: "received" }]));
});

it("asserts the originating reader again before an ACK refresh retry", async () => {
  const refresh = deferred<Response>();
  const refreshing = deferred<undefined>();
  const readers: string[] = [];
  server.use(http.post("*/vehicle-history/requests/:id/receipts", ({ request }) => {
    readers.push(request.headers.get("Authorization") ?? "");
    return HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }), http.post("*/auth/refresh", () => { refreshing.resolve(undefined); return refresh.promise.then((reply) => reply.clone()); }));
  const view = await renderMobile(<RequestScreen />);
  await refreshing.promise;
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ items: [], nextCursor: null })));
  await act(() => storeAuthSession(session("session-two")));
  await act(() => refresh.resolve(HttpResponse.json({ accessToken: session().accessToken, refreshToken: "rotated" })));
  await view.findByText("No messages yet. This is an enquiry, not an order. No payment is needed.");
  expect(readers).toEqual([`Bearer ${session().accessToken}`]);
});

it.each([["foreign", requestId], ["unloaded", nextId]])("does not read a %s cursor absent from the arrived page", async (_kind, cursor) => {
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("Questions are welcome.");
  await vi.waitFor(() => expect(acknowledgements).toHaveLength(1));
  await visible(view, [cursor ?? ""]);
  expect(acknowledgements).toEqual([{ cursor: firstId, kind: "received" }]);
});

it("shows transcript loading, empty, denial and assignment conflict with safe recovery", async () => {
  const response = deferred<Response>();
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => response.promise.then((reply) => reply.clone())));
  const view = await renderMobile(<RequestScreen />);
  expect(await view.findByLabelText("Please wait...")).toBeTruthy();
  await act(() => response.resolve(HttpResponse.json({ items: [], nextCursor: null })));
  expect(await view.findByText("No messages yet. This is an enquiry, not an order. No payment is needed.")).toBeTruthy();
  const refresh = () => view.queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes("transcript") && query.queryKey.at(-1) !== "receipts" });
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 })));
  await act(refresh);
  expect(await view.findByText("This request is unavailable for this session. Go back to your requests.")).toBeTruthy();
  expect(view.getByRole("button", { name: "Back to requests" })).toBeTruthy();
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ code: "HISTORY_ASSIGNMENT_CONFLICT" }, { status: 409 })));
  await act(refresh);
  expect(await view.findByText("This request changed. Refresh it to continue.")).toBeTruthy();
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ items: [message()], nextCursor: null })));
  await fireEvent.press(view.getByRole("button", { name: "Retry" }));
  expect(await view.findByText("Questions are welcome.")).toBeTruthy();
});

it.each([
  ["en", "Operator: Driver 42", "You", "Sent", "No connection"],
  ["ru", "Оператор: Водитель 42", "Вы", "Отправлено", "Нет подключения"],
  ["tk", "Operator: Sürüji 42", "Siz", "Iberildi", "Baglanyşyk ýok"],
])("preserves long exact text, generated operator identity and message facts in %s", async (locale, named, you, sent, offline) => {
  const text = "A question without a VIN.\n" + "Ж / Ý / 🚗 ".repeat(100);
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ ...enquiry, assignedOperator: { ...operator, displayName: null } })),
    http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ items: [{ ...message(firstId, "1", true), text }], nextCursor: null })));
  const view = await renderMobile(<RequestScreen />, { locale });
  expect(await view.findByText(text)).toBeTruthy();
  expect(view.getByText(named ?? "")).toBeTruthy();
  expect(view.getByText(you ?? "")).toBeTruthy();
  expect(view.getByText(sent ?? "")).toBeTruthy();
  await act(() => onlineManager.setOnline(false));
  expect(await view.findByText(offline ?? "")).toBeTruthy();
  expect(view.queryByRole("textbox")).toBeNull();
  await view.unmount();
});
