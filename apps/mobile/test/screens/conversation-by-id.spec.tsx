import { useState, type PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { Image } from "expo-image";
import { Modal } from "react-native";
import type { ConversationsSchemas, ListingsSchemas } from "@auto-tm/contracts";
import { waitFor } from "@testing-library/react-native";

import { act, fireEvent, renderMobile, routeParams, routerMock, within } from "../render";
import ConversationDetailScreen from "../../app/conversations/[id]";
import { seedConversationDetail } from "../../src/api/conversations/useConversation";
import { ApiError } from "../../src/api/client";
import { useAuthIntentStore } from "../../src/auth/intentStore";
import type * as ClientModule from "../../src/api/client";

const CONVERSATION_ID = "00000000-0000-4000-8000-0000000000c1";
const LISTING_ID = "00000000-0000-4000-8000-0000000000a1";
const BUYER_ID = "00000000-0000-4000-8000-0000000000b1";
const SELLER_ID = "00000000-0000-4000-8000-0000000000b2";
const SELLER_PHONE = "+99361000000";

const state = vi.hoisted(() => ({
  viewerId: "",
  viewerLoading: false,
  get: vi.fn(),
  post: vi.fn(),
  readMessages: vi.fn(),
  messages: {
    data: { pages: [{ items: [] as unknown[] }] } as unknown,
    isPending: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
  },
  mutation: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  socket: { sendTextMessage: vi.fn(), sendImageMessage: vi.fn() },
  toast: vi.fn(),
  clipboard: vi.fn(async (_text: string) => true),
  reportSheet: { current: null as null | { messageId: string; open: boolean; onReported: (id: string) => void } },
}));

vi.mock("../../src/auth/useViewer", () => ({
  useViewer: () => state.viewerLoading ? undefined : (state.viewerId ? { userId: state.viewerId } : null),
}));
vi.mock("../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  apiClient: { get: state.get, post: state.post, delete: vi.fn() },
}));
vi.mock("../../src/api/conversations/useConversationMessages", () => ({
  useConversationMessages: (options: { conversationId: string }) => {
    state.readMessages(options);
    return state.messages;
  },
}));
vi.mock("../../src/api/conversations/useSendTextMessage", () => ({ useSendTextMessage: () => state.mutation }));
vi.mock("../../src/api/conversations/useSendImageMessage", () => ({ useSendImageMessage: () => state.mutation }));
vi.mock("../../src/api/conversations/usePresignChatAttachment", () => ({ usePresignChatAttachment: () => state.mutation }));
vi.mock("../../src/api/conversations/useUpdateWatermark", () => ({ useUpdateWatermark: () => state.mutation }));
vi.mock("../../src/api/conversations/useDeleteMessage", () => ({ useDeleteMessage: () => state.mutation }));
vi.mock("../../src/api/conversations/useMuteConversation", () => ({ useMuteConversation: () => state.mutation }));
vi.mock("../../src/api/identity/useBlockUser", () => ({ useBlockUser: () => state.mutation }));
vi.mock("../../src/api/identity/useUnblockUser", () => ({ useUnblockUser: () => state.mutation }));
vi.mock("../../src/auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true, phone: "" }) }));
vi.mock("../../src/api/catalog/useBrands", () => ({
  useBrands: () => ({ data: { items: [{ id: "00000000-0000-4000-8000-0000000000d1", name: "Toyota" }] } }),
}));
vi.mock("../../src/api/catalog/useModels", () => ({
  useModels: () => ({ data: { items: [{ id: "00000000-0000-4000-8000-0000000000d2", name: "Camry" }] } }),
}));
vi.mock("../../src/conversations/socket/useConversationSocket", () => ({
  useConversationSocket: () => ({
    peerTyping: false,
    peerPresence: { online: true },
    signalTyping: vi.fn(),
    stopTyping: vi.fn(),
    sendTextMessage: state.socket.sendTextMessage,
    sendImageMessage: state.socket.sendImageMessage,
    markRead: vi.fn(async () => ({ ok: true })),
    deleteMessage: vi.fn(),
  }),
}));
vi.mock("../../src/conversations/components/useConversationCatalogMaps", () => ({
  useConversationCatalogMaps: () => ({ brandName: () => undefined, modelName: () => undefined }),
}));
vi.mock("../../src/admin/components/MessageReportSheet", () => ({
  MessageReportSheet: (props: { messageId: string; open: boolean; onReported: (id: string) => void }) => {
    state.reportSheet.current = props;
    return null;
  },
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: state.toast }) }));
vi.mock("expo-clipboard", () => ({ setStringAsync: state.clipboard }));
vi.mock("../../lib/theme", () => ({
  THEME: { light: { mutedForeground: "0 0% 45%" }, dark: { mutedForeground: "0 0% 60%" } },
}));
vi.mock("../../src/conversations/upload/chatImageUpload", () => ({
  uploadChatImageToPresignedUrl: vi.fn(async () => {}),
  compressChatImage: vi.fn(async () => ({ uri: "file:///staged.jpg", fileSize: 1000, width: 800, height: 600 })),
  getChatImageStagingPath: vi.fn(() => "file:///staged.jpg"),
  ensureChatStagingDir: vi.fn(async () => {}),
  ChatImageUploadError: class extends Error {},
}));
vi.mock("expo-image-picker", () => ({
  useMediaLibraryPermissions: () => [{ granted: true }, vi.fn()],
  launchImageLibraryAsync: vi.fn(async () => ({ canceled: false, assets: [{ uri: "file:///picked.jpg" }] })),
}));
vi.mock("expo-file-system/legacy", () => ({
  deleteAsync: vi.fn(async () => {}),
  getInfoAsync: vi.fn(async () => ({ exists: true, size: 1000 })),
}));
vi.mock("expo-linking", () => ({
  canOpenURL: vi.fn(async () => true),
  openURL: vi.fn(async () => {}),
  openSettings: vi.fn(),
}));

