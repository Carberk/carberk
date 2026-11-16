import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { AccessibilityInfo, AppState, Linking } from "react-native";
import * as ReactNative from "react-native";
import * as ExpoLinking from "expo-linking";
import * as Clipboard from "expo-clipboard";

import RequestScreen from "../../app/vehicle-history/requests/[id]";
import { act, fireEvent, getHost, renderMobile, routeParams, screenFocus } from "../../test/render";
import { server } from "../../test/msw";
import { NativeViewability } from "../../test/native-viewability";
import { storeAuthSession } from "../auth/session";

const nativeClipboard = vi.hoisted(() => ({
  setStringAsync: vi.fn<(text: string, options: object) => Promise<boolean>>(),
}));

vi.unmock("expo-linking");
vi.unmock("expo-clipboard");
vi.mock("react-native", async (importOriginal) => ({
  ...await importOriginal<typeof ReactNative>(),
  Linking: { openURL: vi.fn(async () => true) },
}));
vi.mock("expo-modules-core", async () => {
  const native = await import("react-native");
  return {
    UnavailabilityError: Error,
    requireNativeModule: (name: string) => name === "ExpoClipboard" ? nativeClipboard : {},
    requireNativeViewManager: () => native.View,
    Platform: native.Platform,
  };
});
vi.mock("expo-constants", () => ({ default: {}, ExecutionEnvironment: {} }));

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
  vi.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  vi.mocked(AsyncStorage.setItem).mockResolvedValue();
  vi.mocked(AsyncStorage.removeItem).mockResolvedValue();
  stored = null;
  acknowledgements = [];
  vi.mocked(Linking.openURL).mockReset().mockResolvedValue(true);
  nativeClipboard.setStringAsync.mockReset().mockResolvedValue(true);
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async () => stored);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (_key, value) => { stored = value; });
  vi.stubEnv("EXPO_PUBLIC_ENV", "development");
  vi.stubEnv("EXPO_PUBLIC_VEHICLE_HISTORY_SYNTHETIC", "true");
  focusManager.setFocused(true);
  routeParams.id = requestId;
  server.use(
    http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry)),
    http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ items: [message()], nextCursor: null })),
    http.get("*/vehicle-history/requests/:id/reminder", () => HttpResponse.json(reminder())),
    http.get("*/vehicle-history/requests/:id/receipts", () => HttpResponse.json({ items: [] })),
    http.post("*/vehicle-history/requests/:id/receipts", async ({ request }) => {
      acknowledgements.push(await request.json() as { cursor: string; kind: string });
      return HttpResponse.json({ participantId: userId, assignmentVersion: 0, receivedOrder: "2", readOrder: "0" });
    }),
  );
  await storeAuthSession(session());
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); focusManager.setFocused(true); onlineManager.setOnline(true); vi.unstubAllEnvs(); });

it("opens the exact report target in the external browser", async () => {
  const target = "https://reports.example.test/report?token=A%2fb%2B&part=1&part=2";
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text: target }], nextCursor: null,
  })));
  expect(vi.isMockFunction(ExpoLinking.openURL)).toBe(false);
  const view = await renderMobile(<RequestScreen />);
  await view.findByText(target);
  await fireEvent.press(view.getByRole("button", { name: "Open report" }));
  expect(Linking.openURL).toHaveBeenCalledWith("https://reports.example.test/report?token=A%2fb%2B&part=1&part=2");
});

it("restores the report action position after a focused external-browser return resizes the reader", async () => {
  const target = "https://reports.example.test/report?token=A%2fb%2B&part=1&part=2";
  const requests = (ReactNative as unknown as { scrollRequests: unknown[] }).scrollRequests;
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text: target }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText(target);
  const list = getHost(view.container, "RCTScrollView");
  const input = view.getByLabelText("Your message");
  await fireEvent.changeText(input, "Keep this focused unsent question");
  await fireEvent(list, "layout", { nativeEvent: { layout: { width: 390, height: 180 } } });
  await fireEvent.scroll(list, { nativeEvent: { contentOffset: { x: 0, y: 800 } } });
  requests.length = 0;
  await fireEvent.press(view.getByRole("button", { name: "Open report" }));
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://reports.example.test/report?token=A%2fb%2B&part=1&part=2");
  await act(() => { AppState.currentState = "background"; focusManager.setFocused(false); });
  await fireEvent(list, "layout", { nativeEvent: { layout: { width: 390, height: 480 } } });
  await fireEvent.scroll(list, { nativeEvent: { contentOffset: { x: 0, y: 500 } } });
  await act(() => { AppState.currentState = "active"; focusManager.setFocused(true); });
  expect(requests).toEqual([]);
  await fireEvent(list, "layout", { nativeEvent: { layout: { width: 390, height: 180 } } });
  expect(requests).toEqual([{ method: "scrollToOffset", offset: 800, animated: false }]);
  expect(getHost(view.container, "RCTScrollView")).toBe(list);
  expect(view.getByLabelText("Your message")).toBe(input);
  expect(view.getByDisplayValue("Keep this focused unsent question")).toBeTruthy();
  expect(view.getByRole("button", { name: "Open report" })).toBeEnabled();
  await fireEvent(list, "layout", { nativeEvent: { layout: { width: 390, height: 180 } } });
  expect(requests).toHaveLength(1);
});

it.each(["Copy link", "failed Open", "user scroll"])("does not restore an old report position after %s", async (action) => {
  const requests = (ReactNative as unknown as { scrollRequests: unknown[] }).scrollRequests;
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text: "https://reports.example.test/a" }], nextCursor: null,
  })));
  if (action === "failed Open") vi.mocked(Linking.openURL).mockResolvedValueOnce(false);
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("https://reports.example.test/a");
  const list = getHost(view.container, "RCTScrollView");
  await fireEvent(list, "layout", { nativeEvent: { layout: { width: 390, height: 480 } } });
  await fireEvent.scroll(list, { nativeEvent: { contentOffset: { x: 0, y: 800 } } });
  requests.length = 0;
  await fireEvent.press(view.getByRole("button", { name: action === "Copy link" ? "Copy link" : "Open report" }));
  if (action === "user scroll") await fireEvent(list, "scrollBeginDrag");
  await act(() => { AppState.currentState = "background"; focusManager.setFocused(false); });
  await fireEvent.scroll(list, { nativeEvent: { contentOffset: { x: 0, y: 500 } } });
  await act(() => { AppState.currentState = "active"; focusManager.setFocused(true); });
  await fireEvent(list, "layout", { nativeEvent: { layout: { width: 390, height: 480 } } });
  expect(requests).toEqual([]);
});

it("copies the complete report link and confirms only after clipboard success", async () => {
  const target = "https://reports.example.test/report?token=A%2fb%2B&part=1&part=2";
  const copied = deferred<boolean>();
  const sentMessages: unknown[] = [];
  nativeClipboard.setStringAsync.mockReset().mockReturnValueOnce(copied.promise);
  vi.mocked(Linking.openURL).mockClear();
  server.use(
    http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
      items: [{ ...message(), text: target }], nextCursor: null,
    })),
    http.post("*/vehicle-history/requests/:id/messages", async ({ request }) => {
      sentMessages.push(await request.json());
      return HttpResponse.error();
    }),
  );
  expect(vi.isMockFunction(Clipboard.setStringAsync)).toBe(false);
  const view = await renderMobile(<RequestScreen />);
  await view.findByText(target);
  await fireEvent.changeText(view.getByLabelText("Your message"), "Keep my question");
  expect(view.queryByText("Link copied")).toBeNull();
  await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Copy link" })); });
  await vi.waitFor(() => expect(nativeClipboard.setStringAsync).toHaveBeenCalledWith(
    "https://reports.example.test/report?token=A%2fb%2B&part=1&part=2", {},
  ));
  expect(view.queryByText("Link copied")).toBeNull();
  await act(() => copied.resolve(true));
  expect(await view.findByText("Link copied")).toBeTruthy();
  expect(view.getByDisplayValue("Keep my question")).toBeTruthy();
  expect(Linking.openURL).not.toHaveBeenCalled();
  expect(sentMessages).toEqual([]);
});

