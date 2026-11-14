import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { useNavigation } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { onlineManager } from "@tanstack/react-query";

import ChatScreen from "../../app/(tabs)/chat";
import RequestScreen from "../../app/vehicle-history/requests/[id]";
import { queryKeys } from "../api/queryKeys";
import HistoryScreen from "../../app/vehicle-history/requests";
import { act, fireEvent, renderMobile, routerMock, routeParams } from "../../test/render";
import { server } from "../../test/msw";
import { clearAuthSession, storeAuthSession } from "../auth/session";

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const userId = "00000000-0000-4000-8000-000000000001";
const requestId = "10000000-0000-4000-8000-000000000101";
const secondId = "20000000-0000-4000-8000-000000000102";
const session = (sid = "session-one", id = userId) => ({
  accessToken: `header.${btoa(JSON.stringify({ sid, sub: id }))}.signature`, refreshToken: `refresh-${sid}`,
  user: { id, phone: null, email: "synthetic@example.test", displayName: null, role: "buyer" as const },
});
const enquiry = (id = requestId) => ({ id, sourceListingId: null, createdAt: "2026-11-14T08:00:00.000Z", status: "enquiry", assignedOperator: null });
let stored: string | null;
beforeEach(async () => {
  vi.mocked(useNavigation).mockReturnValue({ getState: () => undefined } as ReturnType<typeof useNavigation>);
  stored = null;
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async () => stored);
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async () => { stored = null; });
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (_key, value) => { stored = value; });
  vi.stubEnv("EXPO_PUBLIC_ENV", "development");
  vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", "true");
  server.use(http.get("*/catalog/brands", () => HttpResponse.json({ items: [], nextCursor: null, hasMore: false })));
  await storeAuthSession(session());
});

it("browses older enquiries and reopens with reads only", async () => {
  const methods: string[] = [];
  server.use(http.all("*/vehicle-history/requests", ({ request }) => {
    methods.push(request.method);
    return HttpResponse.json(new URL(request.url).searchParams.has("cursor")
      ? { items: [enquiry(secondId)], nextCursor: null }
      : { items: [enquiry()], nextCursor: secondId });
  }));
  const view = await renderMobile(<HistoryScreen />);
  expect(await view.findByText("Your requests")).toBeTruthy();
  await fireEvent.press(await view.findByRole("button", { name: "Load older requests" }));
  await vi.waitFor(() => expect(view.getAllByText("Enquiry")).toHaveLength(2));
  await fireEvent.press(view.getByRole("button", { name: "Open request 20000000" }));
  expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/vehicle-history/requests/[id]", params: { id: secondId } });
  expect(methods).toEqual(["GET", "GET"]);
});

afterEach(() => { onlineManager.setOnline(true); vi.unstubAllEnvs(); });
const detailKey = (id = requestId, sid = "session-one") => queryKeys.vehicleHistory.detail(userId, sid, id);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

it("hides populated private caches until storage resolves", async () => {
  const hydration = deferred<string | null>();
  vi.mocked(SecureStore.getItemAsync).mockReturnValue(hydration.promise);
  routeParams.id = requestId;
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry())));
  const view = await renderMobile(<RequestScreen />);
  await act(() => { view.queryClient.setQueryData(detailKey(), enquiry()); });
  expect(view.getByText("Please wait...")).toBeTruthy();
  expect(view.queryByText("Request 10000000")).toBeNull();
  await act(() => hydration.resolve(stored));
  expect(await view.findByText("Request 10000000")).toBeTruthy();
});

it.each([false, true])("fences delayed reads across %s same-account session replacement", async (sameAccount) => {
  const response = deferred<Response>();
  const started = deferred<undefined>();
  server.use(http.get("*/vehicle-history/requests/:id", ({ request }) => {
    if (request.headers.get("Authorization") === `Bearer ${session().accessToken}`) {
      started.resolve(undefined); return response.promise.then((reply) => reply.clone());
    }
    return HttpResponse.json({ ...enquiry(), createdAt: "2026-11-15T08:00:00.000Z" });
  }));
  routeParams.id = requestId;
  const view = await renderMobile(<RequestScreen />);
  await started.promise;
  await act(() => storeAuthSession(session("session-two", sameAccount ? userId : secondId)));
  expect(await view.findByText(/11\/15\/2026/)).toBeTruthy();
  await act(() => response.resolve(HttpResponse.json(enquiry())));
  expect(view.queryByText(/11\/14\/2026/)).toBeNull();
  expect(view.queryClient.getQueryData(detailKey())).toBeUndefined();
});

it("does not repaint or cache an old request after switching request or disposing", async () => {
  const response = deferred<Response>();
  const started = deferred<undefined>();
  server.use(http.get("*/vehicle-history/requests/:id", ({ params }) => {
    if (params.id === requestId) { started.resolve(undefined); return response.promise.then((reply) => reply.clone()); }
    return HttpResponse.json(enquiry(secondId));
  }));
  routeParams.id = requestId;
  const view = await renderMobile(<RequestScreen />);
  await started.promise;
  routeParams.id = secondId;
  await view.rerender(<RequestScreen />);
  expect(await view.findByText("Request 20000000")).toBeTruthy();
  await view.unmount();
  await act(() => response.resolve(HttpResponse.json(enquiry())));
  expect(view.queryClient.getQueryData(detailKey())).toBeUndefined();
  expect(routerMock.push).not.toHaveBeenCalled();
});