function conversation(
  updates: Partial<ConversationsSchemas.GetConversationResponse> = {},
): ConversationsSchemas.GetConversationResponse {
  return {
    id: CONVERSATION_ID,
    listing: {
      id: LISTING_ID,
      brandId: "00000000-0000-4000-8000-0000000000d1",
      modelId: "00000000-0000-4000-8000-0000000000d2",
      year: 2018,
      displayPriceTmt: 285000,
      priceCurrency: "TMT",
      status: "active",
    },
    buyerId: BUYER_ID,
    sellerId: SELLER_ID,
    myRole: "buyer",
    peer: { id: SELLER_ID, displayName: "Merdan" },
    blockedByMe: false,
    updatedAt: "2026-10-01T10:00:00.000Z",
    unreadCount: 0,
    mutedAt: null,
    sendRestriction: null,
    ...updates,
  };
}

function listingDetail(
  updates: Partial<ListingsSchemas.ListingDetail> = {},
): Partial<ListingsSchemas.ListingDetail> {
  return { id: LISTING_ID, status: "active", allowCalls: true, contactPhone: SELLER_PHONE, ...updates };
}

/** Answers GET by path; anything unrouted stays pending, like a slow network. */
function routeGet(routes: Record<string, () => unknown>) {
  state.get.mockImplementation((path: string) => {
    const route = routes[path];
    return route ? Promise.resolve().then(route) : new Promise(() => {});
  });
}

beforeEach(() => {
  state.viewerId = BUYER_ID;
  state.get.mockReset();
  state.post.mockReset();
  state.mutation.mutate.mockReset();
  state.messages.isPending = false;
  state.messages.isError = false;
  state.messages.error = null;
  state.messages.data = { pages: [{ items: [] }] };
  state.messages.refetch.mockReset();
  state.messages.hasNextPage = false;
  state.messages.isFetchingNextPage = false;
  state.messages.isFetchNextPageError = false;
  state.messages.fetchNextPage.mockReset();
  state.socket.sendTextMessage.mockReset();
  state.socket.sendImageMessage.mockReset();
  state.mutation.mutateAsync.mockReset();
  state.toast.mockReset();
  state.clipboard.mockClear();
  state.reportSheet.current = null;
  vi.mocked(Linking.openURL).mockClear();
  routeParams.id = CONVERSATION_ID;
  useAuthIntentStore.setState({ intent: null, replayAction: null, replayReturnTo: null });
});