it.each(["reject", "false"] as const)("keeps the link and draft available after clipboard %s, then explicitly retries", async (failure) => {
  const target = "https://reports.example.test/report?token=A%2fb%2B&part=1&part=2";
  nativeClipboard.setStringAsync.mockReset();
  if (failure === "reject") nativeClipboard.setStringAsync.mockRejectedValueOnce(new Error("Synthetic clipboard failure"));
  else nativeClipboard.setStringAsync.mockResolvedValueOnce(false);
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text: target }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText(target);
  await fireEvent.changeText(view.getByLabelText("Your message"), "Keep my question");
  await fireEvent.press(view.getByRole("button", { name: "Copy link" }));
  expect(await view.findByText("Could not copy the link. Try again, or select and copy the address.")).toBeTruthy();
  expect(view.queryByText("Link copied")).toBeNull();
  expect(view.getByDisplayValue("Keep my question")).toBeTruthy();
  expect(view.getByText(target)).toBeTruthy();
  nativeClipboard.setStringAsync.mockResolvedValueOnce(true);
  await fireEvent.press(view.getByRole("button", { name: "Retry copy link" }));
  expect(await view.findByText("Link copied")).toBeTruthy();
  expect(nativeClipboard.setStringAsync).toHaveBeenLastCalledWith(
    "https://reports.example.test/report?token=A%2fb%2B&part=1&part=2", {},
  );
});

it("discards clipboard feedback from before leaving and returning to the reader", async () => {
  const target = "https://reports.example.test/report?token=A%2fb%2B&part=1&part=2";
  const copied = deferred<boolean>();
  nativeClipboard.setStringAsync.mockReset().mockReturnValueOnce(copied.promise);
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text: target }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText(target);
  await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Copy link" })); });
  await vi.waitFor(() => expect(nativeClipboard.setStringAsync).toHaveBeenCalledWith(target, {}));
  screenFocus.focused = false;
  await view.rerender(<RequestScreen />);
  screenFocus.focused = true;
  await view.rerender(<RequestScreen />);
  await view.findByText(target);
  await act(() => copied.resolve(true));
  expect(view.queryByText("Link copied")).toBeNull();
  nativeClipboard.setStringAsync.mockResolvedValueOnce(true);
  await fireEvent.press(view.getByRole("button", { name: "Copy link" }));
  expect(await view.findByText("Link copied")).toBeTruthy();
});

it.each(["account", "session", "request", "assignment"] as const)("does not carry pending clipboard feedback into a new %s reader", async (change) => {
  const target = "https://reports.example.test/report?token=A%2fb%2B&part=1&part=2";
  const copied = deferred<boolean>();
  let currentRequest = enquiry;
  nativeClipboard.setStringAsync.mockReset().mockReturnValueOnce(copied.promise);
  server.use(
    http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(currentRequest)),
    http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
      items: [{ ...message(), text: target }], nextCursor: null,
    })),
  );
  const view = await renderMobile(<RequestScreen />);
  await view.findByText(target);
  await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Copy link" })); });
  await vi.waitFor(() => expect(nativeClipboard.setStringAsync).toHaveBeenCalledWith(target, {}));
  if (change === "account" || change === "session") {
    await act(() => storeAuthSession(session("session-two", change === "account" ? operatorId : userId)));
  } else if (change === "request") {
    routeParams.id = nextId;
    currentRequest = { ...enquiry, id: nextId };
    await view.rerender(<RequestScreen />);
  } else {
    currentRequest = { ...enquiry, assignmentVersion: 2 };
    await act(() => view.queryClient.invalidateQueries({
      queryKey: ["vehicle-history", userId, "session-one", "requests", requestId], exact: true,
    }));
  }
  await view.findByText(target);
  await act(() => copied.resolve(true));
  expect(view.queryByText("Link copied")).toBeNull();
  expect(view.queryByText("Could not copy the link. Try again, or select and copy the address.")).toBeNull();
  nativeClipboard.setStringAsync.mockResolvedValueOnce(true);
  await vi.waitFor(() => expect(view.getByRole("button", { name: "Copy link" })).toBeEnabled());
  await fireEvent.press(view.getByRole("button", { name: "Copy link" }));
  expect(await view.findByText("Link copied")).toBeTruthy();
  expect(Linking.openURL).not.toHaveBeenCalled();
});

it("keeps prose selectable and maps multiple punctuated links to their exact targets", async () => {
  const text = "First (https://reports.example.test/a?token=A%2fb%2B&part=1&part=2),\nthen <https://reports.example.test/b?opaque=one,;.!&next=(two)>; done.";
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  expect((await view.findByText(text)).props.selectable).toBe(true);
  for (const name of ["Open report 1", "Copy link 1", "Open report 2", "Copy link 2"]) {
    expect(view.getByRole("button", { name }).props.accessibilityHint).toBeUndefined();
  }
  await fireEvent.press(view.getByRole("button", { name: "Open report 1" }));
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://reports.example.test/a?token=A%2fb%2B&part=1&part=2");
  await fireEvent.press(view.getByRole("button", { name: "Copy link 2" }));
  expect(nativeClipboard.setStringAsync).toHaveBeenLastCalledWith("https://reports.example.test/b?opaque=one,;.!&next=(two)", {});
  await fireEvent.press(view.getByRole("button", { name: "Open report 2" }));
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://reports.example.test/b?opaque=one,;.!&next=(two)");
  await fireEvent.press(view.getByRole("button", { name: "Copy link 1" }));
  expect(nativeClipboard.setStringAsync).toHaveBeenLastCalledWith("https://reports.example.test/a?token=A%2fb%2B&part=1&part=2", {});
});

it.each([
  "https://reports.example.test/report?opaque=a,b;c.!?&empty=&part=1&&part=2#A%2fb%2B",
  "HTTPS://REPORTS.EXAMPLE.TEST:443/a%2fb?x=%2F&x=%2f&flag#synthetic",
])("passes original URI bytes without normalization: %s", async (target) => {
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text: target }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText(target);
  await fireEvent.press(view.getByRole("button", { name: "Open report" }));
  expect(Linking.openURL).toHaveBeenLastCalledWith(target);
  await fireEvent.press(view.getByRole("button", { name: "Copy link" }));
  expect(nativeClipboard.setStringAsync).toHaveBeenLastCalledWith(target, {});
});

it.each([
  "http://reports.example.test/a", "javascript:https://reports.example.test/a",
  'https://reports.example.test/a?token=one"two', "https://reports.example.test/a<unsafe",
  "https://user:secret@reports.example.test/a", "https://@reports.example.test/a",
  "https:///reports.example.test/a", "https://reports.example.test:99999/a",
  "https://reports.example.test/a%zz", "https://reports.example.test/a\\unsafe",
  "https://[broken/a", "ftp://reports.example.test/a",
])("keeps unsafe or malformed addresses as non-executable selectable text: %s", async (text) => {
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  expect((await view.findByText(text)).props.selectable).toBe(true);
  expect(view.queryByRole("button", { name: "Open report" })).toBeNull();
  expect(view.queryByRole("button", { name: "Copy link" })).toBeNull();
  expect(Linking.openURL).not.toHaveBeenCalled();
  expect(nativeClipboard.setStringAsync).not.toHaveBeenCalled();
});

