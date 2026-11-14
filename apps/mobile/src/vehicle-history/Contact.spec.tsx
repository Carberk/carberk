import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import * as SecureStore from "expo-secure-store";
import type * as ReactNative from "react-native";
import { useNavigation } from "expo-router";
import { onlineManager } from "@tanstack/react-query";

import Offer from "../../app/vehicle-history";
import Phone from "../../app/(auth)/phone";
import Otp from "../../app/(auth)/otp";
import History from "../../app/vehicle-history/requests";
import Detail from "../../app/vehicle-history/requests/[id]";
import { queryKeys } from "../api/queryKeys";
import { act, fireEvent, renderMobile, routerMock, routeParams, screenFocus, getHost } from "../../test/render";
import { server } from "../../test/msw";
import { clearAuthSession, storeAuthSession } from "../auth/session";
import { useAuthIntentStore } from "../auth/intentStore";

import { ToastProvider } from "@/components/ui/toast";

vi.mock("react-native", async (original) => {
  const hosts = await original<typeof ReactNative>();
  return { ...hosts, Animated: { View: hosts.View, Value: class { setValue() {} },
    timing: () => ({}), sequence: () => ({ start: () => {} }) } };
});
vi.mock("@react-navigation/native", () => ({ usePreventRemove: () => {}, DefaultTheme: { dark: false, colors: {} }, DarkTheme: { dark: true, colors: {} } }));

vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
const userId = "00000000-0000-4000-8000-000000000001";
const requestId = "10000000-0000-4000-8000-000000000101";
const listingId = "20000000-0000-4000-8000-000000000102";
const session = (sid = "one", id = userId) => ({
  accessToken: `header.${btoa(JSON.stringify({ sid, sub: id }))}.signature`, refreshToken: `refresh-${sid}`,
  user: { id, phone: null, email: "synthetic@example.test", displayName: null, role: "buyer" as const },
});

const enquiry = (sourceListingId: string | null = null) => ({ id: requestId, sourceListingId, createdAt: "2026-11-14T08:00:00.000Z", status: "enquiry", assignedOperator: null });
let stored: string | null;
let bodies: { attemptKey: string; sourceListingId: string | null }[];
beforeEach(async () => {
  vi.mocked(useNavigation).mockReturnValue({ getState: () => undefined } as ReturnType<typeof useNavigation>);
  vi.stubGlobal("__DEV__", false);
  stored = null;
  bodies = [];
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async () => stored);
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async () => { stored = null; });
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (_key, value) => { stored = value; });
  vi.stubEnv("EXPO_PUBLIC_ENV", "development");
  vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", "true");
  useAuthIntentStore.setState({ intent: null, replayAction: null, replayReturnTo: null });
  server.use(http.post("*/vehicle-history/requests", async ({ request }) => {
    const body = await request.json() as typeof bodies[number];
    bodies.push(body);
    return HttpResponse.json(enquiry(body.sourceListingId));
  }));
  await storeAuthSession(session());
});
afterEach(() => { onlineManager.setOnline(true); vi.unstubAllEnvs(); });

it.each([undefined, listingId])("cancels genuine sign-in from %s without creating or losing the caller", async (source) => {
  await clearAuthSession();
  if (source) routeParams.listingId = source;
  const view = await renderMobile(<Offer />);
  await fireEvent.press(await view.findByRole("button", { name: "Sign in to contact operator" }));
  expect(bodies).toEqual([]);
  routeParams.authRoot = "1";
  screenFocus.focused = false;
  await view.rerender(<><Offer /><Phone /></>);
  await fireEvent.press(view.getByRole("button", { name: "Close" }));
  expect(routerMock.dismissTo).toHaveBeenCalledWith({ pathname: "/vehicle-history", params: source ? { listingId: source } : {} });
  screenFocus.focused = true;
  await view.rerender(<Offer />);
  await act(() => storeAuthSession(session("unrelated")));
  expect(bodies).toEqual([]);
  expect(useAuthIntentStore.getState().replayAction).toBeNull();
});

const journey = (stage = 0) => <ToastProvider><Offer />{stage > 0 && <Phone />}{stage > 1 && <Otp />}</ToastProvider>;