describe("Conversation opened with only its ID", () => {
  it("loads the header and Listing strip by ID, as from a push", async () => {
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () => conversation(),
      [`/listings/${LISTING_ID}`]: () => listingDetail(),
    });
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Merdan")).toBeTruthy();
    expect(screen.getByText("M", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("online")).toBeTruthy();
    expect(screen.getByText("2018 Toyota Camry")).toBeTruthy();
    expect(screen.getByText("285,000 TMT")).toBeTruthy();
    expect(screen.getByText("No messages yet. Start the conversation.")).toBeTruthy();
    expect(screen.queryByText("Messages")).toBeNull();
    expect(state.get).toHaveBeenCalledWith(`/conversations/${CONVERSATION_ID}`, expect.anything());
  });

  it("opens the Listing from the strip", async () => {
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = renderMobile(<ConversationDetailScreen />);

    fireEvent.press(await screen.findByRole("button", { name: "Open: 2018 Toyota Camry, 285,000 TMT" }));
    expect(routerMock.push).toHaveBeenCalledWith(`/(public)/listings/${LISTING_ID}`);
  });

  it("shows header and strip skeletons while the Conversation loads", () => {
    routeGet({});
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(screen.getByTestId("conversation-header-skeleton")).toBeTruthy();
    expect(screen.getByTestId("conversation-listing-skeleton")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go back" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conversation actions" })).toBeNull();
  });

  it("shows ErrorState with Retry when the Conversation fails to load", async () => {
    state.get.mockRejectedValue(new Error("offline"));
    const screen = renderMobile(<ConversationDetailScreen />);

    const retry = await screen.findByRole("button", { name: /Retry|Try again/ });
    expect(screen.queryByTestId("conversation-header-skeleton")).toBeNull();
    expect(screen.queryByText("Is the car still available?")).toBeNull();
    state.get.mockClear();
    await act(async () => {
      fireEvent.press(retry);
    });
    expect(state.get).toHaveBeenCalledWith(`/conversations/${CONVERSATION_ID}`, expect.anything());
  });

  it("shows ErrorState with Retry when the Messages fail to load", async () => {
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    // A first load that fails has no pages to show.
    state.messages.data = undefined;
    state.messages.isError = true;
    state.messages.error = new Error("offline");
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Merdan")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: /Retry|Try again/ }));
    expect(state.messages.refetch).toHaveBeenCalled();
  });
});

describe("Conversation opened from cached data", () => {
  it("draws the header and strip at once from the seeded summary, then refreshes", async () => {
    let resolveDetail: (value: unknown) => void = () => {};
    state.get.mockImplementation((path: string) =>
      path === `/conversations/${CONVERSATION_ID}`
        ? new Promise((resolve) => { resolveDetail = resolve; })
        : new Promise(() => {}),
    );
    // A list row or an open response: the summary without the send restriction.
    const { sendRestriction, ...summary } = conversation({ peer: { id: SELLER_ID, displayName: "Cached" } });
    expect(sendRestriction).toBeNull();
    function Seeded({ children }: PropsWithChildren) {
      const queryClient = useQueryClient();
      useState(() => seedConversationDetail(queryClient, summary));
      return children;
    }
    const screen = renderMobile(<Seeded><ConversationDetailScreen /></Seeded>);

    expect(screen.getByText("Cached")).toBeTruthy();
    expect(screen.getByText("2018 Toyota Camry")).toBeTruthy();
    expect(screen.queryByTestId("conversation-header-skeleton")).toBeNull();
    expect(state.get).toHaveBeenCalledWith(`/conversations/${CONVERSATION_ID}`, expect.anything());

    await act(async () => {
      resolveDetail(conversation({ peer: { id: SELLER_ID, displayName: "Fresh" } }));
    });
    expect(await screen.findByText("Fresh")).toBeTruthy();
  });
});