it.each(["reject", "false"] as const)("recovers from external opening %s with Retry and exact Copy without exposing the error", async (failure) => {
  const target = "https://reports.example.test/report?private=synthetic";
  if (failure === "reject") vi.mocked(Linking.openURL).mockRejectedValueOnce(new Error(target));
  else vi.mocked(Linking.openURL).mockResolvedValueOnce(false);
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text: target }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText(target);
  await fireEvent.changeText(view.getByLabelText("Your message"), "Keep my question");
  await fireEvent.press(view.getByRole("button", { name: "Open report" }));
  expect(await view.findByText("Could not open the link. Try again or copy the link.")).toBeTruthy();
  expect(view.getAllByText(target)).toHaveLength(1);
  expect(view.getByDisplayValue("Keep my question")).toBeTruthy();
  await fireEvent.press(view.getByRole("button", { name: "Copy link" }));
  expect(nativeClipboard.setStringAsync).toHaveBeenLastCalledWith("https://reports.example.test/report?private=synthetic", {});
  await fireEvent.press(view.getByRole("button", { name: "Retry open report" }));
  expect(view.queryByText("Could not open the link. Try again or copy the link.")).toBeNull();
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://reports.example.test/report?private=synthetic");
});

it("ignores queued native link actions after the reader unmounts", async () => {
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text: "https://reports.example.test/a" }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("https://reports.example.test/a");
  const open = view.getByRole("button", { name: "Open report" }).props.onPress;
  const copy = view.getByRole("button", { name: "Copy link" }).props.onPress;
  await view.unmount();
  await act(async () => { await open(); await copy(); });
  expect(Linking.openURL).not.toHaveBeenCalled();
  expect(nativeClipboard.setStringAsync).not.toHaveBeenCalled();
});

it.each(["session", "request", "assignment", "hidden", "unmount"] as const)("discards a delayed opening refusal after %s changes", async (change) => {
  const opened = deferred<boolean>();
  let currentRequest = enquiry;
  vi.mocked(Linking.openURL).mockReturnValueOnce(opened.promise);
  server.use(
    http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(currentRequest)),
    http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
      items: [{ ...message(), text: "https://reports.example.test/a" }], nextCursor: null,
    })),
  );
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("https://reports.example.test/a");
  await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Open report" })); });
  expect(Linking.openURL).toHaveBeenCalledWith("https://reports.example.test/a");
  if (change === "session") await act(() => storeAuthSession(session("session-two")));
  else if (change === "request") {
    routeParams.id = nextId;
    currentRequest = { ...enquiry, id: nextId };
    await view.rerender(<RequestScreen />);
  } else if (change === "assignment") {
    currentRequest = { ...enquiry, assignmentVersion: 2 };
    await act(() => view.queryClient.invalidateQueries({
      queryKey: ["vehicle-history", userId, "session-one", "requests", requestId], exact: true,
    }));
  } else if (change === "hidden") {
    screenFocus.focused = false;
    await view.rerender(<RequestScreen />);
  } else await view.unmount();
  await act(() => opened.resolve(false));
  if (change !== "unmount") {
    expect(view.queryByText("Could not open the link. Try again or copy the link.")).toBeNull();
    expect(view.queryByText("Link copied")).toBeNull();
  }
});

it("confirms Copy beside only the message whose action was selected", async () => {
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [
      { ...message(), text: "https://reports.example.test/a" },
      { ...message(nextId, "2"), text: "Again: https://reports.example.test/a" },
    ], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("Again: https://reports.example.test/a");
  const secondCopy = view.getAllByRole("button", { name: "Copy link" })[1];
  if (!secondCopy) throw new Error("Expected two Copy actions");
  await fireEvent.press(secondCopy);
  expect(view.getAllByText("Link copied")).toHaveLength(1);
});

it("shows pending clipboard work without claiming success or replacing the composer", async () => {
  const copied = deferred<boolean>();
  nativeClipboard.setStringAsync.mockReturnValueOnce(copied.promise);
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text: "https://reports.example.test/a" }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("https://reports.example.test/a");
  const composer = view.getByLabelText("Your message");
  const list = getHost(view.container, "RCTScrollView");
  await fireEvent.changeText(composer, "Unsent question");
  await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Copy link" })); });
  expect(view.getByRole("button", { name: "Copy link", busy: true })).toBeTruthy();
  expect(view.queryByText("Link copied")).toBeNull();
  await act(() => copied.resolve(true));
  expect(view.getByRole("button", { name: "Copy link", busy: false })).toBeTruthy();
  expect(view.getByLabelText("Your message")).toBe(composer);
  expect(view.getByDisplayValue("Unsent question")).toBeTruthy();
  expect(getHost(view.container, "RCTScrollView")).toBe(list);
});

it.each([
  ["en", "Open report", "Copy link", "Link copied", "Could not copy the link. Try again, or select and copy the address.", "Could not open the link. Try again or copy the link."],
  ["ru", "Открыть отчёт", "Скопировать ссылку", "Ссылка скопирована", "Не удалось скопировать ссылку. Повторите попытку или выделите и скопируйте адрес.", "Не удалось открыть ссылку. Повторите попытку или скопируйте ссылку."],
  ["tk", "Hasabaty aç", "Salgyny göçür", "Salgy göçürildi", "Salgyny göçürip bolmady. Gaýtadan synanyşyň ýa-da salgyny saýlap göçüriň.", "Salgyny açyp bolmady. Gaýtadan synanyşyň ýa-da salgyny göçüriň."],
])("names the target and confirms actual Copy accessibly in %s", async (language, open, copy, confirmation, copyFailure, openFailure) => {
  const announce = vi.spyOn(AccessibilityInfo, "announceForAccessibility");
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text: "https://reports.example.test/a#synthetic" }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />, { locale: language });
  await view.findByText("https://reports.example.test/a#synthetic");
  expect(view.getByRole("button", { name: open }).props.accessibilityHint).toBeUndefined();
  expect(view.getByRole("button", { name: copy }).props.accessibilityHint).toBeUndefined();
  await fireEvent.press(view.getByRole("button", { name: copy }));
  expect(await view.findByText(confirmation)).toBeTruthy();
  expect(announce).toHaveBeenCalledWith(confirmation);
  nativeClipboard.setStringAsync.mockResolvedValueOnce(false);
  await fireEvent.press(view.getByRole("button", { name: copy }));
  expect(await view.findByText(copyFailure)).toBeTruthy();
  expect(announce).toHaveBeenCalledWith(copyFailure);
  vi.mocked(Linking.openURL).mockRejectedValueOnce(new Error("Synthetic refusal"));
  await fireEvent.press(view.getByRole("button", { name: open }));
  expect(await view.findByText(openFailure)).toBeTruthy();
  expect(announce).toHaveBeenCalledWith(openFailure);
});

it("keeps the latest explicit Copy result when rapid actions finish out of order", async () => {
  const first = deferred<boolean>();
  const second = deferred<boolean>();
  nativeClipboard.setStringAsync.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text: "https://reports.example.test/a https://reports.example.test/b" }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("https://reports.example.test/a https://reports.example.test/b");
  await act(async () => {
    void fireEvent.press(view.getByRole("button", { name: "Copy link 1" }));
    void fireEvent.press(view.getByRole("button", { name: "Copy link 2" }));
  });
  expect(nativeClipboard.setStringAsync.mock.calls).toEqual([
    ["https://reports.example.test/a", {}], ["https://reports.example.test/b", {}],
  ]);
  await act(() => second.resolve(true));
  await act(() => first.resolve(false));
  expect(view.getAllByText("Link copied")).toHaveLength(1);
  expect(view.queryByText("Could not copy the link. Try again, or select and copy the address.")).toBeNull();
});