it.each([undefined, listingId])("replays genuine successful contact auth from %s only once", async (source) => {
  await clearAuthSession();
  if (source) routeParams.listingId = source;
  server.use(http.post("*/auth/otp/request", () => HttpResponse.json({ requestId, resendInSeconds: 60 })),
    http.post("*/auth/otp/verify", () => HttpResponse.json(session())));
  const view = await renderMobile(journey());
  await fireEvent.press(await view.findByRole("button", { name: "Sign in to contact operator" }));
  routeParams.authRoot = "1";
  screenFocus.focused = false;
  await view.rerender(journey(1));
  await fireEvent.changeText(view.getByLabelText("Phone number"), "61000009");
  await fireEvent.press(view.getByRole("button", { name: "Get code" }));
  routeParams.method = "phone";
  routeParams.destination = "+99361000009";
  routeParams.resendInSeconds = "60";
  await view.rerender(journey(2));
  await fireEvent.changeText(getHost(view.container, "TextInput", { textContentType: "oneTimeCode" }), "123456");
  await vi.waitFor(() => expect(useAuthIntentStore.getState().replayAction?.kind).toBe("history"));
  expect(bodies).toEqual([]);
  screenFocus.focused = true;
  await view.rerender(journey());
  await vi.waitFor(() => expect(bodies).toHaveLength(1));
  await view.rerender(journey());
  expect(bodies[0]?.sourceListingId).toBe(source ?? null);
  expect(useAuthIntentStore.getState().replayAction).toBeNull();
});
it.each([undefined, listingId])("contacts History with optional Listing %s and opens a real empty enquiry", async (source) => {
  if (source) routeParams.listingId = source;
  const view = await renderMobile(<Offer />);
  await fireEvent.press(await view.findByRole("button", { name: "Contact operator" }));
  await vi.waitFor(() => expect(routerMock.push).toHaveBeenCalledWith({ pathname: "/vehicle-history/requests/[id]", params: { id: requestId } }));
  expect(bodies).toEqual([{ attemptKey: expect.stringMatching(/^[a-f0-9-]{36}$/), sourceListingId: source ?? null }]);
  expect(view.queryClient.getQueryData(["conversations"])).toBeUndefined();
});

it.each(["account", "session", "context", "focus", "dispose"])("ignores delayed create/cache/navigation after %s changes", async (change) => {
  const response = deferred<Response>();
  const sent = deferred<undefined>();
  server.use(http.post("*/vehicle-history/requests", () => { sent.resolve(undefined); return response.promise; }));
  const view = await renderMobile(<Offer />);
  await fireEvent.press(await view.findByRole("button", { name: "Contact operator" }));
  await sent.promise;
  if (change === "account" || change === "session") await act(() => storeAuthSession(session("two", change === "account" ? listingId : userId)));
  if (change === "context") { routeParams.listingId = listingId; await view.rerender(<Offer />); }
  if (change === "focus") { screenFocus.focused = false; await view.rerender(<Offer />); }
  if (change === "dispose") await view.unmount();
  await act(() => response.resolve(HttpResponse.json(enquiry())));
  expect(routerMock.push).not.toHaveBeenCalled();
  expect(view.queryClient.getQueryData(detailKey())).toBeUndefined();
});

it.each([false, true])("never replays an anonymous intent in a later account/session (same account=%s)", async (sameAccount) => {
  await clearAuthSession();
  const view = await renderMobile(<Offer />);
  await fireEvent.press(await view.findByRole("button", { name: "Sign in to contact operator" }));
  screenFocus.focused = false;
  await view.rerender(<Offer />);
  await act(async () => {
    await storeAuthSession(session());
    useAuthIntentStore.getState().completeSignIn(routerMock);
    await storeAuthSession(session("two", sameAccount ? userId : listingId));
  });
  screenFocus.focused = true;
  await view.rerender(<Offer />);
  expect(bodies).toEqual([]);
  expect(useAuthIntentStore.getState().replayAction).toBeNull();
});

it("keeps stale contact callbacks from starting work after session change or disposal", async () => {
  const view = await renderMobile(<Offer />);
  const button = await view.findByRole("button", { name: "Contact operator" });
  const stale = button.props.onPress as () => void;
  await act(() => storeAuthSession(session("two")));
  await act(stale);
  await view.unmount();
  await act(stale);
  expect(bodies).toEqual([]);
});