describe("Conversation header Call", () => {
  it("dials the Listing contact phone for the buyer of an active Listing that allows calls", async () => {
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () => conversation(),
      [`/listings/${LISTING_ID}`]: () => listingDetail(),
    });
    const screen = renderMobile(<ConversationDetailScreen />);

    const call = await screen.findByRole("button", { name: "Call the seller" });
    await act(async () => {
      fireEvent.press(call);
    });
    expect(Linking.openURL).toHaveBeenCalledWith(`tel:${SELLER_PHONE}`);
  });

  it("shows no Call to the seller and never reads the Listing contact", async () => {
    state.viewerId = SELLER_ID;
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () =>
        conversation({ myRole: "seller", peer: { id: BUYER_ID, displayName: null } }),
      [`/listings/${LISTING_ID}`]: () => listingDetail(),
    });
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Buyer")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Call the seller" })).toBeNull();
    expect(state.get).not.toHaveBeenCalledWith(`/listings/${LISTING_ID}`, expect.anything());
  });

  it.each([
    ["calls are off", listingDetail({ allowCalls: false })],
    ["there is no contact phone", listingDetail({ contactPhone: undefined })],
    ["the Listing is sold", listingDetail({ status: "sold" })],
  ])("hides Call when %s", async (_case, detail) => {
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () => conversation(),
      [`/listings/${LISTING_ID}`]: () => detail,
    });
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Merdan")).toBeTruthy();
    // Let the Listing detail answer reach the screen before asserting Call stays hidden.
    await vi.waitFor(() =>
      expect(state.get).toHaveBeenCalledWith(`/listings/${LISTING_ID}`, expect.anything()),
    );
    await act(async () => {
      const index = state.get.mock.calls.findIndex(([path]) => path === `/listings/${LISTING_ID}`);
      await state.get.mock.results[index]?.value;
    });
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Call the seller" })).toBeNull();
  });

  it("hides Call and shows the unavailable strip when the Listing is gone", async () => {
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () =>
        conversation({ listing: null, peer: { id: SELLER_ID, displayName: null } }),
    });
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Private seller")).toBeTruthy();
    expect(screen.getByText("Listing unavailable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Open:/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Call the seller" })).toBeNull();
  });
});

const QUICK_REPLY = "Is the car still available?";

function serverMessage(id: string, senderId: string, createdAt = "2026-10-01T10:00:00.000Z", text = id) {
  return { id, conversationId: CONVERSATION_ID, senderId, kind: "text", text, createdAt, deletedAt: null };
}

describe("Conversation quick replies", () => {
  it("stay for the buyer after the buyer's own Messages", async () => {
    state.messages.data = { pages: [{ items: [serverMessage("hello", BUYER_ID)], nextCursor: null }] };
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText(QUICK_REPLY)).toBeTruthy();
  });

  it("fill the composer on tap and send nothing by themselves", async () => {
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = renderMobile(<ConversationDetailScreen />);

    fireEvent.press(await screen.findByRole("button", { name: QUICK_REPLY }));
    expect(screen.getByDisplayValue(QUICK_REPLY)).toBeTruthy();
    expect(state.socket.sendTextMessage).not.toHaveBeenCalled();
  });

  it("go once the seller has replied", async () => {
    state.messages.data = {
      pages: [{ items: [serverMessage("reply", SELLER_ID), serverMessage("hello", BUYER_ID)], nextCursor: null }],
    };
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Merdan")).toBeTruthy();
    expect(screen.queryByText(QUICK_REPLY)).toBeNull();
  });

  it("are never shown to the seller", async () => {
    state.viewerId = SELLER_ID;
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () =>
        conversation({ myRole: "seller", peer: { id: BUYER_ID, displayName: null } }),
    });
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Buyer")).toBeTruthy();
    expect(screen.queryByText(QUICK_REPLY)).toBeNull();
  });

  it("are not shown when the viewer cannot send", async () => {
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () => conversation({ sendRestriction: "chat_disabled" }),
    });
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Merdan")).toBeTruthy();
    expect(screen.queryByText(QUICK_REPLY)).toBeNull();
  });
});

describe("Conversation history", () => {
  it("loads older Messages at the top of the history", async () => {
    state.messages.data = { pages: [{ items: [serverMessage("hello", BUYER_ID)], nextCursor: "next" }] };
    state.messages.hasNextPage = true;
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("hello")).toBeTruthy();
    screen.UNSAFE_getByProps({ inverted: true }).props.onEndReached();
    expect(state.messages.fetchNextPage).toHaveBeenCalledOnce();
  });

  it("shows a loading row while an older page loads", async () => {
    state.messages.data = { pages: [{ items: [serverMessage("hello", BUYER_ID)], nextCursor: "next" }] };
    state.messages.hasNextPage = true;
    state.messages.isFetchingNextPage = true;
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("hello")).toBeTruthy();
    expect(screen.getByLabelText("Loading earlier messages")).toBeTruthy();
  });

  it("keeps the loaded Messages when an older page fails and retries that page", async () => {
    // TanStack Query keeps the pages and sets isError when fetchNextPage fails.
    state.messages.data = { pages: [{ items: [serverMessage("hello", BUYER_ID)], nextCursor: "next" }] };
    state.messages.hasNextPage = true;
    state.messages.isError = true;
    state.messages.isFetchNextPageError = true;
    state.messages.error = new Error("offline");
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("hello")).toBeTruthy();
    expect(screen.getByText("Could not load earlier messages")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(state.messages.fetchNextPage).toHaveBeenCalledOnce();
    expect(state.messages.refetch).not.toHaveBeenCalled();
  });

  it("does not refetch an older page on reaching the top after it failed, only Retry does", async () => {
    // The failed row changes the list height, which re-fires onEndReached near the top.
    state.messages.data = { pages: [{ items: [serverMessage("hello", BUYER_ID)], nextCursor: "next" }] };
    state.messages.hasNextPage = true;
    state.messages.isError = true;
    state.messages.isFetchNextPageError = true;
    state.messages.error = new Error("offline");
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("hello")).toBeTruthy();
    screen.UNSAFE_getByProps({ inverted: true }).props.onEndReached();
    expect(state.messages.fetchNextPage).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(state.messages.fetchNextPage).toHaveBeenCalledOnce();
  });
});