it.each(["background", "offline", "hidden", "refresh"] as const)("rejects queued native actions while the current reader is %s", async (change) => {
  const metadata = deferred<Response>();
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text: "https://reports.example.test/a" }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("https://reports.example.test/a");
  const open = view.getByRole("button", { name: "Open report" }).props.onPress;
  const copy = view.getByRole("button", { name: "Copy link" }).props.onPress;
  if (change === "background") AppState.currentState = "background";
  else if (change === "offline") await act(() => onlineManager.setOnline(false));
  else if (change === "hidden") {
    screenFocus.focused = false;
    await view.rerender(<RequestScreen />);
  } else {
    server.use(http.get("*/vehicle-history/requests/:id", () => metadata.promise));
    await act(async () => { void view.queryClient.invalidateQueries({
      queryKey: ["vehicle-history", userId, "session-one", "requests", requestId], exact: true,
    }); });
  }
  if (change === "refresh") await vi.waitFor(() => expect(view.getByRole("button", { name: "Copy link" })).toBeDisabled());
  try {
    await act(async () => { await open(); await copy(); });
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(nativeClipboard.setStringAsync).not.toHaveBeenCalled();
  } finally {
    AppState.currentState = "active";
    await act(() => metadata.resolve(HttpResponse.json(enquiry)));
  }
});

it("does not announce a pending Copy after its reader unmounts", async () => {
  const copied = deferred<boolean>();
  const announce = vi.spyOn(AccessibilityInfo, "announceForAccessibility");
  nativeClipboard.setStringAsync.mockReturnValueOnce(copied.promise);
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text: "https://reports.example.test/a" }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("https://reports.example.test/a");
  await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Copy link" })); });
  await view.unmount();
  announce.mockClear();
  await act(() => copied.resolve(true));
  expect(announce).not.toHaveBeenCalled();
});

it("retains the complete long target and causes no network or service mutations through Open and Copy", async () => {
  const target = "https://reports.example.test/report?opaque=" + "A%2fb%2B".repeat(300) + "&part=1&part=2";
  const sideEffects: string[] = [];
  const observe = ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    if (url.hostname === "reports.example.test" || (request.method !== "GET" && !url.pathname.endsWith("/receipts"))) {
      sideEffects.push(request.method + " " + url.pathname);
    }
  };
  server.events.on("request:start", observe);
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text: target }], nextCursor: null,
  })));
  try {
    const view = await renderMobile(<RequestScreen />);
    expect((await view.findByText(target)).props.selectable).toBe(true);
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(nativeClipboard.setStringAsync).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole("button", { name: "Open report" }));
    await fireEvent.press(view.getByRole("button", { name: "Copy link" }));
    expect(Linking.openURL).toHaveBeenLastCalledWith(target);
    expect(nativeClipboard.setStringAsync).toHaveBeenLastCalledWith(target, {});
    expect(sideEffects).toEqual([]);
  } finally { server.events.removeListener("request:start", observe); }
});

it.each([
  ["Read https://reports.example.test/report.", "https://reports.example.test/report"],
  ["Read [https://reports.example.test/report?x=(one)&part=1&part=2].", "https://reports.example.test/report?x=(one)&part=1&part=2"],
  ["Read “https://reports.example.test/report?x=a%2Eb”; done.", "https://reports.example.test/report?x=a%2Eb"],
  ["https://reports.example.test/report?opaque=a,;.!", "https://reports.example.test/report?opaque=a,;.!"],
])("separates clear prose delimiters while preserving query punctuation: %s", async (text, target) => {
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText(text);
  await fireEvent.press(view.getByRole("button", { name: "Open report" }));
  expect(Linking.openURL).toHaveBeenLastCalledWith(target);
  await fireEvent.press(view.getByRole("button", { name: "Copy link" }));
  expect(nativeClipboard.setStringAsync).toHaveBeenLastCalledWith(target, {});
});

it("preserves legal apostrophes inside a quoted opaque query", async () => {
  const text = "Read 'https://reports.example.test/report?token=O'Reilly&part=1&part=2'.";
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText(text);
  await fireEvent.press(view.getByRole("button", { name: "Open report" }));
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://reports.example.test/report?token=O'Reilly&part=1&part=2");
  await fireEvent.press(view.getByRole("button", { name: "Copy link" }));
  expect(nativeClipboard.setStringAsync).toHaveBeenLastCalledWith("https://reports.example.test/report?token=O'Reilly&part=1&part=2", {});
});

it("offers each adjacent delimited target without whitespace", async () => {
  const text = "(https://reports.example.test/a),(https://reports.example.test/b)";
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({
    items: [{ ...message(), text }], nextCursor: null,
  })));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText(text);
  await fireEvent.press(view.getByRole("button", { name: "Open report 1" }));
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://reports.example.test/a");
  await fireEvent.press(view.getByRole("button", { name: "Copy link 1" }));
  expect(nativeClipboard.setStringAsync).toHaveBeenLastCalledWith("https://reports.example.test/a", {});
  await fireEvent.press(view.getByRole("button", { name: "Open report 2" }));
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://reports.example.test/b");
  await fireEvent.press(view.getByRole("button", { name: "Copy link 2" }));
  expect(nativeClipboard.setStringAsync).toHaveBeenLastCalledWith("https://reports.example.test/b", {});
});

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

it("reads a final long message when it fills the viewport, without reading it offscreen", async () => {
  const text = "Ж / Ý / a question without VIN. ".repeat(100);
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ items: [{ ...message(), text }], nextCursor: null })),
    http.post("*/vehicle-history/requests/:id/receipts", async ({ request }) => {
      const body = await request.json() as { cursor: string; kind: string };
      acknowledgements.push(body);
      return HttpResponse.json({ participantId: userId, assignmentVersion: 0, receivedOrder: "1", readOrder: body.kind === "read" ? "1" : "0" });
    }));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText(text);
  await vi.waitFor(() => expect(acknowledgements).toHaveLength(1));
  const list = getHost(view.container, "RCTScrollView");
  const native = new NativeViewability(list.props.viewabilityConfig);
  const update = (offset: number) => native.onUpdate(
    { data: list.props.data, getItemCount: (rows: unknown[]) => rows.length }, offset, 600,
    { getCellMetrics: () => ({ offset: 0, length: 2000, index: 0, isMounted: true }) },
    (index: number, isViewable: boolean) => ({ item: list.props.data[index], key: firstId, index, isViewable }),
    list.props.onViewableItemsChanged,
  );
  try {
    await act(() => update(2100));
    expect(acknowledgements).toEqual([{ cursor: firstId, kind: "received" }]);
    await act(() => update(700));
    await vi.waitFor(() => expect(acknowledgements).toEqual([
      { cursor: firstId, kind: "received" }, { cursor: firstId, kind: "read" },
    ]));
  } finally { native.dispose(); }
});

