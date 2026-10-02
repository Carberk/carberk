import { useState, type PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import type { ConversationsSchemas, ListingsSchemas } from "@auto-tm/contracts";

import { act, fireEvent, renderMobile, routeParams, routerMock } from "../render";
import ConversationDetailScreen from "../../app/conversations/[id]";
import { seedConversationDetail } from "../../src/api/conversations/useConversation";
import type * as ClientModule from "../../src/api/client";

const CONVERSATION_ID = "00000000-0000-4000-8000-0000000000c1";
const LISTING_ID = "00000000-0000-4000-8000-0000000000a1";
const BUYER_ID = "00000000-0000-4000-8000-0000000000b1";
const SELLER_ID = "00000000-0000-4000-8000-0000000000b2";
const SELLER_PHONE = "+99361000000";

const state = vi.hoisted(() => ({
  viewerId: "",
  get: vi.fn(),
  messages: {
    data: { pages: [{ items: [] as unknown[] }] } as unknown,
    isPending: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  },
  mutation: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  socket: { sendTextMessage: vi.fn(), sendImageMessage: vi.fn() },
}));

vi.mock("../../src/auth/useViewer", () => ({ useViewer: () => ({ userId: state.viewerId }) }));
vi.mock("../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof ClientModule>()),
  apiClient: { get: state.get, post: vi.fn(), delete: vi.fn() },
}));
vi.mock("../../src/api/conversations/useConversationMessages", () => ({
  useConversationMessages: () => state.messages,
}));
vi.mock("../../src/api/conversations/useSendTextMessage", () => ({ useSendTextMessage: () => state.mutation }));
vi.mock("../../src/api/conversations/useSendImageMessage", () => ({ useSendImageMessage: () => state.mutation }));
vi.mock("../../src/api/conversations/usePresignChatAttachment", () => ({ usePresignChatAttachment: () => state.mutation }));
vi.mock("../../src/api/conversations/useUpdateWatermark", () => ({ useUpdateWatermark: () => state.mutation }));
vi.mock("../../src/api/conversations/useDeleteMessage", () => ({ useDeleteMessage: () => state.mutation }));
vi.mock("../../src/api/conversations/useMuteConversation", () => ({ useMuteConversation: () => state.mutation }));
vi.mock("../../src/api/identity/useBlockUser", () => ({ useBlockUser: () => state.mutation }));
vi.mock("../../src/api/identity/useUnblockUser", () => ({ useUnblockUser: () => state.mutation }));
vi.mock("../../src/api/identity/useIsBlocked", () => ({ useIsBlocked: () => ({ data: { blocked: false } }) }));
vi.mock("../../src/api/catalog/useBrands", () => ({
  useBrands: () => ({ data: { items: [{ id: "00000000-0000-4000-8000-0000000000d1", name: "Toyota" }] } }),
}));
vi.mock("../../src/api/catalog/useModels", () => ({
  useModels: () => ({ data: { items: [{ id: "00000000-0000-4000-8000-0000000000d2", name: "Camry" }] } }),
}));
vi.mock("../../src/navigation/useSafeBack", () => ({ useSafeBack: () => vi.fn() }));
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
vi.mock("../../src/conversations/components/ImagePreviewModal", () => ({ ImagePreviewModal: () => null }));
vi.mock("../../src/admin/components/MessageReportSheet", () => ({ MessageReportSheet: () => null }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));
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
  state.messages.isPending = false;
  state.messages.isError = false;
  state.messages.error = null;
  state.messages.data = { pages: [{ items: [] }] };
  state.messages.refetch.mockReset();
  state.messages.hasNextPage = false;
  state.messages.fetchNextPage.mockReset();
  state.socket.sendTextMessage.mockReset();
  state.socket.sendImageMessage.mockReset();
  state.mutation.mutateAsync.mockReset();
  vi.mocked(Linking.openURL).mockClear();
  routeParams.id = CONVERSATION_ID;
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

function serverMessage(id: string, senderId: string, createdAt = "2026-10-01T10:00:00.000Z") {
  return { id, conversationId: CONVERSATION_ID, senderId, kind: "text", text: id, createdAt, deletedAt: null };
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