describe("Conversation persisted image addressing", () => {
  const storedKey = `chat-attachments/${CONVERSATION_ID}/00000000-0000-4000-8000-0000000000e1/original.jpg`;
  const expectedUri = `https://media.autotm.tm/chat-attachments/${storedKey}`;

  async function openStoredImage() {
    // A history response has a storage key, with no local staging URI or ready-made URL.
    const persistedImage: ConversationsSchemas.MessageSummary = {
      id: "00000000-0000-4000-8000-0000000000e2",
      conversationId: CONVERSATION_ID,
      senderId: SELLER_ID,
      kind: "image",
      text: null,
      metadata: { key: storedKey, width: 800, height: 600 },
      createdAt: "2026-10-01T09:00:00.000Z",
    };
    state.messages.data = { pages: [{ items: [persistedImage], nextCursor: null }] };
    // Keep this regression's network boundary finite, including unexpected requests.
    state.get.mockImplementation(async (path: string) => {
      if (path === `/conversations/${CONVERSATION_ID}`) return conversation();
      if (path === `/listings/${LISTING_ID}`) return listingDetail();
      if (path === "/config") {
        return { reportEntryEnabled: false, adminModerationActionsEnabled: false, inspectionInterestEnabled: false };
      }
      throw new Error(`Unexpected image-history read: ${path}`);
    });
    const screen = renderMobile(<ConversationDetailScreen />);
    const photo = await screen.findByRole("imagebutton", { name: "Photo" });
    return { screen, photo };
  }

  it("renders the full persisted object key after the bucket in the Message bubble", async () => {
    const { screen, photo } = await openStoredImage();

    expect(state.readMessages).toHaveBeenLastCalledWith({ conversationId: CONVERSATION_ID });
    expect(within(photo).UNSAFE_getByType(Image).props.source).toEqual({ uri: expectedUri });
    expect(screen.queryByLabelText("Close")).toBeNull();
  });

  it("opens the same persisted object in the real fullscreen viewer and closes it", async () => {
    const { screen, photo } = await openStoredImage();

    fireEvent.press(photo);
    const viewer = screen.UNSAFE_getByType(Modal);
    expect(viewer.props.visible).toBe(true);
    expect(within(viewer).UNSAFE_getByType(Image).props.source).toEqual({ uri: expectedUri });

    fireEvent.press(within(viewer).getByLabelText("Close"));
    expect(screen.queryByLabelText("Close")).toBeNull();
    expect(within(screen.getByRole("imagebutton", { name: "Photo" })).UNSAFE_getByType(Image).props.source)
      .toEqual({ uri: expectedUri });
  });
});

describe("Conversation Retry", () => {
  it("resends a failed text Message with the same client Message ID", async () => {
    state.socket.sendTextMessage
      .mockResolvedValueOnce({ ok: false, code: "INTERNAL" })
      .mockResolvedValueOnce({ ok: true, message: { id: "server-1" } });
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = renderMobile(<ConversationDetailScreen />);

    fireEvent.changeText(await screen.findByPlaceholderText("Message"), "Still there?");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    });
    expect(await screen.findByText("Failed to send")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    });

    const [first, second] = state.socket.sendTextMessage.mock.calls.map(([args]) => args);
    expect(second).toEqual({ conversationId: CONVERSATION_ID, text: "Still there?", clientMessageId: first.clientMessageId });
  });

  it("resends a failed image Message with the same client Message ID", async () => {
    state.mutation.mutateAsync.mockResolvedValue({ uploadUrl: "https://upload", key: "chat-attachments/k.jpg" });
    state.socket.sendImageMessage
      .mockResolvedValueOnce({ ok: false, code: "INTERNAL" })
      .mockResolvedValueOnce({ ok: true, message: { id: "server-2" } });
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = renderMobile(<ConversationDetailScreen />);

    await act(async () => {
      // The attach button's label is matched loosely: it reads its key from another namespace today.
      fireEvent.press(await screen.findByLabelText(/attach/i));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    });
    expect(await screen.findByText("Failed to send")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    });

    const [first, second] = state.socket.sendImageMessage.mock.calls.map(([args]) => args);
    expect(second.clientMessageId).toBe(first.clientMessageId);
  });
});