it("retains both pages through a metadata outage and resumes receipts only after recovery", async () => {
  const cursors: (string | null)[] = [];
  server.use(http.get("*/vehicle-history/requests/:id/messages", ({ request }) => {
    const cursor = new URL(request.url).searchParams.get("cursor");
    cursors.push(cursor);
    return HttpResponse.json(cursor ? { items: [message(nextId, "2")], nextCursor: null }
      : { items: [message(firstId, "1", true)], nextCursor: firstId });
  }), http.post("*/vehicle-history/requests/:id/receipts", async ({ request }) => {
    const body = await request.json() as { cursor: string; kind: string };
    acknowledgements.push(body);
    return HttpResponse.json({ participantId: userId, assignmentVersion: 0, receivedOrder: "2", readOrder: body.kind === "read" ? "2" : "0" });
  }));
  const view = await renderMobile(<RequestScreen />);
  await view.findByText("Can I ask without a VIN?");
  await fireEvent.press(view.getByRole("button", { name: "Load more messages" }));
  await view.findByText("Questions are welcome.");
  await vi.waitFor(() => expect(acknowledgements).toHaveLength(2));
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ code: "UNAVAILABLE" }, { status: 503 })));
  await act(() => onlineManager.setOnline(false));
  await act(() => onlineManager.setOnline(true));
  await view.findByText(/Something went wrong|Could not refresh this request\./);
  expect(view.getByText("Can I ask without a VIN?")).toBeTruthy();
  expect(view.getByText("Questions are welcome.")).toBeTruthy();
  await visible(view, [nextId]);
  expect(acknowledgements).toEqual([{ cursor: firstId, kind: "received" }, { cursor: nextId, kind: "received" }]);
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json(enquiry)));
  await fireEvent.press(view.getByRole("button", { name: "Retry" }));
  await vi.waitFor(() => expect(acknowledgements.at(-1)).toEqual({ cursor: nextId, kind: "read" }));
  expect(cursors).toEqual([null, firstId, null, firstId]);
  expect(view.getByText("Can I ask without a VIN?")).toBeTruthy();
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
  expect(view.getByLabelText(locale === "ru" ? "Ваше сообщение" : locale === "tk" ? "Habaryňyz" : "Your message")).toBeTruthy();
  await view.unmount();
});

it("sends exact text once during rapid taps and keeps a newer draft after commitment", async () => {
  const response = deferred<Response>();
  const sends: unknown[] = [];
  server.use(http.post("*/vehicle-history/requests/:id/messages", async ({ request }) => {
    const body = await request.json() as { clientMessageId: string; text: string };
    sends.push(body);
    return response.promise;
  }));
  const view = await renderMobile(<RequestScreen />);
  const input = await view.findByLabelText("Your message");
  await fireEvent.changeText(input, "  Salam\nDünýä  ");
  const send = view.getByRole("button", { name: "Send message" });
  await act(async () => { void fireEvent.press(send); void fireEvent.press(send); });
  await vi.waitFor(() => expect(sends).toHaveLength(1));
  expect(sends[0]).toEqual({ clientMessageId: expect.any(String), text: "  Salam\nDünýä  " });
  expect(view.getAllByText("Sending…").length).toBeGreaterThan(0);
  await fireEvent.changeText(input, "A newer question");
  await act(() => response.resolve(HttpResponse.json({ ...message(nextId, "2", true),
    ...(sends[0] as object) })));
  expect(await view.findByText("Sent")).toBeTruthy();
  expect(view.getByDisplayValue("A newer question")).toBeTruthy();
  expect(view.getByText("  Salam\nDünýä  ")).toBeTruthy();
});

it("retries a response-lost commit with the same ID and original exact text, then clears only its unchanged draft", async () => {
  const sends: { clientMessageId: string; text: string }[] = [];
  let committed: ReturnType<typeof message> | undefined;
  server.use(http.post("*/vehicle-history/requests/:id/messages", async ({ request }) => {
    const body = await request.json() as { clientMessageId: string; text: string };
    sends.push(body);
    committed ??= { ...message(nextId, "2", true), ...body };
    return sends.length === 1 ? HttpResponse.error() : HttpResponse.json(committed);
  }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.changeText(await view.findByLabelText("Your message"), "  VIN?\nÝ / Ж  ");
  await fireEvent.press(view.getByRole("button", { name: "Send message" }));
  expect(await view.findByText("Send not confirmed. Retry the same message.")).toBeTruthy();
  expect(view.getByDisplayValue("  VIN?\nÝ / Ж  ")).toBeTruthy();
  await fireEvent.press(view.getByRole("button", { name: /Retry message:.*VIN/s }));
  await vi.waitFor(() => expect(sends).toHaveLength(2));
  expect(sends).toEqual([sends[0], sends[0]]);
  expect(sends[0]?.text).toBe("  VIN?\nÝ / Ж  ");
  expect(view.getByDisplayValue("")).toBeTruthy();
  expect(view.getAllByText("  VIN?\nÝ / Ж  ")).toHaveLength(1);
  expect(view.getByText("Sent")).toBeTruthy();
});

it("makes a newer edited send an explicit new intent while preserving the uncertain original for retry", async () => {
  const sends: { clientMessageId: string; text: string }[] = [];
  server.use(http.post("*/vehicle-history/requests/:id/messages", async ({ request }) => {
    const body = await request.json() as { clientMessageId: string; text: string };
    sends.push(body);
    return sends.length === 1 ? HttpResponse.error() : HttpResponse.json({ ...message(nextId, "2", true), ...body });
  }));
  const view = await renderMobile(<RequestScreen />);
  const input = await view.findByLabelText("Your message");
  await fireEvent.changeText(input, "Original");
  await fireEvent.press(view.getByRole("button", { name: "Send message" }));
  await view.findByText("Send not confirmed. Retry the same message.");
  await fireEvent.changeText(input, "New question");
  await fireEvent.press(view.getByRole("button", { name: "Send as new message" }));
  expect(sends.map((send) => send.text)).toEqual(["Original", "New question"]);
  expect(sends[1]?.clientMessageId).not.toBe(sends[0]?.clientMessageId);
  expect(view.getByRole("button", { name: "Retry message: Original" })).toBeTruthy();
  expect(view.getByText("New question")).toBeTruthy();
});

it("keeps sent results outside contiguous page evidence until exact forward pages arrive, without duplicates or lookahead ACK", async () => {
  const middleId = "20000000-0000-4000-8000-000000000003";
  let committed: ReturnType<typeof message> | undefined;
  let failPage = true;
  const cursors: (string | null)[] = [];
  server.use(http.get("*/vehicle-history/requests/:id/messages", ({ request }) => {
    const cursor = new URL(request.url).searchParams.get("cursor");
    cursors.push(cursor);
    return !cursor ? HttpResponse.json({ items: [message()], nextCursor: firstId })
      : failPage ? HttpResponse.json({ code: "UNAVAILABLE" }, { status: 503 })
        : HttpResponse.json({ items: [message(middleId, "2"), committed], nextCursor: null });
  }), http.post("*/vehicle-history/requests/:id/messages", async ({ request }) => {
    committed = { ...message(nextId, "3", true), ...await request.json() as object };
    return HttpResponse.json(committed);
  }), http.post("*/vehicle-history/requests/:id/receipts", async ({ request }) => {
    const body = await request.json() as { cursor: string; kind: string };
    acknowledgements.push(body);
    return HttpResponse.json({ participantId: userId, assignmentVersion: 0,
      receivedOrder: body.cursor === firstId ? "1" : "3", readOrder: body.kind === "read" ? "3" : "0" });
  }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.changeText(await view.findByLabelText("Your message"), "Sent past a gap");
  await fireEvent.press(view.getByRole("button", { name: "Send message" }));
  await view.findByText("Sent");
  await visible(view, [nextId]);
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ cursor: firstId, kind: "received" }]));
  expect(getHost(view.container, "RCTScrollView").props.data.map((row: { id: string }) => row.id)).toEqual([firstId]);
  await fireEvent.press(view.getByRole("button", { name: "Load more messages" }));
  await view.findByText("Could not load more messages.");
  expect(view.getAllByText("Sent past a gap")).toHaveLength(1);
  failPage = false;
  await fireEvent.press(view.getByRole("button", { name: "Retry" }));
  await vi.waitFor(() => expect(getHost(view.container, "RCTScrollView").props.data.map((row: { id: string }) => row.id))
    .toEqual([firstId, middleId, nextId]));
  expect(view.getAllByText("Sent past a gap")).toHaveLength(1);
  expect(cursors.slice(-2)).toEqual([firstId, firstId]);
  await vi.waitFor(() => expect(acknowledgements).toContainEqual({ cursor: nextId, kind: "received" }));
});

