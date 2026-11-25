import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { AccessibilityInfo } from "react-native";
import { useNavigation } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { onlineManager } from "@tanstack/react-query";

import ChatScreen from "../../app/(tabs)/chat";
import RequestScreen from "../../app/vehicle-history/requests/[id]";
import { queryKeys } from "../api/queryKeys";
import HistoryScreen from "../../app/vehicle-history/requests";
import { act, fireEvent, getHost, renderMobile, routerMock, routeParams } from "../../test/render";
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
const successor = { id: "30000000-0000-4000-8000-000000000103", displayName: "Murat", nameNumber: 1214 };
let stored: string | null;
beforeEach(async () => {
  vi.mocked(useNavigation).mockReturnValue({ getState: () => undefined } as ReturnType<typeof useNavigation>);
  stored = null;
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async () => stored);
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async () => { stored = null; });
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (_key, value) => { stored = value; });
  vi.stubEnv("EXPO_PUBLIC_ENV", "development");
  vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", "true");
  server.use(
    http.get("*/vehicle-history/requests/:id/reminder", () => HttpResponse.json({ reason: null, since: null, version: 0,
      eligibleAt: null, eligible: false, ineligibleReason: "not_waiting", declined: false, stopped: false, used: false, outcome: null })),http.get("*/catalog/brands", () => HttpResponse.json({ items: [], nextCursor: null, hasMore: false })));
  server.use(
    http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ items: [], nextCursor: null })),
    http.get("*/vehicle-history/requests/:id/receipts", () => HttpResponse.json({ items: [] })),
    http.get("*/vehicle-history/requests/:id/previous-purchase", () => HttpResponse.json({ previous: null })),
  );
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
it.each([
  ["en", "Your operator changed to Murat."],
  ["ru", "Ваш оператор сменился: Murat."],
  ["tk", "Jogapkär işgäriňiz üýtgedi: Murat."],
] as const)("shows the named operator change while retaining the customer's enquiry in %s", async (locale, notice) => {
  routeParams.id = requestId;
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ ...enquiry(), assignmentVersion: 2,
    assignedOperator: successor })));
  const view = await renderMobile(<RequestScreen />, { locale });
  expect(await view.findByText(notice)).toBeTruthy();
  expect(view.getByText(/10000000/)).toBeTruthy();
});
it("updates the same customer's header after a real pull refresh observes handover", async () => {
  routeParams.id = requestId;
  let current = { ...enquiry(), assignmentVersion: 1,
    assignedOperator: { ...successor, id: secondId, displayName: "Ayna" } };
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(current)));
  const view = await renderMobile(<RequestScreen />, { locale: "en" });
  await view.findByText("Operator: Ayna");
  const list = getHost(view.container, "RCTScrollView");
  current = { ...current, assignmentVersion: 2, assignedOperator: successor };
  await act(() => list.props.refreshControl.props.onRefresh());
  expect(await view.findByText("Your operator changed to Murat.")).toBeTruthy();
  expect(view.getByText(/10000000/)).toBeTruthy();
});