describe("Conversation menu", () => {
  it("reports the other participant as a User and ends on the thanks screen", async () => {
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    state.post.mockResolvedValue({
      reportId: "00000000-0000-4000-8000-0000000000e1",
      status: "pending",
      createdAt: "2026-10-02T10:00:00.000Z",
      reusedExisting: false,
    });
    const screen = renderMobile(<ConversationDetailScreen />);

    fireEvent.press(await screen.findByRole("button", { name: "Conversation actions" }));
    fireEvent.press(screen.getByRole("button", { name: "Report" }));

    // The reasons the API accepts for a User report.
    for (const reason of ["Spam", "Scam or fraud", "Misleading information", "Harassment", "Other"]) {
      expect(screen.getByRole("radio", { name: reason })).toBeTruthy();
    }
    expect(screen.queryByRole("radio", { name: "Wrong category" })).toBeNull();

    fireEvent.press(screen.getByRole("radio", { name: "Other" }));
    fireEvent.changeText(screen.getByPlaceholderText("Describe the issue..."), "Asks for prepayment");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Submit report" }));
    });

    expect(state.post).toHaveBeenCalledWith(
      `/users/${SELLER_ID}/report`,
      { reason: "other", details: "Asks for prepayment" },
      expect.anything(),
    );
    expect(await screen.findByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("ends on the thanks screen when a pending report of the same User is reused", async () => {
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    state.post.mockResolvedValue({
      reportId: "00000000-0000-4000-8000-0000000000e1",
      status: "pending",
      createdAt: "2026-10-01T10:00:00.000Z",
      reusedExisting: true,
    });
    const screen = renderMobile(<ConversationDetailScreen />);

    fireEvent.press(await screen.findByRole("button", { name: "Conversation actions" }));
    fireEvent.press(screen.getByRole("button", { name: "Report" }));
    fireEvent.press(screen.getByRole("radio", { name: "Spam" }));
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Submit report" }));
    });

    expect(state.post).toHaveBeenCalledWith(`/users/${SELLER_ID}/report`, { reason: "spam" }, expect.anything());
    expect(await screen.findByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("hides Report when reporting is switched off for the environment", async () => {
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () => conversation(),
      "/config": () => ({
        reportEntryEnabled: false,
        adminModerationActionsEnabled: false,
        inspectionInterestEnabled: false,
      }),
    });
    const screen = renderMobile(<ConversationDetailScreen />);

    await vi.waitFor(() => expect(state.get).toHaveBeenCalledWith("/config", expect.anything()));
    await act(async () => {});
    fireEvent.press(await screen.findByRole("button", { name: "Conversation actions" }));
    expect(screen.getByRole("button", { name: "Block user" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  });

  it("asks before blocking, then replaces the composer with the blocked banner", async () => {
    // The refresh after Block stays pending, so only the cache patch can switch the footer.
    let refreshing = false;
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () => (refreshing ? new Promise(() => {}) : conversation()),
    });
    state.mutation.mutate.mockImplementation((_input: unknown, options?: { onSuccess?: () => void }) => {
      refreshing = true;
      options?.onSuccess?.();
    });
    const screen = renderMobile(<ConversationDetailScreen />);

    fireEvent.press(await screen.findByRole("button", { name: "Conversation actions" }));
    fireEvent.press(screen.getByRole("button", { name: "Block user" }));
    expect(screen.getByText("Block this user?")).toBeTruthy();
    expect(
      screen.getByText("You will stop receiving messages and notifications from this user. The history stays."),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText("Block"));
    });

    expect(state.mutation.mutate).toHaveBeenCalledWith({ userId: SELLER_ID }, expect.anything());
    expect(screen.getByText("User blocked")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
  });
});

