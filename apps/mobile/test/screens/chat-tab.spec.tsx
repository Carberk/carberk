import type { ConversationsSchemas } from "@auto-tm/contracts";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, fireEvent, renderMobile, routerMock } from "../render";
import ChatScreen from "../../app/(tabs)/chat";
import { AutoTmTabBar } from "../../components/navigation/AutoTmTabBar";
import { useAuthIntentStore } from "../../src/auth/intentStore";
import { HOME_HREF } from "../../src/navigation/homeHref";

type Response = ConversationsSchemas.ListConversationsResponse;

const api = vi.hoisted(() => ({ get: vi.fn() }));
const state = vi.hoisted(() => ({ auth: true as boolean | null }));
vi.mock("../../src/api/client", () => ({
  apiClient: { get: api.get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  ApiError: class ApiError extends Error { constructor(public code: string, public status: number) { super(code); } },
}));
vi.mock("react-native-safe-area-context", async () => ({
  SafeAreaView: (await import("react-native")).View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: state.auth, phone: "" }) }));
vi.mock("../../src/notifications/useChatPushTokenRegistration", () => ({ useChatPushTokenRegistration: vi.fn() }));
vi.mock("../../src/conversations/components/useConversationCatalogMaps", () => ({
  useConversationCatalogMaps: () => ({ brandName: () => "Toyota", modelName: () => "Camry" }),
}));

const ME = "00000000-0000-4000-8000-0000000000b1";
const PEER = "00000000-0000-4000-8000-0000000000b2";

function conversation(id: string, unreadCount: number): ConversationsSchemas.ConversationSummary {
  return {
    id, listing: null, buyerId: ME, sellerId: PEER, myRole: "buyer",
    peer: { id: PEER, displayName: "Merdan" }, blockedByMe: false,
    lastMessage: {
      id: "00000000-0000-4000-8000-0000000000f1", conversationId: id, senderId: PEER,
      kind: "text", text: "Hello", createdAt: "2026-10-01T10:00:00.000Z",
    },
    updatedAt: "2026-10-01T10:00:00.000Z", unreadCount,
  };
}
const first = "00000000-0000-4000-8000-0000000000c1";
const page = (items: ConversationsSchemas.ConversationSummary[]): Response => ({ items, nextCursor: null });