afterEach(() => { onlineManager.setOnline(true); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
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


it.each([
  [false, ["(tabs)", "vehicle-history/requests/index"]],
  [true, ["(tabs)", "vehicle-history/requests/index", "vehicle-history/requests/[id]"]],
] as const)("gives native Back the cold-link destinations (detail=%s)", async (detail, names) => {
  const dispatch = vi.fn();
  vi.mocked(useNavigation).mockReturnValue({ dispatch, getState: () => ({
    index: 1, routes: [{ name: "(tabs)" }, { name: detail ? "vehicle-history/requests/[id]" : "vehicle-history/requests/index" }],
  }) } as ReturnType<typeof useNavigation>);
  routeParams.id = requestId;
  vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", undefined);
  await renderMobile(detail ? <RequestScreen /> : <HistoryScreen />);
  expect(dispatch).toHaveBeenCalled();
  expect(dispatch.mock.calls[0]?.[0].type).toBe("RESET");
  const result = dispatch.mock.calls[0]?.[0].payload;
  expect(result.routes.map((route: { name: string }) => route.name)).toEqual(names);
  expect(result.routes[0].state.routes).toEqual([{ name: "chat" }]);
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

it.each(["(tabs)", "vehicle-history/requests/index"])("leaves %s navigation alone when an older detail is behind it", async (name) => {
  const dispatch = vi.fn();
  vi.mocked(useNavigation).mockReturnValue({ dispatch, getState: () => ({
    index: 1, routes: [{ name: "(tabs)" }, { name }],
  }) } as ReturnType<typeof useNavigation>);
  vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", undefined);
  await renderMobile(<RequestScreen />);
  expect(dispatch).not.toHaveBeenCalled();
});

it.each([
  ["en", "pdf", "PDF only"], ["ru", "link", "Только ссылка провайдера"], ["tk", "both", "PDF we üpjün edijiniň salgysy"],
] as const)("shows the persisted %s proposal before any acceptance, preserving the original dates and explicit %s format", async (locale, format, label) => {
  routeParams.id = requestId;
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry())),
    http.get("*/vehicle-history/requests/:id/offer", () => HttpResponse.json({ version: 2, vin: "DEMA0000000000001", synthetic: true,
      preflight: { status: "available", providers: [{ name: "Carfax", originalReportDate: "2026-10-14" }] },
      proposal: { format, priceTmt: 100, providerRule: "either_available_both_when_obtainable", terms: "service_failure_review",
        deliveryFrom: "2026-11-21T06:00:00.000Z", deliveryBy: "2026-11-21T07:00:00.000Z" } })));
  const view = await renderMobile(<RequestScreen />, { locale });
  expect(await view.findByText(/VIN: DEMA0000000000001/)).toBeTruthy();
  expect(view.getByText(new RegExp(label))).toBeTruthy();
  expect(view.getByText(/2026-10-14/)).toBeTruthy();
  expect(view.getAllByText(/100 TMT/).length).toBeGreaterThan(0);
  expect(view.queryByText(/SYNTHETIC-/)).toBeNull();
});
it("submits the exact VIN for review through the real client and rereads the cleared proposal", async () => {
  routeParams.id = requestId;
  let offer = { version: 0, vin: null as string | null, synthetic: true, preflight: null, proposal: null };
  let submitted: unknown;
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry())),
    http.get("*/vehicle-history/requests/:id/offer", () => HttpResponse.json(offer)),
    http.post("*/vehicle-history/requests/:id/offer", async ({ request }) => {
      submitted = await request.json(); offer = { ...offer, version: 1, vin: "DEMA0000000000001" };
      return HttpResponse.json(offer);
    }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.changeText(await view.findByLabelText("VIN"), " dema 0000000000001 ");
  await fireEvent.press(view.getByRole("button", { name: "Send VIN for review" }));
  await view.findByText("VIN: DEMA0000000000001");
  expect(submitted).toEqual({ kind: "vin", vin: " dema 0000000000001 ", expectedVersion: 0 });
  expect(view.getByText("Awaiting an operator availability check.")).toBeTruthy();
});

it.each([
  ["en", "VIN", "Send VIN for review", "Open previous report · free", "New request · 100 TMT"],
  ["ru", "VIN", "Отправить VIN на проверку", "Открыть прежний отчёт · бесплатно", "Новый запрос · 100 TMT"],
  ["tk", "VIN", "VIN-i barlawa iber", "Öňki hasabaty açmak · mugt", "Täze ýüz tutma · 100 TMT"],
] as const)("offers free reopening and separate new-request consent for a repeat VIN in %s", async (locale, label, send, open, proceed) => {
  const announce = vi.spyOn(AccessibilityInfo, "announceForAccessibility");
  routeParams.id = requestId;
  const vin = "DEMA0000000000001";
  let offer = { version: 0, vin: null as string | null, synthetic: true, preflight: null, proposal: null };
  let submitted: unknown;
  let refreshing = false;
  const started = deferred<undefined>(), refreshed = deferred<Response>();
  const lookupStarted = deferred<undefined>(), lookupFinished = deferred<Response>();
  const purchase = { previous: { requestId: secondId, vin, provider: "Carfax", format: "pdf", originalReportDate: "2026-10-14" } };
  server.use(
    http.get("*/vehicle-history/requests/:id", () => {
      if (!refreshing) return HttpResponse.json(enquiry());
      started.resolve(undefined);
      return refreshed.promise;
    }),
    http.get("*/vehicle-history/requests/:id/offer", () => HttpResponse.json(offer)),
    http.get("*/vehicle-history/requests/:id/previous-purchase", () => {
      if (locale !== "en") return HttpResponse.json(purchase);
      lookupStarted.resolve(undefined);
      return lookupFinished.promise;
    }),
    http.post("*/vehicle-history/requests/:id/offer", async ({ request }) => {
      submitted = await request.json();
      offer = { ...offer, version: 1, vin };
      return HttpResponse.json(offer);
    }));
  const view = await renderMobile(<RequestScreen />, { locale });
  await fireEvent.changeText(await view.findByLabelText(label), vin);
  await fireEvent.press(view.getByRole("button", { name: send }));
  if (locale === "en") {
    await lookupStarted.promise;
    refreshing = true;
    await act(async () => {
      void getHost(view.container, "RCTScrollView").props.refreshControl.props.onRefresh();
      await started.promise;
    });
    await act(() => lookupFinished.resolve(HttpResponse.json(purchase)));
    expect(await view.findByRole("button", { name: open })).toBeDisabled();
    refreshing = false;
    await act(() => refreshed.resolve(HttpResponse.json(enquiry())));
    await vi.waitFor(() => expect(view.getByRole("button", { name: open })).not.toBeDisabled());
  }
  await fireEvent.press(await view.findByRole("button", { name: open }));
  expect(announce).toHaveBeenCalledWith({
    en: "You already bought a report for this VIN.",
    ru: "Вы уже покупали отчёт для этого VIN.",
    tk: "Bu VIN üçin öň hasabat satyn aldyňyz.",
  }[locale]);
  expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/vehicle-history/requests/[id]", params: { id: secondId } });
  expect(submitted).toBeUndefined();
  await fireEvent.press(view.getByRole("button", { name: proceed }));
  await view.findByText("VIN: DEMA0000000000001");
  expect(submitted).toEqual({ kind: "vin", vin, expectedVersion: 0 });
});