describe("Conversation blocked by the viewer", () => {
  const blocked = () => conversation({ blockedByMe: true, sendRestriction: "blocked_by_me" });

  it("shows only the banner under readable Messages, from the loaded Conversation", async () => {
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: blocked });
    state.messages.data = {
      pages: [
        {
          items: [
            {
              id: "00000000-0000-4000-8000-0000000000f1",
              conversationId: CONVERSATION_ID,
              senderId: SELLER_ID,
              kind: "text",
              text: "Yes, it is available",
              createdAt: "2026-10-01T09:00:00.000Z",
            },
          ],
        },
      ],
    };
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("User blocked")).toBeTruthy();
    expect(screen.getByText("Yes, it is available")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Attach photo" })).toBeNull();
    expect(state.get).not.toHaveBeenCalledWith(`/me/blocked-users/${SELLER_ID}`, expect.anything());
  });

  it("asks before unblocking and brings the composer back without reloading", async () => {
    // The refresh after Unblock stays pending, so only the cache patch can bring the composer back.
    let refreshing = false;
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => (refreshing ? new Promise(() => {}) : blocked()) });
    state.mutation.mutate.mockImplementation((_input: unknown, options?: { onSuccess?: () => void }) => {
      refreshing = true;
      options?.onSuccess?.();
    });
    const screen = renderMobile(<ConversationDetailScreen />);

    fireEvent.press(await screen.findByRole("button", { name: "Unblock" }));
    expect(screen.getByText("Unblock this user?")).toBeTruthy();
    expect(screen.getByText("After unblocking, the user can message you again.")).toBeTruthy();
    await act(async () => {
      // The banner's Unblock, then the dialog's.
      const [, confirm] = screen.getAllByText("Unblock");
      fireEvent.press(confirm);
    });

    expect(state.mutation.mutate).toHaveBeenCalledWith({ userId: SELLER_ID }, expect.anything());
    expect(screen.queryByText("User blocked")).toBeNull();
    expect(screen.getByRole("button", { name: "Send message" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Attach photo", disabled: false })).toBeTruthy();
  });
});

describe("Conversation while signed out", () => {
  const conversationHref = { pathname: "/conversations/[id]", params: { id: CONVERSATION_ID } };

  beforeEach(() => {
    state.viewerLoading = false;
    state.viewerId = "";
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () => conversation(),
      [`/listings/${LISTING_ID}`]: () => listingDetail(),
    });
  });

  it("asks to sign in and reads nothing", async () => {
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(screen.getByText("Sign in to view messages")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go back" })).toBeTruthy();
    await act(async () => {});
    expect(state.get).not.toHaveBeenCalledWith(`/conversations/${CONVERSATION_ID}`, expect.anything());
    expect(state.readMessages).toHaveBeenLastCalledWith({ conversationId: "" });
    expect(screen.queryByText("Merdan")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("waits for auth hydration before painting a seeded Conversation", async () => {
    state.viewerLoading = true;
    const { sendRestriction, ...summary } = conversation();
    expect(sendRestriction).toBeNull();
    function Seeded({ children }: PropsWithChildren) {
      const queryClient = useQueryClient();
      useState(() => seedConversationDetail(queryClient, summary));
      return children;
    }
    const screen = renderMobile(<Seeded><ConversationDetailScreen /></Seeded>);
    expect(screen.queryByText("Merdan")).toBeNull();
    expect(state.readMessages).toHaveBeenLastCalledWith({ conversationId: "" });
    expect(state.get).not.toHaveBeenCalledWith(`/conversations/${CONVERSATION_ID}`, expect.anything());
    state.viewerLoading = false;
    state.viewerId = BUYER_ID;
    screen.rerender(<Seeded><ConversationDetailScreen /></Seeded>);
    expect(await screen.findByText("Merdan")).toBeTruthy();
  });

  it("signs in and returns to the same Conversation, which then loads", async () => {
    const screen = renderMobile(<ConversationDetailScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/(auth)/phone",
      params: { authRoot: "1" },
    });
    expect(useAuthIntentStore.getState().intent).toEqual({ returnTo: conversationHref });

    useAuthIntentStore.getState().completeSignIn(routerMock);
    expect(routerMock.dismissTo).toHaveBeenCalledWith(conversationHref);

    state.viewerId = BUYER_ID;
    screen.rerender(<ConversationDetailScreen />);
    expect(await screen.findByText("Merdan")).toBeTruthy();
    expect(screen.queryByText("Sign in to view messages")).toBeNull();
  });

  it("returns to the signed-out state when sign-in is cancelled", () => {
    const screen = renderMobile(<ConversationDetailScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    useAuthIntentStore.getState().cancelSignIn(routerMock);

    expect(routerMock.dismissTo).toHaveBeenCalledWith(conversationHref);
    expect(screen.getByText("Sign in to view messages")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(routerMock.back).toHaveBeenCalledOnce();
  });
});

describe("Conversation not available", () => {
  it.each([
    ["does not exist", new ApiError("NOT_FOUND", 404, "Conversation not found")],
    ["is not the User's", new ApiError("FORBIDDEN", 403, "Not a participant", { reason: "NOT_A_PARTICIPANT" })],
  ])("shows Conversation not found when it %s", async (_case, error) => {
    state.get.mockRejectedValue(error);
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Conversation not found")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Retry|Try again/ })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Go to Messages" }));
    expect(routerMock.dismissTo).toHaveBeenCalledWith("/(tabs)/chat");
  });

  it("shows nothing from a cached Conversation the API no longer returns", async () => {
    state.get.mockRejectedValue(new ApiError("NOT_FOUND", 404, "Conversation not found"));
    const { sendRestriction, ...summary } = conversation();
    expect(sendRestriction).toBeNull();
    function Seeded({ children }: PropsWithChildren) {
      const queryClient = useQueryClient();
      useState(() => seedConversationDetail(queryClient, summary));
      return children;
    }
    const screen = renderMobile(<Seeded><ConversationDetailScreen /></Seeded>);

    expect(await screen.findByText("Conversation not found")).toBeTruthy();
    expect(screen.queryByText("Merdan")).toBeNull();
    expect(screen.queryByText("2018 Toyota Camry")).toBeNull();
    expect(screen.queryByRole("button", { name: "Conversation actions" })).toBeNull();
  });

  it("shows Conversation not found when the Messages read is refused", async () => {
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    state.messages.isError = true;
    state.messages.error = new ApiError("FORBIDDEN", 403, "Not a participant");
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Conversation not found")).toBeTruthy();
    expect(screen.queryByText("Merdan")).toBeNull();
  });
});