it.each(["account", "session", "request", "assignment", "unmount"])("fences a late send result after %s replacement", async (change) => {
  const response = deferred<Response>();
  const posted = deferred<{ clientMessageId: string; text: string }>();
  server.use(http.post("*/vehicle-history/requests/:id/messages", async ({ request }) => {
    posted.resolve(await request.json() as { clientMessageId: string; text: string });
    return response.promise;
  }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.changeText(await view.findByLabelText("Your message"), "Original request only");
  await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Send message" })); });
  const body = await posted.promise;
  if (change === "account") await act(() => storeAuthSession(session("different", operatorId)));
  if (change === "session") await act(() => storeAuthSession(session("session-two")));
  if (change === "request") {
    routeParams.id = "10000000-0000-4000-8000-000000000102";
    server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ ...enquiry, id: routeParams.id })));
    await view.rerender(<RequestScreen />);
  }
  if (change === "assignment") {
    server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ ...enquiry, assignmentVersion: 2 })));
    await act(() => view.queryClient.invalidateQueries({ queryKey: ["vehicle-history", userId, "session-one", "requests", requestId], exact: true }));
  }
  if (change === "unmount") await view.unmount();
  else {
    await vi.waitFor(() => expect(view.queryByText("Original request only")).toBeNull());
    await fireEvent.changeText(await view.findByLabelText("Your message"), "New scope draft");
  }
  await act(() => response.resolve(HttpResponse.json({ ...message(nextId, "2", true), ...body })));
  if (change !== "unmount") {
    expect(view.queryByText("Original request only")).toBeNull();
    expect(view.getByDisplayValue("New scope draft")).toBeTruthy();
    expect(view.queryByText("Sent")).toBeNull();
  }
});

it.each(["account", "session", "request", "assignment", "blur", "background", "unmount"])("does not replay a send across %s during shared refresh", async (change) => {
  const refresh = deferred<Response>();
  const refreshing = deferred<undefined>();
  const sends: string[] = [];
  server.use(http.post("*/vehicle-history/requests/:id/messages", ({ request }) => {
    sends.push(request.headers.get("Authorization") ?? "");
    return HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }), http.post("*/auth/refresh", () => { refreshing.resolve(undefined); return refresh.promise; }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.changeText(await view.findByLabelText("Your message"), "Do not replay");
  await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Send message" })); });
  await refreshing.promise;
  if (change === "account") await act(() => storeAuthSession(session("different", operatorId)));
  if (change === "request") {
    routeParams.id = "10000000-0000-4000-8000-000000000102";
    server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ ...enquiry, id: routeParams.id })));
    await view.rerender(<RequestScreen />);
  }
  if (change === "blur") { screenFocus.focused = false; await view.rerender(<RequestScreen />); }
  if (change === "background") await act(() => focusManager.setFocused(false));
  if (change === "session") await act(() => storeAuthSession(session("session-two")));
  if (change === "assignment") {
    server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ ...enquiry, assignmentVersion: 2 })));
    await act(() => view.queryClient.invalidateQueries({ queryKey: ["vehicle-history", userId, "session-one", "requests", requestId], exact: true }));
  }
  if (change === "unmount") await view.unmount();
  await act(() => refresh.resolve(HttpResponse.json({ accessToken: session().accessToken, refreshToken: "rotated" })));
  expect(sends).toEqual([`Bearer ${session().accessToken}`]);
});