it("keeps the saved quote visible during a request refresh and removes it on denial", async () => {
  routeParams.id = requestId;
  const pending = deferred<Response>();
  const started = deferred<undefined>();
  let holdRefresh = false;
  server.use(http.get("*/vehicle-history/requests/:id", () => {
    if (!holdRefresh) return HttpResponse.json(enquiry());
    started.resolve(undefined);
    return pending.promise;
  }), http.get("*/vehicle-history/requests/:id/offer", () => HttpResponse.json({
    version: 2, vin: "DEMA0000000000001", synthetic: true,
    preflight: { status: "available", providers: [{ name: "Carfax", originalReportDate: "2026-10-14" }] },
    proposal: { format: "pdf", priceTmt: 100, providerRule: "either_available_both_when_obtainable",
      terms: "service_failure_review", deliveryFrom: "2026-11-21T06:00:00Z", deliveryBy: "2026-11-21T07:00:00Z" },
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("Offer preview · 100 TMT");
  await fireEvent.changeText(view.getByLabelText("VIN"), "DEMA0000000000006");
  await vi.waitFor(() => expect(view.getByRole("button", { name: "Send VIN for review" })).not.toBeDisabled());
  holdRefresh = true;
  await act(async () => {
    void getHost(view.container, "RCTScrollView").props.refreshControl.props.onRefresh();
    await started.promise;
  });
  expect(view.queryByText("Offer preview · 100 TMT")).toBeTruthy();
  expect(view.getByRole("button", { name: "Send VIN for review" })).toBeDisabled();
  await act(() => pending.resolve(HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 })));
  expect(await view.findByText("This request is unavailable for this session. Go back to your requests.")).toBeTruthy();
  expect(view.queryByText("Offer preview · 100 TMT")).toBeNull();
});

it.each([
  ["malformed", "Use 17 Latin letters"], ["unsupported", "This vehicle, product or market"], ["no_history", "No history was found"],
  ["mismatch", "Vehicle details do not match"], ["outage", "The provider check is temporarily unavailable"],
])("renders %s separately with recovery and no quote", async (status, copy) => {
  routeParams.id = requestId;
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry())),
    http.get("*/vehicle-history/requests/:id/offer", () => HttpResponse.json({ version: 1, vin: "DEMA0000000000001", synthetic: true,
      preflight: { status }, proposal: null })));
  const view = await renderMobile(<RequestScreen />);
  expect(await view.findByText(new RegExp(copy))).toBeTruthy();
  expect(view.queryByText("Offer preview · 100 TMT")).toBeNull();
});

it("discards a delayed proposal after the viewer signs out", async () => {
  routeParams.id = requestId;
  const response = deferred<null>();
  let started = false;
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry())),
    http.get("*/vehicle-history/requests/:id/offer", async () => {
      started = true; await response.promise;
      return HttpResponse.json({ version: 1, vin: "DEMA0000000000001", synthetic: true, preflight: null, proposal: null });
    }));
  const view = await renderMobile(<RequestScreen />);
  await vi.waitFor(() => expect(started).toBe(true));
  await act(() => clearAuthSession());
  await act(() => response.resolve(null));
  expect(view.queryByText("VIN: DEMA0000000000001")).toBeNull();
  expect(view.queryByRole("button", { name: "Send VIN for review" })).toBeNull();
});
it("hides failed proposal reads and offers an explicit refresh", async () => {
  routeParams.id = requestId;
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry())),
    http.get("*/vehicle-history/requests/:id/offer", () => HttpResponse.json({}, { status: 503 })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("Could not update the offer. Refresh its current state before trying again.");
  expect(view.getByRole("button", { name: "Refresh offer" })).toBeTruthy();
  expect(view.queryByText("Offer preview · 100 TMT")).toBeNull();
});