it("coalesces anonymous double taps and drops replaced actions and their stale callbacks", async () => {
  await clearAuthSession();
  const view = await renderMobile(<Offer />);
  const button = await view.findByRole("button", { name: "Sign in to contact operator" });
  const stale = button.props.onPress as () => void;
  await act(() => { stale(); stale(); });
  expect(routerMock.push).toHaveBeenCalledTimes(1);
  await act(() => useAuthIntentStore.getState().requireSignIn(routerMock, {
    returnTo: "/(tabs)/favorites", action: { kind: "favorite", listingId },
  }));
  await act(() => storeAuthSession(session("two")));
  await act(stale);
  expect(useAuthIntentStore.getState().intent?.action?.kind).toBe("favorite");
  expect(bodies).toEqual([]);
});

it("waits for storage hydration before allowing a contact action", async () => {
  const hydration = deferred<string | null>();
  vi.mocked(SecureStore.getItemAsync).mockReturnValue(hydration.promise);
  const view = await renderMobile(<Offer />);
  expect(view.getByRole("button", { name: "Sign in to contact operator", disabled: true })).toBeTruthy();
  await act(() => hydration.resolve(stored));
  await fireEvent.press(await view.findByRole("button", { name: "Contact operator", disabled: false }));
  await vi.waitFor(() => expect(bodies).toHaveLength(1));
});

it("fences an old create retry after delayed token refresh and same-account session replacement", async () => {
  const refresh = deferred<Response>();
  const refreshing = deferred<undefined>();
  server.use(http.post("*/vehicle-history/requests", async ({ request }) => {
    bodies.push(await request.json() as typeof bodies[number]);
    return HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }), http.post("*/auth/refresh", () => { refreshing.resolve(undefined); return refresh.promise; }));
  const view = await renderMobile(<Offer />);
  await fireEvent.press(await view.findByRole("button", { name: "Contact operator" }));
  await refreshing.promise;
  await act(() => storeAuthSession(session("two")));
  await act(() => refresh.resolve(HttpResponse.json({ accessToken: session().accessToken, refreshToken: "rotated" })));
  expect(bodies).toHaveLength(1);
  expect(view.queryClient.getQueryData(detailKey())).toBeUndefined();
  expect(routerMock.push).not.toHaveBeenCalled();
});

it("retains the attempt across focus loss and ignores its older response after a new retry", async () => {
  const response = deferred<Response>();
  server.use(http.post("*/vehicle-history/requests", async ({ request }) => {
    bodies.push(await request.json() as typeof bodies[number]);
    return bodies.length === 1 ? response.promise : HttpResponse.json(enquiry());
  }));
  const view = await renderMobile(<Offer />);
  await fireEvent.press(await view.findByRole("button", { name: "Contact operator" }));
  await vi.waitFor(() => expect(bodies).toHaveLength(1));
  screenFocus.focused = false;
  await view.rerender(<Offer />);
  screenFocus.focused = true;
  await view.rerender(<Offer />);
  await fireEvent.press(view.getByRole("button", { name: "Contact operator" }));
  await vi.waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
  await act(() => response.resolve(HttpResponse.json({ ...enquiry(), id: listingId })));
  expect(bodies[1]).toEqual(bodies[0]);
  expect(routerMock.push).toHaveBeenCalledTimes(1);
  expect(view.queryClient.getQueryData(queryKeys.vehicleHistory.detail(userId, "one", listingId))).toBeUndefined();
});

it("retries create with the same key when refresh rotates tokens within the same session", async () => {
  const rotated = { ...session(), accessToken: `header.${btoa(JSON.stringify({ sid: "one", sub: userId, rotated: true }))}.signature` };
  server.use(http.post("*/vehicle-history/requests", async ({ request }) => {
    bodies.push(await request.json() as typeof bodies[number]);
    return request.headers.get("Authorization") === `Bearer ${rotated.accessToken}` ? HttpResponse.json(enquiry())
      : HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }), http.post("*/auth/refresh", () => HttpResponse.json({ accessToken: rotated.accessToken, refreshToken: "rotated" })));
  const view = await renderMobile(<Offer />);
  await fireEvent.press(await view.findByRole("button", { name: "Contact operator" }));
  await vi.waitFor(() => expect(routerMock.push).toHaveBeenCalledTimes(1));
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(view.queryClient.getQueryData(detailKey())).toEqual(enquiry());
});