it("drops an earlier cached request when the current read is denied", async () => {
  routeParams.id = requestId;
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry())));
  const view = await renderMobile(<RequestScreen />);
  expect(await view.findByText("Request 10000000")).toBeTruthy();
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 })));
  await act(() => view.queryClient.invalidateQueries({ queryKey: detailKey() }));
  expect(await view.findByRole("alert")).toHaveTextContent("This request is unavailable for this session. Go back to your requests.");
  expect(view.queryByText("Request 10000000")).toBeNull();
  expect(view.queryByText("Awaiting operator")).toBeNull();
});

it("shows offline and server failures and retries without creating a request", async () => {
  routeParams.id = requestId;
  onlineManager.setOnline(false);
  const view = await renderMobile(<RequestScreen />);
  expect(await view.findByText("No connection")).toBeTruthy();
  onlineManager.setOnline(true);
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ code: "UNAVAILABLE" }, { status: 503 })));
  await fireEvent.press(view.getByRole("button", { name: "Retry" }));
  expect(await view.findByText("Something went wrong")).toBeTruthy();
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry())));
  await fireEvent.press(view.getByRole("button", { name: "Retry" }));
  expect(await view.findByText("Awaiting operator")).toBeTruthy();
});

it.each(["loading", "empty", "error"])("keeps History reachable while marketplace Messages are %s", async (state) => {
  const response = deferred<Response>();
  server.use(http.get("*/conversations", () => state === "loading" ? response.promise.then((reply) => reply.clone())
    : HttpResponse.json(state === "empty" ? { items: [], nextCursor: null } : { code: "UNAVAILABLE" }, { status: state === "error" ? 503 : 200 })));
  const view = await renderMobile(<ChatScreen />);
  await fireEvent.press(await view.findByRole("button", { name: "Your Vehicle History requests" }));
  expect(routerMock.push).toHaveBeenCalledWith("/vehicle-history/requests");
  if (state === "empty") expect(await view.findByText("No conversations yet")).toBeTruthy();
  await act(() => response.resolve(HttpResponse.json({ items: [], nextCursor: null })));
});

it.each([
  ["en", "Enquiry", "Awaiting operator", "Back to requests"],
  ["ru", "Обращение", "Оператор ещё не назначен", "К обращениям"],
  ["tk", "Ýüz tutma", "Operator entek bellenmedi", "Ýüz tutmalara dolan"],
])("shows truthful service identity, optional untrusted context and safe return in %s", async (locale, title, awaiting, back) => {
  routeParams.id = requestId;
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ ...enquiry(), sourceListingId: secondId })));
  const view = await renderMobile(<RequestScreen />, { locale });
  expect(await view.findByText(title ?? "")).toBeTruthy();
  expect(view.getByText(awaiting ?? "")).toBeTruthy();
  expect(view.getByText(/context|контекст|goşmaça maglumat/)).toBeTruthy();
  expect(view.queryByRole("textbox")).toBeNull();
  expect(view.queryByText(/New request|Contact operator/)).toBeNull();
  routerMock.canGoBack.mockReturnValueOnce(false);
  await fireEvent.press(view.getByRole("button", { name: back ?? "" }));
  expect(routerMock.replace).toHaveBeenCalledWith("/vehicle-history/requests");
});

it("retains the calling stack and safely returns a cold list link to Messages", async () => {
  server.use(http.get("*/vehicle-history/requests", () => HttpResponse.json({ items: [], nextCursor: null })));
  const view = await renderMobile(<HistoryScreen />);
  expect(await view.findByText("You have no Vehicle History requests yet.")).toBeTruthy();
  await fireEvent.press(view.getByRole("button", { name: "Back" }));
  expect(routerMock.back).toHaveBeenCalled();
  routerMock.canGoBack.mockReturnValueOnce(false);
  await fireEvent.press(view.getByRole("button", { name: "Back" }));
  expect(routerMock.replace).toHaveBeenCalledWith("/(tabs)/chat");
});

it("refuses private deep links and hides the Messages entry when default off", async () => {
  vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", undefined);
  routeParams.id = requestId;
  const view = await renderMobile(<RequestScreen />);
  expect(await view.findByRole("alert")).toHaveTextContent("Vehicle History is not available in this build.");
  expect(view.queryByText("Request 10000000")).toBeNull();
  server.use(http.get("*/conversations", () => HttpResponse.json({ items: [], nextCursor: null })));
  await view.rerender(<ChatScreen />);
  expect(view.queryByRole("button", { name: "Your Vehicle History requests" })).toBeNull();
});