it.each([
  [400, "HISTORY_MESSAGE_INVALID", "Could not send this message."],
  [403, "FORBIDDEN", "This request is unavailable for this session. Go back to your requests."],
  [409, "HISTORY_ASSIGNMENT_CONFLICT", "This request changed. Refresh it to continue."],
  [503, "UNAVAILABLE", "Send not confirmed. Retry the same message."],
  [200, "malformed", "Send not confirmed. Retry the same message."],
])("preserves text and truthful recovery after send status %s", async (status, code, copy) => {
  server.use(http.post("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ code }, { status })));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.changeText(await view.findByLabelText("Your message"), "Keep my question");
  await fireEvent.press(view.getByRole("button", { name: "Send message" }));
  expect(await view.findByText(copy)).toBeTruthy();
  expect(view.getByDisplayValue("Keep my question")).toBeTruthy();
  expect(view.queryByText("Sent")).toBeNull();
  expect(view.getByRole("button", { name: status === 403 || status === 409 ? "Refresh request" : "Retry message: Keep my question" })).toBeTruthy();
});

it("keeps the multiline composer outside the stable reader and prevents empty, offline and hidden sends", async () => {
  const view = await renderMobile(<RequestScreen />);
  const input = await view.findByLabelText("Your message");
  const list = getHost(view.container, "RCTScrollView");
  expect(list.props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
  expect(list.props.keyboardShouldPersistTaps).toBe("handled");
  expect(list.props.keyboardDismissMode).toBe("interactive");
  expect(input.props.multiline).toBe(true);
  expect(input.props.maxLength).toBe(4000);
  expect(input.parent).not.toBe(list);
  expect(getHost(view.container, "KeyboardAvoidingView").props.behavior).toBe("padding");
  await fireEvent.changeText(input, " \n ");
  expect(view.getByRole("button", { name: "Send message" }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.changeText(input, "Valid question");
  await act(() => onlineManager.setOnline(false));
  expect(view.getByRole("button", { name: "Send message" }).props.accessibilityState.disabled).toBe(true);
  await act(() => onlineManager.setOnline(true));
  await vi.waitFor(() => expect(view.getByRole("button", { name: "Send message" }).props.accessibilityState.disabled).toBe(false));
  screenFocus.focused = false;
  await view.rerender(<RequestScreen />);
  expect(view.getByRole("button", { name: "Send message" }).props.accessibilityState.disabled).toBe(true);
  expect(view.getByDisplayValue("Valid question")).toBeTruthy();
});

it.each([
  ["en", "Your message", "Send message", "Send not confirmed. Retry the same message."],
  ["ru", "Ваше сообщение", "Отправить сообщение", "Отправка не подтверждена. Повторите то же сообщение."],
  ["tk", "Habaryňyz", "Habar iber", "Iberilendigi tassyklanmady. Şol habary gaýtadan iberiň."],
])("supports long exact questions without VIN or an assigned operator in %s", async (locale, label, send, uncertain) => {
  const sends: unknown[] = [];
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ ...enquiry, assignedOperator: null, assignmentVersion: 0 })),
    http.post("*/vehicle-history/requests/:id/messages", async ({ request }) => {
      sends.push(await request.json());
      return HttpResponse.error();
    }));
  const view = await renderMobile(<RequestScreen />, { locale });
  const text = "  Ж / Ý / 🚗\n".repeat(200);
  await fireEvent.changeText(await view.findByLabelText(label), text);
  await fireEvent.press(view.getByRole("button", { name: send }));
  expect(await view.findByText(uncertain)).toBeTruthy();
  expect(sends).toEqual([{ clientMessageId: expect.stringMatching(/^[a-f0-9-]{36}$/), text }]);
  expect(view.getByDisplayValue(text)).toBeTruthy();
});

it.each([["0", "0", "Sent"], ["2", "0", "Delivered"], ["2", "2", "Read"]])(
  "uses actual current-assignment receipts for committed sends (%s/%s)", async (receivedOrder, readOrder, label) => {
    server.use(http.post("*/vehicle-history/requests/:id/messages", async ({ request }) =>
      HttpResponse.json({ ...message(nextId, "2", true), ...await request.json() as object })),
    http.get("*/vehicle-history/requests/:id/receipts", () => HttpResponse.json({ items: [
      { participantId: operatorId, assignmentVersion: 1, receivedOrder, readOrder },
    ] })));
    const view = await renderMobile(<RequestScreen />);
    await fireEvent.changeText(await view.findByLabelText("Your message"), "Receipt facts only");
    await fireEvent.press(view.getByRole("button", { name: "Send message" }));
    expect(await view.findByText(label)).toBeTruthy();
    expect(acknowledgements.every((ack) => ack.cursor === firstId)).toBe(true);
  },
);

it("keeps the draft and pending text through a failed metadata refresh, then reconciles without inventing commitment", async () => {
  const response = deferred<Response>();
  const posted = deferred<undefined>();
  server.use(http.post("*/vehicle-history/requests/:id/messages", () => { posted.resolve(undefined); return response.promise; }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.changeText(await view.findByLabelText("Your message"), "Original text");
  await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Send message" })); });
  await posted.promise;
  await fireEvent.changeText(view.getByLabelText("Your message"), "Newer text");
  server.use(http.get("*/vehicle-history/requests/:id", () => HttpResponse.json({ code: "UNAVAILABLE" }, { status: 503 })));
  await act(() => onlineManager.setOnline(false));
  await act(() => onlineManager.setOnline(true));
  await view.findByText("Could not refresh this request.");
  await act(() => response.resolve(HttpResponse.error()));
  expect(await view.findByText("Send not confirmed. Retry the same message.")).toBeTruthy();
  expect(view.getByDisplayValue("Newer text")).toBeTruthy();
  expect(view.getByText("Original text")).toBeTruthy();
});

it("reconciles a lost response from fetched pages without leaving the original text ready to send twice", async () => {
  let committed: ReturnType<typeof message> | undefined;
  server.use(http.post("*/vehicle-history/requests/:id/messages", async ({ request }) => {
    committed = { ...message(nextId, "2", true), ...await request.json() as object };
    return HttpResponse.error();
  }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.changeText(await view.findByLabelText("Your message"), "Committed despite response loss");
  await fireEvent.press(view.getByRole("button", { name: "Send message" }));
  await view.findByText("Send not confirmed. Retry the same message.");
  server.use(http.get("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ items: [message(), committed], nextCursor: null })));
  await act(() => onlineManager.setOnline(false));
  await act(() => onlineManager.setOnline(true));
  await view.findByText("Sent");
  expect(view.getByDisplayValue("")).toBeTruthy();
  expect(view.queryByRole("button", { name: /Retry message:/ })).toBeNull();
  expect(view.getAllByText("Committed despite response loss")).toHaveLength(1);
});

it("requires a current request refresh after a send refusal before allowing another intent", async () => {
  server.use(http.post("*/vehicle-history/requests/:id/messages", () => HttpResponse.json({ code: "FORBIDDEN" }, { status: 403 })));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.changeText(await view.findByLabelText("Your message"), "Private request");
  await fireEvent.press(view.getByRole("button", { name: "Send message" }));
  await view.findByText("This request is unavailable for this session. Go back to your requests.");
  expect(view.getByRole("button", { name: "Send as new message" }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(view.getByRole("button", { name: "Refresh request" }));
  await vi.waitFor(() => expect(view.getByRole("button", { name: "Send as new message" }).props.accessibilityState.disabled).toBe(false));
});

it("retries only the original intent while later edits survive its delayed result", async () => {
  const response = deferred<Response>();
  const sends: { clientMessageId: string; text: string }[] = [];
  server.use(http.post("*/vehicle-history/requests/:id/messages", async ({ request }) => {
    sends.push(await request.json() as { clientMessageId: string; text: string });
    return sends.length === 1 ? HttpResponse.error() : response.promise;
  }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.changeText(await view.findByLabelText("Your message"), "  Original\n ");
  await fireEvent.press(view.getByRole("button", { name: "Send message" }));
  await view.findByText("Send not confirmed. Retry the same message.");
  await fireEvent.changeText(view.getByLabelText("Your message"), "Newer before retry");
  await act(async () => { void fireEvent.press(view.getByRole("button", { name: /Retry message:/ })); });
  await vi.waitFor(() => expect(sends).toHaveLength(2));
  await fireEvent.changeText(view.getByLabelText("Your message"), "Newer during retry");
  await act(() => response.resolve(HttpResponse.json({ ...message(nextId, "2", true), ...sends[0] })));
  expect(await view.findByText("Sent")).toBeTruthy();
  expect(sends).toEqual([sends[0], sends[0]]);
  expect(sends[1]?.text).toBe("  Original\n ");
  expect(view.getByDisplayValue("Newer during retry")).toBeTruthy();
});

it.each(["different text", "foreign author", "staff field"])("rejects a send response with %s instead of inventing Sent", async (fault) => {
  server.use(http.post("*/vehicle-history/requests/:id/messages", async ({ request }) => {
    const body = await request.json() as { clientMessageId: string; text: string };
    const result = { ...message(nextId, "2", true), ...body };
    return HttpResponse.json(fault === "different text" ? { ...result, text: "Changed by transport" }
      : fault === "foreign author" ? { ...result, author: { ...operator, kind: "operator" } }
        : { ...result, privateNote: "Never show staff material" });
  }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.changeText(await view.findByLabelText("Your message"), "Only my exact reply");
  await fireEvent.press(view.getByRole("button", { name: "Send message" }));
  expect(await view.findByText("Send not confirmed. Retry the same message.")).toBeTruthy();
  expect(view.queryByText("Sent")).toBeNull();
  expect(view.queryByText("Never show staff material")).toBeNull();
  expect(view.queryByText("Changed by transport")).toBeNull();
  expect(view.getByDisplayValue("Only my exact reply")).toBeTruthy();
});

it.each(["blur", "background"])("requires explicit same-intent retry after %s and return before token refresh completes", async (hidden) => {
  const refresh = deferred<Response>();
  const refreshing = deferred<undefined>();
  const sends: { clientMessageId: string; text: string }[] = [];
  server.use(http.post("*/vehicle-history/requests/:id/messages", async ({ request }) => {
    const body = await request.json() as { clientMessageId: string; text: string };
    sends.push(body);
    return sends.length === 1 ? HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 })
      : HttpResponse.json({ ...message(nextId, "2", true), ...body });
  }), http.post("*/auth/refresh", () => { refreshing.resolve(undefined); return refresh.promise; }));
  const view = await renderMobile(<RequestScreen />);
  await fireEvent.changeText(await view.findByLabelText("Your message"), "  Original\n ");
  await act(async () => { void fireEvent.press(view.getByRole("button", { name: "Send message" })); });
  await refreshing.promise;
  if (hidden === "blur") { screenFocus.focused = false; await view.rerender(<RequestScreen />); }
  else await act(() => focusManager.setFocused(false));
  if (hidden === "blur") { screenFocus.focused = true; await view.rerender(<RequestScreen />); }
  else await act(() => focusManager.setFocused(true));
  await act(() => refresh.resolve(HttpResponse.json({ accessToken: session().accessToken, refreshToken: "rotated" })));
  expect(await view.findByText("Send not confirmed. Retry the same message.")).toBeTruthy();
  expect(sends).toEqual([{ clientMessageId: expect.any(String), text: "  Original\n " }]);
  await fireEvent.changeText(view.getByLabelText("Your message"), "A newer draft");
  const retry = await view.findByRole("button", { name: /Retry message:/ });
  await vi.waitFor(() => expect(retry.props.accessibilityState.disabled).toBe(false));
  await fireEvent.press(retry);
  expect(await view.findByText("Sent")).toBeTruthy();
  expect(sends).toEqual([sends[0], sends[0]]);
  expect(view.getByDisplayValue("A newer draft")).toBeTruthy();
});

function reminder() { return { reason: "customer_answer", since: "2026-11-14T01:00:00.000Z", version: 3,
  eligibleAt: "2026-11-15T01:00:00.000Z", eligible: true, ineligibleReason: null, declined: false, stopped: false, used: false, outcome: null }; }
it("stops reminders explicitly, retries the same uncertain version and keeps the conversation readable", async () => {
  const writes: unknown[] = []; let stopped = false;
  server.use(http.get("*/vehicle-history/requests/:id/reminder", () => HttpResponse.json(stopped
    ? { ...reminder(), version: 4, stopped: true, eligible: false, ineligibleReason: "stopped" } : reminder())),
  http.post("*/vehicle-history/requests/:id/reminder/stop", async ({ request }) => {
    writes.push(await request.json());
    if (writes.length === 1) return HttpResponse.json({ code: "HISTORY_REMINDER_UNAVAILABLE" }, { status: 503 });
    stopped = true;
    return HttpResponse.json({ ...reminder(), version: 4, stopped: true, eligible: false, ineligibleReason: "stopped" });
  }));
  const view = await renderMobile(<RequestScreen />);
  const stop = await view.findByRole("button", { name: "Stop reminders" });
  expect(writes).toEqual([]);
  await fireEvent.press(stop);
  await view.findByText("Stopping reminders is unconfirmed. Retry to check the same request.");
  await fireEvent.press(view.getByRole("button", { name: "Retry stopping reminders" }));
  await view.findByText("Reminders stopped. Your conversation stays available.");
  expect(writes).toEqual([{ expectedWaitingVersion: 3 }, { expectedWaitingVersion: 3 }]);
  expect(view.getByText("Questions are welcome.")).toBeTruthy();
  await view.unmount();
  const reopened = await renderMobile(<RequestScreen />);
  await reopened.findByText("Reminders stopped. Your conversation stays available.");
  expect(reopened.queryByRole("button", { name: "Stop reminders" })).toBeNull();
});

it("keeps the original Stop version after navigation and reads back a concurrent change before another explicit tap", async () => {
  const storage = new Map<string, string>();
  vi.mocked(AsyncStorage.getItem).mockImplementation(async (key) => storage.get(key) ?? null);
  vi.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => { storage.set(key, value); });
  vi.mocked(AsyncStorage.removeItem).mockImplementation(async (key) => { storage.delete(key); });
  const versions: number[] = []; let version = 3;
  server.use(http.get("*/vehicle-history/requests/:id/reminder", () => HttpResponse.json({ ...reminder(), version })),
    http.post("*/vehicle-history/requests/:id/reminder/stop", async ({ request }) => {
      versions.push((await request.json() as { expectedWaitingVersion: number }).expectedWaitingVersion);
      version = 4;
      return HttpResponse.json({ code: versions.length === 1 ? "HISTORY_REMINDER_UNAVAILABLE" : "HISTORY_REMINDER_CONFLICT" },
        { status: versions.length === 1 ? 503 : 409 });
    }));
  const first = await renderMobile(<RequestScreen />);
  await fireEvent.press(await first.findByRole("button", { name: "Stop reminders" }));
  await first.findByRole("button", { name: "Retry stopping reminders" });
  await first.unmount();
  const next = await renderMobile(<RequestScreen />);
  await fireEvent.press(await next.findByRole("button", { name: "Retry stopping reminders" }));
  await next.findByText("The request changed. Check its status, then choose Stop reminders again.");
  expect(versions).toEqual([3, 3]);
  await fireEvent.press(next.getByRole("button", { name: "Stop reminders" }));
  expect(versions).toEqual([3, 3, 4]);
});
it("discards a pending Stop result after the current account session changes", async () => {
  const pending = deferred<Response>(), sent = deferred<undefined>();
  server.use(http.post("*/vehicle-history/requests/:id/reminder/stop", () => { sent.resolve(undefined); return pending.promise; }));
  const view = await renderMobile(<RequestScreen />);
  const stop = await view.findByRole("button", { name: "Stop reminders" });
  await act(async () => { void fireEvent.press(stop); });
  await sent.promise;
  await act(async () => { await storeAuthSession(session("session-two")); });
  await act(() => pending.resolve(HttpResponse.json({ ...reminder(), stopped: true, eligible: false, ineligibleReason: "stopped" })));
  expect(view.queryByText("Reminders stopped. Your conversation stays available.")).toBeNull();
});
it.each([
  ["en", "Stop reminders", "Reminders stopped. Your conversation stays available."],
  ["ru", "Отключить напоминания", "Напоминания отключены. Переписка остаётся доступной."],
  ["tk", "Ýatlatmalary bes et", "Ýatlatmalar bes edildi. Hat alyşma elýeterli bolmagynda galýar."],
])("shows persisted Stop success in %s", async (locale, label, success) => {
  server.use(http.post("*/vehicle-history/requests/:id/reminder/stop", () => HttpResponse.json({ ...reminder(),
    stopped: true, eligible: false, ineligibleReason: "stopped" })));
  const view = await renderMobile(<RequestScreen />, { locale });
  await fireEvent.press(await view.findByRole("button", { name: label }));
  await view.findByText(success);
  expect(view.queryByRole("button", { name: label })).toBeNull();
});

it("requires an explicit Stop retry after a background-and-return before token refresh completes", async () => {
  const refresh = deferred<Response>(), refreshing = deferred<undefined>();
  const writes: unknown[] = [];
  server.use(http.post("*/vehicle-history/requests/:id/reminder/stop", async ({ request }) => {
    writes.push(await request.json());
    return writes.length === 1 ? HttpResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 })
      : HttpResponse.json({ ...reminder(), stopped: true, eligible: false, ineligibleReason: "stopped" });
  }), http.post("*/auth/refresh", () => { refreshing.resolve(undefined); return refresh.promise; }));
  const view = await renderMobile(<RequestScreen />);
  const stop = await view.findByRole("button", { name: "Stop reminders" });
  await vi.waitFor(() => expect(stop.props.accessibilityState.disabled).toBe(false));
  await act(async () => { void fireEvent.press(stop); });
  await refreshing.promise;
  await act(() => { focusManager.setFocused(false); focusManager.setFocused(true); });
  await vi.waitFor(() => expect(view.queryClient.isFetching()).toBe(0));
  await act(() => refresh.resolve(HttpResponse.json({ accessToken: session().accessToken, refreshToken: "rotated" })));
  await vi.waitFor(() => expect(view.queryByText("Stopping reminders…")).toBeNull());
  expect(writes).toEqual([{ expectedWaitingVersion: 3 }]);
});

it("recovers a conflict readback interrupted by leaving and returning to the conversation", async () => {
  const readback = deferred<Response>(), reading = deferred<undefined>();
  let conflict = false, completed = false;
  server.use(http.get("*/vehicle-history/requests/:id/reminder", () => {
    if (conflict && !completed) { reading.resolve(undefined); return readback.promise; }
    return HttpResponse.json(reminder());
  }), http.post("*/vehicle-history/requests/:id/reminder/stop", () => {
    conflict = true; return HttpResponse.json({ code: "HISTORY_REMINDER_CONFLICT" }, { status: 409 });
  }));
  const view = await renderMobile(<RequestScreen />);
  const stop = await view.findByRole("button", { name: "Stop reminders" });
  await vi.waitFor(() => expect(stop.props.accessibilityState.disabled).toBe(false));
  await act(async () => { void fireEvent.press(stop); });
  await reading.promise;
  screenFocus.focused = false; await view.rerender(<RequestScreen />);
  completed = true;
  await act(() => readback.resolve(HttpResponse.json(reminder())));
  screenFocus.focused = true; await view.rerender(<RequestScreen />);
  await vi.waitFor(() => expect(view.queryClient.isFetching()).toBe(0));
  await vi.waitFor(() => expect(view.queryByText("Stopping reminders…")).toBeNull());
  expect(view.getByRole("button", { name: "Retry stopping reminders" }).props.accessibilityState.disabled).toBe(false);
});