it.each([
  ["en", "Contact operator", "Could not open request", "No connection", "Retry", "New request"],
  ["ru", "Связаться с оператором", "Не удалось открыть обращение", "Нет подключения", "Повторить", "Новое обращение"],
  ["tk", "Operator bilen habarlaşmak", "Ýüz tutmany açyp bolmady", "Baglanyşyk ýok", "Täzeden synanyş", "Täze ýüz tutma"],
])("localizes create, error/offline/Retry and New request in %s", async (locale, contact, failed, offline, retry, fresh) => {
  server.use(http.post("*/vehicle-history/requests", () => HttpResponse.json({ code: "UNAVAILABLE" }, { status: 503 })));
  const view = await renderMobile(<Offer />, { locale });
  await fireEvent.press(await view.findByRole("button", { name: contact }));
  expect(await view.findByText(failed ?? "")).toBeTruthy();
  onlineManager.setOnline(false);
  await fireEvent.press(await view.findByRole("button", { name: retry }));
  expect(await view.findByText(offline ?? "")).toBeTruthy();
  expect(view.getByRole("button", { name: fresh })).toBeTruthy();
});

it.each([403, 200])("does not invent success for refusal/malformed create (%s)", async (status) => {
  server.use(http.post("*/vehicle-history/requests", () => HttpResponse.json(status === 403 ? { code: "FORBIDDEN" }
    : { ...enquiry(), assignedOperator: { name: "Invented" } }, { status })));
  const view = await renderMobile(<Offer />);
  await fireEvent.press(await view.findByRole("button", { name: "Contact operator" }));
  expect(await view.findByText(status === 403 ? "This session cannot open a request. Go back or sign in through Account." : "Could not open request")).toBeTruthy();
  expect(view.queryClient.getQueryData(detailKey())).toBeUndefined();
  expect(routerMock.push).not.toHaveBeenCalled();
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const detailKey = () => queryKeys.vehicleHistory.detail(userId, "one", requestId);

it("keeps double taps and lost-response Retry on one attempt; only explicit New request changes it", async () => {
  const response = deferred<Response>();
  server.use(http.post("*/vehicle-history/requests", async ({ request }) => {
    bodies.push(await request.json() as typeof bodies[number]);
    return bodies.length === 1 ? response.promise : HttpResponse.json(enquiry());
  }));
  const view = await renderMobile(<Offer />);
  const button = await view.findByRole("button", { name: "Contact operator" });
  await act(() => { void fireEvent.press(button); void fireEvent.press(button); });
  expect(await view.findByRole("button", { name: "Opening request…", disabled: true })).toBeTruthy();
  await vi.waitFor(() => expect(bodies).toHaveLength(1));
  await act(() => response.resolve(HttpResponse.error()));
  await fireEvent.press(await view.findByRole("button", { name: "Retry" }));
  await vi.waitFor(() => expect(bodies).toHaveLength(2));
  expect(bodies[1]).toEqual(bodies[0]);
  await fireEvent.press(await view.findByRole("button", { name: "New request" }));
  await vi.waitFor(() => expect(bodies).toHaveLength(3));
  expect(bodies[2]?.attemptKey).not.toBe(bodies[0]?.attemptKey);
});

it("creates from history and reopens through real detail/list GETs without another POST", async () => {
  server.use(http.get("*/vehicle-history/requests", () => HttpResponse.json({ items: bodies.length ? [enquiry()] : [], nextCursor: null })),
    http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry())));
  const view = await renderMobile(<History />);
  await fireEvent.press(await view.findByRole("button", { name: "New request" }));
  await vi.waitFor(() => expect(routerMock.push).toHaveBeenCalled());
  routeParams.id = requestId;
  await view.rerender(<Detail />);
  expect(await view.findByText("Awaiting operator")).toBeTruthy();
  await fireEvent.press(view.getByRole("button", { name: "Back to requests" }));
  await view.rerender(<History />);
  await fireEvent.press(await view.findByRole("button", { name: "Open request 10000000" }));
  await view.rerender(<Detail />);
  expect(await view.findByText("Request 10000000")).toBeTruthy();
  expect(bodies).toHaveLength(1);
});

it("labels offer-to-created-detail Back truthfully and retains its native parent", async () => {
  const dispatch = vi.fn();
  vi.mocked(useNavigation).mockReturnValue({ dispatch, getState: () => ({ index: 2,
    routes: [{ name: "(tabs)" }, { name: "vehicle-history/index" }, { name: "vehicle-history/requests/[id]" }],
  }) } as ReturnType<typeof useNavigation>);
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry(listingId))));
  routeParams.id = requestId;
  const view = await renderMobile(<Detail />);
  await fireEvent.press(await view.findByRole("button", { name: "Back to offer" }));
  expect(routerMock.back).toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});