it("checks the original session again after a delayed refresh before retrying", async () => {
  const refresh = deferred<Response>();
  const refreshing = deferred<undefined>();
  const readers: string[] = [];
  server.use(http.get("*/vehicle-history/requests/:id", ({ request }) => {
    const token = request.headers.get("Authorization") ?? "";
    readers.push(token);
    return token === `Bearer ${session("session-two").accessToken}` ? HttpResponse.json(enquiry())
      : HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }), http.post("*/auth/refresh", () => { refreshing.resolve(undefined); return refresh.promise.then((reply) => reply.clone()); }));
  routeParams.id = requestId;
  const view = await renderMobile(<RequestScreen />);
  await refreshing.promise;
  await act(() => storeAuthSession(session("session-two")));
  await act(() => refresh.resolve(HttpResponse.json({ accessToken: session().accessToken, refreshToken: "rotated" })));
  expect(await view.findByText("Awaiting operator")).toBeTruthy();
  expect(readers).toEqual([`Bearer ${session().accessToken}`, `Bearer ${session("session-two").accessToken}`]);
  expect(view.queryClient.getQueryData(detailKey())).toBeUndefined();
});

it("hides a loaded request immediately on sign-out", async () => {
  routeParams.id = requestId;
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry())));
  const view = await renderMobile(<RequestScreen />);
  expect(await view.findByText("Request 10000000")).toBeTruthy();
  await act(() => clearAuthSession());
  expect(view.queryByText("Request 10000000")).toBeNull();
  expect(view.getByText("Sign in through Account to view your requests.")).toBeTruthy();
});

it.each([
  ["en", "Please wait...", "You have no Vehicle History requests yet.", "This request is unavailable for this session. Go back to your requests."],
  ["ru", "Подождите...", "У вас пока нет обращений по истории автомобиля.", "Обращение недоступно для этого сеанса. Вернитесь к своим обращениям."],
  ["tk", "Garaşyň...", "Ulag taryhy boýunça entek ýüz tutmaňyz ýok.", "Bu ýüz tutma şu sessiýa üçin elýeterli däl. Ýüz tutmalaryňyza dolanyň."],
])("localizes loading, empty and refusal in %s", async (locale, loading, empty, denied) => {
  const response = deferred<Response>();
  server.use(http.get("*/vehicle-history/requests", () => response.promise.then((reply) => reply.clone())));
  const view = await renderMobile(<HistoryScreen />, { locale });
  expect(await view.findByText(loading ?? "")).toBeTruthy();
  await act(() => response.resolve(HttpResponse.json({ items: [], nextCursor: null })));
  expect(await view.findByText(empty ?? "")).toBeTruthy();
  server.use(http.get("*/vehicle-history/requests", () => HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 })));
  await act(() => view.queryClient.invalidateQueries());
  expect(await view.findByRole("alert")).toHaveTextContent(denied ?? "");
});

it("keeps stale row actions from navigating after account change or disposal", async () => {
  server.use(http.get("*/vehicle-history/requests", () => HttpResponse.json({ items: [enquiry()], nextCursor: null })));
  const view = await renderMobile(<HistoryScreen />);
  const row = await view.findByRole("button", { name: "Open request 10000000" });
  const open = row.props.onPress as () => void;
  await act(() => storeAuthSession(session("session-two")));
  await act(() => open());
  expect(routerMock.push).not.toHaveBeenCalled();
  await view.unmount();
  await act(() => open());
  expect(routerMock.push).not.toHaveBeenCalled();
});

it("rejects malformed API replies instead of rendering an invented enquiry", async () => {
  routeParams.id = requestId;
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ ...enquiry(), assignedOperator: { name: "Invented" } })));
  const view = await renderMobile(<RequestScreen />);
  expect(await view.findByText("Something went wrong")).toBeTruthy();
  expect(view.queryByText("Invented")).toBeNull();
  expect(view.queryByText("Awaiting operator")).toBeNull();
});


it.each([false, true])("returns an anchored cold link to its feature destination (detail=%s)", async (detail) => {
  vi.mocked(useNavigation).mockReturnValue({ getState: () => ({
    index: 1, routes: [{ name: "(tabs)" }, { name: detail ? "vehicle-history/requests/[id]" : "vehicle-history/requests/index" }],
  }) } as ReturnType<typeof useNavigation>);
  routeParams.id = requestId;
  vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", undefined);
  const view = await renderMobile(detail ? <RequestScreen /> : <HistoryScreen />);
  await fireEvent.press(view.getByRole("button", { name: detail ? "Back to requests" : "Back" }));
  expect(routerMock.dismissTo).toHaveBeenCalledWith(detail ? "/vehicle-history/requests" : "/(tabs)/chat");
  expect(routerMock.back).not.toHaveBeenCalled();
});

it("keeps Back to the genuine Messages calling tab", async () => {
  vi.mocked(useNavigation).mockReturnValue({ getState: () => ({
    index: 1, routes: [{ name: "(tabs)", state: { index: 0, routes: [{ name: "chat" }] } }, { name: "vehicle-history/requests/index" }],
  }) } as ReturnType<typeof useNavigation>);
  vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", undefined);
  const view = await renderMobile(<HistoryScreen />);
  await fireEvent.press(view.getByRole("button", { name: "Back" }));
  expect(routerMock.back).toHaveBeenCalled();
  expect(routerMock.dismissTo).not.toHaveBeenCalled();
});