describe("Conversation Message actions", () => {
  const PEER_TEXT = "Call me after five";

  async function openPeerSheet(routes: Record<string, () => unknown> = {}) {
    state.messages.data = { pages: [{ items: [serverMessage("peer-1", SELLER_ID, undefined, PEER_TEXT)], nextCursor: null }] };
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation(), ...routes });
    const screen = renderMobile(<ConversationDetailScreen />);
    fireEvent(await screen.findByLabelText(new RegExp(`^${PEER_TEXT}`)), "longPress");
    return screen;
  }

  it("copies the Message text, closes the sheet and shows Copied", async () => {
    const screen = await openPeerSheet();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Copy" }));
    });
    expect(state.clipboard).toHaveBeenCalledWith(PEER_TEXT);
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copied" }));
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("shows Copied below the Conversation header at the height it is drawn", async () => {
    const screen = await openPeerSheet();
    fireEvent(screen.getByRole("button", { name: "Go back" }), "layout", { nativeEvent: { layout: { height: 96 } } });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Copy" }));
    });
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copied", topClearance: 96 }));
  });

  it("opens the report reasons for the Message, then shows Reported and offers Copy only", async () => {
    const screen = await openPeerSheet();

    fireEvent.press(screen.getByRole("button", { name: "Report message" }));
    expect(state.reportSheet.current).toMatchObject({ messageId: "peer-1", open: true });

    await act(async () => {
      state.reportSheet.current?.onReported("peer-1");
    });
    expect(screen.getByText("Reported")).toBeTruthy();

    fireEvent(screen.getByLabelText(new RegExp(`^${PEER_TEXT}.*Reported`)), "longPress");
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Report message" })).toBeNull();
  });

  it("hides Report message when reporting is switched off for the environment", async () => {
    const screen = await openPeerSheet({ "/config": () => ({ reportEntryEnabled: false }) });

    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Report message" })).toBeNull());
  });

  it("keeps the delete confirmation for an own Message", async () => {
    state.messages.data = { pages: [{ items: [serverMessage("own-1", BUYER_ID, new Date().toISOString(), "Hello")], nextCursor: null }] };
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = renderMobile(<ConversationDetailScreen />);

    fireEvent(await screen.findByLabelText(/^Hello/), "longPress");
    fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete message?")).toBeTruthy();
  });
});