/** Lets queries and their batched notifications finish. */
async function settle() {
  for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function renderScreen(locale = "en") {
  const view = renderMobile(<ChatScreen />, { locale });
  await settle();
  return view;
}

beforeEach(() => {
  state.auth = true;
  useAuthIntentStore.setState({ intent: null, replayAction: null, replayReturnTo: null });
  api.get.mockReset().mockResolvedValue(page([conversation(first, 2)]));
  vi.mocked(useFocusEffect).mockReset();
});

describe("Messages tab", () => {
  it("is headed Messages in every language", async () => {
    expect((await renderScreen("en")).getByText("Messages")).toBeTruthy();
    expect((await renderScreen("ru")).getByText("Сообщения")).toBeTruthy();
    expect((await renderScreen("tk")).getByText("Habarlar")).toBeTruthy();
  });

  it("lists the viewer's Conversations", async () => {
    const view = await renderScreen();
    expect(api.get).toHaveBeenCalledWith("/conversations?limit=20", expect.anything());
    expect(view.getByText("Merdan")).toBeTruthy();
    expect(view.getByText("2")).toBeTruthy();
  });

  it("shows six skeleton rows while loading", async () => {
    api.get.mockReset().mockReturnValue(new Promise(() => {}));
    const view = await renderScreen();
    expect(view.getAllByTestId("conversation-row-skeleton")).toHaveLength(6);
  });

  it("shows the error state with Retry, which loads again", async () => {
    api.get.mockReset().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(page([conversation(first, 0)]));
    const view = await renderScreen();

    fireEvent.press(view.getByText("Retry"));
    await settle();

    expect(view.getByText("Merdan")).toBeTruthy();
  });

  it("shows the empty state, whose Browse listings opens Home", async () => {
    api.get.mockReset().mockResolvedValue(page([]));
    const view = await renderScreen();

    expect(view.getByText("No conversations yet")).toBeTruthy();
    expect(view.getByText("Open a Listing and message the seller. The Conversation appears here.")).toBeTruthy();
    fireEvent.press(view.getByText("Browse listings"));
    expect(routerMock.navigate).toHaveBeenCalledWith(HOME_HREF);
  });

  it("shows the empty state in Russian and Turkmen", async () => {
    api.get.mockReset().mockResolvedValue(page([]));
    const ru = await renderScreen("ru");
    expect(ru.getByText("Пока нет переписок")).toBeTruthy();
    expect(ru.getByText("Откройте объявление и напишите продавцу — переписка появится здесь.")).toBeTruthy();
    expect(ru.getByText("Смотреть объявления")).toBeTruthy();

    const tk = await renderScreen("tk");
    expect(tk.getByText("Habarlaşma ýok")).toBeTruthy();
    expect(tk.getByText("Bildirişi açyp satyjyny ýazyň — gepleşik şu ýerde peýda bolar.")).toBeTruthy();
    expect(tk.getByText("Bildirişlere seret")).toBeTruthy();
  });

  it("asks a signed-out visitor to sign in and returns them to Messages", async () => {
    state.auth = false;
    const requireSignIn = vi.spyOn(useAuthIntentStore.getState(), "requireSignIn");
    const view = await renderScreen();

    expect(view.getByText("Sign in to see your Messages")).toBeTruthy();
    fireEvent.press(view.getByText("Sign in"));
    expect(requireSignIn).toHaveBeenCalledWith(routerMock, { returnTo: "/(tabs)/chat" });
    expect(api.get).not.toHaveBeenCalled();
  });

  it("shows signed-out copy in Russian and Turkmen", async () => {
    state.auth = false;
    expect((await renderScreen("ru")).getByText("Войдите, чтобы увидеть сообщения")).toBeTruthy();
    expect((await renderScreen("tk")).getByText("Habarlary görmek üçin giriň")).toBeTruthy();
  });

  it("refetches when the tab gains focus again, so read Conversations lose their badge", async () => {
    const focusEffects: (() => void)[] = [];
    vi.mocked(useFocusEffect).mockImplementation((effect) => { focusEffects.push(effect); });
    const view = await renderScreen();
    // The first focus is the mount, which the initial load already covers.
    await act(async () => { focusEffects.at(-1)?.(); });
    await settle();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(view.getByText("2")).toBeTruthy();

    let answer: (value: Response) => void = () => {};
    api.get.mockReturnValue(new Promise<Response>((resolve) => { answer = resolve; }));
    await act(async () => { focusEffects.at(-1)?.(); });
    // A focus refetch keeps the pull spinner off.
    expect(view.getByTestId("conversation-list").props.refreshControl.props.refreshing).toBe(false);
    await act(async () => { answer(page([conversation(first, 0)])); });
    await settle();

    expect(view.queryByText("2")).toBeNull();
  });

  it("refetches on pull to refresh", async () => {
    const view = await renderScreen();
    const refreshing = () => view.getByTestId("conversation-list").props.refreshControl.props.refreshing as boolean;
    let answer: (value: Response) => void = () => {};
    api.get.mockClear().mockReturnValue(new Promise<Response>((resolve) => { answer = resolve; }));

    await act(async () => { view.getByTestId("conversation-list").props.refreshControl.props.onRefresh(); });
    expect(refreshing()).toBe(true);
    await act(async () => { answer(page([conversation(first, 0)])); });
    await settle();

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(refreshing()).toBe(false);
    expect(view.queryByText("2")).toBeNull();
  });

  it("loads the next page when the list reaches its end", async () => {
    const second = "00000000-0000-4000-8000-0000000000c2";
    api.get.mockReset().mockImplementation((url: string) => Promise.resolve(
      url.includes("cursor=") ? page([{ ...conversation(second, 0), peer: { id: PEER, displayName: "Aman" } }])
        : { ...page([conversation(first, 0)]), nextCursor: "next" },
    ));
    const view = await renderScreen();
    expect(view.queryByText("Aman")).toBeNull();

    await act(async () => { view.getByTestId("conversation-list").props.onEndReached(); });
    await settle();

    expect(api.get).toHaveBeenLastCalledWith("/conversations?limit=20&cursor=next", expect.anything());
    expect(view.getByText("Aman")).toBeTruthy();
  });

  it("has no Support row, help link or Help icon", async () => {
    const view = await renderScreen();
    expect(view.queryByText(/support|help/i)).toBeNull();
    expect(view.queryByRole("button", { name: /support|help/i })).toBeNull();
  });
});

describe("Messages tab button", () => {
  const routes = ["(search)", "favorites", "sell", "chat", "services"].map((name) => ({ key: name, name, params: undefined }));
  function renderTabBar(locale: string) {
    const props = {
      state: { index: 0, key: "tabs", routes },
      descriptors: Object.fromEntries(routes.map((route) => [route.key, { options: {} }])),
      navigation: { emit: vi.fn(() => ({ defaultPrevented: false })), dispatch: vi.fn() },
    } as unknown as BottomTabBarProps;
    return renderMobile(<AutoTmTabBar {...props} />, { locale });
  }

  it("reads Messages / Сообщения / Habarlar", () => {
    expect(renderTabBar("en").getByRole("tab", { name: "Messages" })).toBeTruthy();
    expect(renderTabBar("ru").getByRole("tab", { name: "Сообщения" })).toBeTruthy();
    expect(renderTabBar("tk").getByRole("tab", { name: "Habarlar" })).toBeTruthy();
  });
});
