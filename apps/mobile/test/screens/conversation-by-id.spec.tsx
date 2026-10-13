import * as RN from "react-native";
import { useState, type PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { ConversationsSchemas, ListingsSchemas } from "@auto-tm/contracts";
import { waitFor } from "@testing-library/react-native";

import { activeKeyboardRegion } from "../keyboardAvoidance";
import { act, fireEvent, renderMobile, routeParams, routerMock, within, getAllHosts, getHost, first } from "../render";
import ConversationDetailScreen from "../../app/conversations/[id]";
import { queryKeys } from "../../src/api/queryKeys";
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
  cachedMessages: false,
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
  socket: { sendTextMessage: vi.fn(), sendImageMessage: vi.fn(), deleteMessage: vi.fn() },
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
vi.mock("../../src/api/conversations/useConversationMessages", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useConversationMessages: (options: { conversationId: string }) => {
    state.readMessages(options);
    const cached = useQuery({
      queryKey: queryKeys.conversations.messages(options.conversationId),
      queryFn: async () => state.messages.data,
      enabled: state.cachedMessages,
      initialData: state.cachedMessages ? state.messages.data : undefined,
      staleTime: 30_000,
    });
    return state.cachedMessages ? { ...state.messages, ...cached } : { ...state.messages, data: cached.data ?? state.messages.data };
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
    sendTextMessage: async (input: { conversationId: string; text: string; clientMessageId: string }) => {
      const ack = await state.socket.sendTextMessage(input);
      return ack?.ok ? { ...ack, message: { ...serverMessage(ack.message.id, state.viewerId, new Date().toISOString(), input.text), clientMessageId: input.clientMessageId, ...ack.message } } : ack;
    },
    sendImageMessage: async (input: { conversationId: string; metadata: unknown; clientMessageId: string }) => {
      const ack = await state.socket.sendImageMessage(input);
      return ack?.ok ? { ...ack, message: { ...serverMessage(ack.message.id, state.viewerId, new Date().toISOString()), kind: "image", text: null, metadata: input.metadata, clientMessageId: input.clientMessageId, ...ack.message } } : ack;
    },
    markRead: vi.fn(async () => ({ ok: true })),
    deleteMessage: state.socket.deleteMessage,
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
  compressChatImage: vi.fn(async () => ({ uri: "file:///staged.webp", fileSize: 1000, width: 800, height: 600 })),
  getChatImageStagingPath: vi.fn(() => "file:///staged.webp"),
  ensureChatStagingDir: vi.fn(async () => {}),
  ChatImageUploadError: class extends Error {},
}));
vi.mock("expo-image-picker", () => ({
  useMediaLibraryPermissions: () => [{ granted: true }, vi.fn()],
  launchImageLibraryAsync: vi.fn(async () => ({ canceled: false, assets: [{ uri: "file:///picked.webp" }] })),
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

/** The other participant: Merdan, who has no photo, unless `updates` says otherwise. */
function peer(
  id: string,
  updates: Partial<ConversationsSchemas.ConversationPeer> = {},
): ConversationsSchemas.ConversationPeer {
  return { id, displayName: "Merdan", nameNumber: 2057, avatarIndex: 7, avatarKey: null, deleted: false, ...updates };
}

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
    peer: peer(SELLER_ID),
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
  state.cachedMessages = false;
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
  state.socket.deleteMessage.mockReset();
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
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Merdan")).toBeTruthy();
    expect(screen.queryByText("M", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText("online")).toBeTruthy();
    expect(screen.getByText("Toyota Camry, 2018")).toBeTruthy();
    expect(screen.getByText("285,000 TMT")).toBeTruthy();
    expect(screen.getByText("No messages yet. Start the conversation.")).toBeTruthy();
    expect(screen.queryByText("Messages")).toBeNull();
    expect(state.get).toHaveBeenCalledWith(`/conversations/${CONVERSATION_ID}`, expect.anything());
  });

  it("opens the Listing from the strip", async () => {
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = await renderMobile(<ConversationDetailScreen />);

    await fireEvent.press(await screen.findByRole("button", { name: "Open: Toyota Camry, 2018, 285,000 TMT" }));
    expect(routerMock.push).toHaveBeenCalledWith(`/(public)/listings/${LISTING_ID}`);
  });

  it("shows header and strip skeletons while the Conversation loads", async () => {
    routeGet({});
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(screen.getByTestId("conversation-header-skeleton")).toBeTruthy();
    expect(screen.getByTestId("conversation-listing-skeleton")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go back" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conversation actions" })).toBeNull();
  });

  it("shows ErrorState with Retry when the Conversation fails to load", async () => {
    state.get.mockRejectedValue(new Error("offline"));
    const screen = await renderMobile(<ConversationDetailScreen />);

    const retry = await screen.findByRole("button", { name: /Retry|Try again/ });
    expect(screen.queryByTestId("conversation-header-skeleton")).toBeNull();
    expect(screen.queryByText("Is the car still available?")).toBeNull();
    state.get.mockClear();
    await act(async () => {
      void fireEvent.press(retry);
    });
    expect(state.get).toHaveBeenCalledWith(`/conversations/${CONVERSATION_ID}`, expect.anything());
  });

  it("shows ErrorState with Retry when the Messages fail to load", async () => {
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    // A first load that fails has no pages to show.
    state.messages.data = undefined;
    state.messages.isError = true;
    state.messages.error = new Error("offline");
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Merdan")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /Retry|Try again/ }));
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
    const { sendRestriction, ...summary } = conversation({ peer: peer(SELLER_ID, { displayName: "Cached" }) });
    expect(sendRestriction).toBeNull();
    function Seeded({ children }: PropsWithChildren) {
      const queryClient = useQueryClient();
      useState(() => seedConversationDetail(queryClient, summary));
      return children;
    }
    const screen = await renderMobile(<Seeded><ConversationDetailScreen /></Seeded>);

    expect(screen.getByText("Cached")).toBeTruthy();
    expect(screen.getByText("Toyota Camry, 2018")).toBeTruthy();
    expect(screen.queryByTestId("conversation-header-skeleton")).toBeNull();
    expect(state.get).toHaveBeenCalledWith(`/conversations/${CONVERSATION_ID}`, expect.anything());

    await act(async () => {
      resolveDetail(conversation({ peer: peer(SELLER_ID, { displayName: "Fresh" }) }));
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
    const screen = await renderMobile(<ConversationDetailScreen />);

    const call = await screen.findByRole("button", { name: "Call the seller" });
    await act(async () => {
      void fireEvent.press(call);
    });
    expect(Linking.openURL).toHaveBeenCalledWith(`tel:${SELLER_PHONE}`);
  });

  it("shows no Call to the seller and never reads the Listing contact", async () => {
    state.viewerId = SELLER_ID;
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () =>
        conversation({ myRole: "seller", peer: peer(BUYER_ID, { displayName: null }) }),
      [`/listings/${LISTING_ID}`]: () => listingDetail(),
    });
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Driver 2057")).toBeTruthy();
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
    const screen = await renderMobile(<ConversationDetailScreen />);

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
        conversation({ listing: null, peer: peer(SELLER_ID, { displayName: null }) }),
    });
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Driver 2057")).toBeTruthy();
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
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText(QUICK_REPLY)).toBeTruthy();
  });

  it("fill the composer on tap and send nothing by themselves", async () => {
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = await renderMobile(<ConversationDetailScreen />);

    await fireEvent.press(await screen.findByRole("button", { name: QUICK_REPLY }));
    expect(screen.getByDisplayValue(QUICK_REPLY)).toBeTruthy();
    expect(state.socket.sendTextMessage).not.toHaveBeenCalled();
  });

  it("go once the seller has replied", async () => {
    state.messages.data = {
      pages: [{ items: [serverMessage("reply", SELLER_ID), serverMessage("hello", BUYER_ID)], nextCursor: null }],
    };
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Merdan")).toBeTruthy();
    expect(screen.queryByText(QUICK_REPLY)).toBeNull();
  });

  it("are never shown to the seller", async () => {
    state.viewerId = SELLER_ID;
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () =>
        conversation({ myRole: "seller", peer: peer(BUYER_ID, { displayName: null }) }),
    });
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Driver 2057")).toBeTruthy();
    expect(screen.queryByText(QUICK_REPLY)).toBeNull();
  });

  it("are not shown when the viewer cannot send", async () => {
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () => conversation({ sendRestriction: "chat_disabled" }),
    });
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Merdan")).toBeTruthy();
    expect(screen.queryByText(QUICK_REPLY)).toBeNull();
  });
});

describe("Conversation history", () => {
  it("loads older Messages at the top of the history", async () => {
    state.messages.data = { pages: [{ items: [serverMessage("hello", BUYER_ID)], nextCursor: "next" }] };
    state.messages.hasNextPage = true;
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("hello")).toBeTruthy();
    getHost(screen.container, "RCTScrollView", { inverted: true }).props.onEndReached();
    expect(state.messages.fetchNextPage).toHaveBeenCalledOnce();
  });

  it("shows a loading row while an older page loads", async () => {
    state.messages.data = { pages: [{ items: [serverMessage("hello", BUYER_ID)], nextCursor: "next" }] };
    state.messages.hasNextPage = true;
    state.messages.isFetchingNextPage = true;
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = await renderMobile(<ConversationDetailScreen />);

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
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("hello")).toBeTruthy();
    expect(screen.getByText("Could not load earlier messages")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
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
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("hello")).toBeTruthy();
    getHost(screen.container, "RCTScrollView", { inverted: true }).props.onEndReached();
    expect(state.messages.fetchNextPage).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(state.messages.fetchNextPage).toHaveBeenCalledOnce();
  });
});

describe("Conversation persisted image addressing", () => {
  const storedKey = `chat-attachments/${CONVERSATION_ID}/00000000-0000-4000-8000-0000000000e1/original.webp`;
  const expectedUri = `https://media.autotm.tm/chat-attachments/${storedKey}`;

  async function openStoredImage(thumbHash?: string) {
    // A history response has a storage key, with no local staging URI or ready-made URL.
    const persistedImage: ConversationsSchemas.MessageSummary = {
      id: "00000000-0000-4000-8000-0000000000e2",
      conversationId: CONVERSATION_ID,
      senderId: SELLER_ID,
      kind: "image",
      text: null,
      metadata: { key: storedKey, width: 800, height: 600, ...(thumbHash ? { thumbHash } : {}) },
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
    const screen = await renderMobile(<ConversationDetailScreen />);
    const photo = await screen.findByRole("imagebutton", { name: "Photo" });
    return { screen, photo };
  }

  it("renders the full persisted object key after the bucket in the Message bubble", async () => {
    const { screen, photo } = await openStoredImage();

    expect(state.readMessages).toHaveBeenLastCalledWith({ conversationId: CONVERSATION_ID });
    expect(getHost(photo, "Image").props.source).toEqual({ uri: expectedUri });
    expect(screen.queryByLabelText("Close")).toBeNull();
  });

  it("shows the server's ThumbHash in the bubble while a persisted image loads", async () => {
    const { photo } = await openStoredImage("2yMBBYCIh4iHiHeAiId4dXh3f4f4");

    expect(getHost(photo, "Image").props.placeholder).toEqual({ thumbhash: "2yMBBYCIh4iHiHeAiId4dXh3f4f4" });
  });

  it("shows the server's cover ThumbHash on a persisted Listing-reference card", async () => {
    const persistedRef: ConversationsSchemas.MessageSummary = {
      id: "00000000-0000-4000-8000-0000000000e3",
      conversationId: CONVERSATION_ID,
      senderId: SELLER_ID,
      kind: "post_ref",
      text: null,
      metadata: {
        listingId: LISTING_ID, brandId: "brand-1", modelId: "model-1", displayPriceTmt: 285000, priceCurrency: "TMT",
        coverMediaKey: "pending/a/original.webp", coverThumbHash: "1fsDBYCIiIiHiIdweIeHh4d4cIgH", status: "active", available: true,
      },
      createdAt: "2026-10-01T09:00:00.000Z",
    };
    state.messages.data = { pages: [{ items: [persistedRef], nextCursor: null }] };
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation(), [`/listings/${LISTING_ID}`]: () => listingDetail() });
    const screen = await renderMobile(<ConversationDetailScreen />);

    await waitFor(() => {
      const placeholders = getAllHosts(screen.container, "Image").map((image) => image.props.placeholder as unknown);
      expect(placeholders).toContainEqual({ thumbhash: "1fsDBYCIiIiHiIdweIeHh4d4cIgH" });
    });
  });

  it("opens the same persisted object in the real fullscreen viewer and closes it", async () => {
    const { screen, photo } = await openStoredImage();

    await fireEvent.press(photo);
    const viewer = getHost(screen.container, "Modal");
    expect(viewer.props.visible).toBe(true);
    expect(getHost(viewer, "Image").props.source).toEqual({ uri: expectedUri });

    await fireEvent.press(within(viewer).getByLabelText("Close"));
    expect(screen.queryByLabelText("Close")).toBeNull();
    expect(getHost(screen.getByRole("imagebutton", { name: "Photo" }), "Image").props.source)
      .toEqual({ uri: expectedUri });
  });
});

describe("Conversation Retry", () => {
  it("resends a failed text Message with the same client Message ID", async () => {
    state.socket.sendTextMessage
      .mockResolvedValueOnce({ ok: false, code: "INTERNAL" })
      .mockResolvedValueOnce({ ok: true, message: { id: "server-1" } });
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = await renderMobile(<ConversationDetailScreen />);

    await fireEvent.changeText(await screen.findByPlaceholderText("Message"), "Still there?");
    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    });
    expect(await screen.findByText("Failed to send")).toBeTruthy();

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    });

    const [first, second] = state.socket.sendTextMessage.mock.calls.map(([args]) => args);
    expect(second).toEqual({ conversationId: CONVERSATION_ID, text: "Still there?", clientMessageId: first.clientMessageId });
  });

  it("resends a failed image Message with the same client Message ID", async () => {
    state.mutation.mutateAsync.mockResolvedValue({ uploadUrl: "https://upload", key: "chat-attachments/k.webp" });
    state.socket.sendImageMessage
      .mockResolvedValueOnce({ ok: false, code: "INTERNAL" })
      .mockResolvedValueOnce({ ok: true, message: { id: "server-2" } });
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = await renderMobile(<ConversationDetailScreen />);

    await act(async () => {
      // The attach button's label is matched loosely: it reads its key from another namespace today.
      void fireEvent.press(await screen.findByLabelText(/attach/i));
    });
    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    });
    expect(await screen.findByText("Failed to send")).toBeTruthy();

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Retry" }));
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
    const screen = await renderMobile(<ConversationDetailScreen />);

    await fireEvent.press(await screen.findByRole("button", { name: "Conversation actions" }));
    await fireEvent.press(screen.getByRole("button", { name: "Report" }));

    // The reasons the API accepts for a User report.
    for (const reason of ["Spam", "Scam or fraud", "Misleading information", "Harassment", "Other"]) {
      expect(screen.getByRole("radio", { name: reason })).toBeTruthy();
    }
    expect(screen.queryByRole("radio", { name: "Wrong category" })).toBeNull();

    await fireEvent.press(screen.getByRole("radio", { name: "Other" }));
    await fireEvent.changeText(screen.getByPlaceholderText("Describe the issue..."), "Asks for prepayment");
    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Submit report" }));
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
    const screen = await renderMobile(<ConversationDetailScreen />);

    await fireEvent.press(await screen.findByRole("button", { name: "Conversation actions" }));
    await fireEvent.press(screen.getByRole("button", { name: "Report" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Spam" }));
    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Submit report" }));
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
    const screen = await renderMobile(<ConversationDetailScreen />);

    await vi.waitFor(() => expect(state.get).toHaveBeenCalledWith("/config", expect.anything()));
    await act(async () => {});
    await fireEvent.press(await screen.findByRole("button", { name: "Conversation actions" }));
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
    const screen = await renderMobile(<ConversationDetailScreen />);

    await fireEvent.press(await screen.findByRole("button", { name: "Conversation actions" }));
    await fireEvent.press(screen.getByRole("button", { name: "Block user" }));
    expect(screen.getByText("Block this user?")).toBeTruthy();
    expect(
      screen.getByText("You will stop receiving messages and notifications from this user. The history stays."),
    ).toBeTruthy();
    await act(async () => {
      void fireEvent.press(screen.getByText("Block"));
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
    const screen = await renderMobile(<ConversationDetailScreen />);

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
    const screen = await renderMobile(<ConversationDetailScreen />);

    await fireEvent.press(await screen.findByRole("button", { name: "Unblock" }));
    expect(screen.getByText("Unblock this user?")).toBeTruthy();
    expect(screen.getByText("After unblocking, the user can message you again.")).toBeTruthy();
    await act(async () => {
      // The banner's Unblock, then the dialog's.
      const confirm = screen.getAllByText("Unblock")[1];
      if (!confirm) throw new Error("The dialog's Unblock is missing");
      void fireEvent.press(confirm);
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
    const screen = await renderMobile(<ConversationDetailScreen />);

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
    const screen = await renderMobile(<Seeded><ConversationDetailScreen /></Seeded>);
    expect(screen.queryByText("Merdan")).toBeNull();
    expect(state.readMessages).toHaveBeenLastCalledWith({ conversationId: "" });
    expect(state.get).not.toHaveBeenCalledWith(`/conversations/${CONVERSATION_ID}`, expect.anything());
    state.viewerLoading = false;
    state.viewerId = BUYER_ID;
  state.cachedMessages = false;
    await screen.rerender(<Seeded><ConversationDetailScreen /></Seeded>);
    expect(await screen.findByText("Merdan")).toBeTruthy();
  });

  it("signs in and returns to the same Conversation, which then loads", async () => {
    const screen = await renderMobile(<ConversationDetailScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(routerMock.push).toHaveBeenCalledWith({
      pathname: "/(auth)/phone",
      params: { authRoot: "1" },
    });
    expect(useAuthIntentStore.getState().intent).toEqual({ returnTo: conversationHref });

    useAuthIntentStore.getState().completeSignIn(routerMock);
    expect(routerMock.dismissTo).toHaveBeenCalledWith(conversationHref);

    state.viewerId = BUYER_ID;
  state.cachedMessages = false;
    await screen.rerender(<ConversationDetailScreen />);
    expect(await screen.findByText("Merdan")).toBeTruthy();
    expect(screen.queryByText("Sign in to view messages")).toBeNull();
  });

  it("returns to the signed-out state when sign-in is cancelled", async () => {
    const screen = await renderMobile(<ConversationDetailScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    useAuthIntentStore.getState().cancelSignIn(routerMock);

    expect(routerMock.dismissTo).toHaveBeenCalledWith(conversationHref);
    expect(screen.getByText("Sign in to view messages")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(routerMock.back).toHaveBeenCalledOnce();
  });
});

describe("Conversation not available", () => {
  it.each([
    ["does not exist", new ApiError("NOT_FOUND", 404, "Conversation not found")],
    ["is not the User's", new ApiError("FORBIDDEN", 403, "Not a participant", { reason: "NOT_A_PARTICIPANT" })],
  ])("shows Conversation not found when it %s", async (_case, error) => {
    state.get.mockRejectedValue(error);
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Conversation not found")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Retry|Try again/ })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Go to Messages" }));
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
    const screen = await renderMobile(<Seeded><ConversationDetailScreen /></Seeded>);

    expect(await screen.findByText("Conversation not found")).toBeTruthy();
    expect(screen.queryByText("Merdan")).toBeNull();
    expect(screen.queryByText("Toyota Camry, 2018")).toBeNull();
    expect(screen.queryByRole("button", { name: "Conversation actions" })).toBeNull();
  });

  it("shows Conversation not found when the Messages read is refused", async () => {
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    state.messages.isError = true;
    state.messages.error = new ApiError("FORBIDDEN", 403, "Not a participant");
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Conversation not found")).toBeTruthy();
    expect(screen.queryByText("Merdan")).toBeNull();
  });
});

describe("Conversation Message actions", () => {
  const PEER_TEXT = "Call me after five";

  async function openPeerSheet(routes: Record<string, () => unknown> = {}) {
    state.messages.data = { pages: [{ items: [serverMessage("peer-1", SELLER_ID, undefined, PEER_TEXT)], nextCursor: null }] };
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation(), ...routes });
    const screen = await renderMobile(<ConversationDetailScreen />);
    await fireEvent(await screen.findByLabelText(new RegExp(`^${PEER_TEXT}`)), "longPress");
    return screen;
  }

  it("copies the Message text, closes the sheet and shows Copied", async () => {
    const screen = await openPeerSheet();

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Copy" }));
    });
    expect(state.clipboard).toHaveBeenCalledWith(PEER_TEXT);
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copied" }));
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("shows Copied below the Conversation header at the height it is drawn", async () => {
    const screen = await openPeerSheet();
    await fireEvent(screen.getByRole("button", { name: "Go back" }), "layout", { nativeEvent: { layout: { height: 96 } } });

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Copy" }));
    });
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copied", topClearance: 96 }));
  });

  it("opens the report reasons for the Message, then shows Reported and offers Copy only", async () => {
    const screen = await openPeerSheet();

    await fireEvent.press(screen.getByRole("button", { name: "Report message" }));
    expect(state.reportSheet.current).toMatchObject({ messageId: "peer-1", open: true });

    await act(async () => {
      state.reportSheet.current?.onReported("peer-1");
    });
    expect(screen.getByText("Reported")).toBeTruthy();

    await fireEvent(screen.getByLabelText(new RegExp(`^${PEER_TEXT}.*Reported`)), "longPress");
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
    const screen = await renderMobile(<ConversationDetailScreen />);

    await fireEvent(await screen.findByLabelText(/^Hello/), "longPress");
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete message?")).toBeTruthy();
  });
});

describe("Conversation about a closed Listing", () => {
  const SELLER_MESSAGE = {
    id: "00000000-0000-4000-8000-0000000000f1",
    conversationId: CONVERSATION_ID,
    senderId: SELLER_ID,
    kind: "text",
    text: "Thanks, already sold",
    createdAt: "2026-10-01T09:00:00.000Z",
  };
  const withListing = (status: "sold" | "archived") => {
    const base = conversation();
    return conversation({ listing: base.listing && { ...base.listing, status } });
  };

  it("shows the Sold badge, the banner and the link after the last Message, with the composer on", async () => {
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => withListing("sold") });
    state.messages.data = { pages: [{ items: [SELLER_MESSAGE] }] };
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Sold")).toBeTruthy();
    expect(screen.getByText("Thanks, already sold")).toBeTruthy();
    expect(
      screen.getByText("This car is sold. You can keep talking, but the listing is no longer available."),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "See other Toyota Camry" }));
    expect(routerMock.navigate).toHaveBeenCalledWith({
      pathname: "/(tabs)/(search)/results",
      params: { brandId: "00000000-0000-4000-8000-0000000000d1", modelId: "00000000-0000-4000-8000-0000000000d2" },
    });
    expect(screen.getByPlaceholderText("Message")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send message" })).toBeTruthy();
  });

  it("shows no quick replies on a sold Listing, even with no Messages yet", async () => {
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => withListing("sold") });
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Sold")).toBeTruthy();
    expect(screen.queryByText("Is the car still available?")).toBeNull();
    expect(screen.getByPlaceholderText("Message")).toBeTruthy();
  });

  it("sends a Message on a sold Listing", async () => {
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => withListing("sold") });
    state.socket.sendTextMessage.mockResolvedValue({ ok: true, message: { id: "server-1" } });
    const screen = await renderMobile(<ConversationDetailScreen />);

    await screen.findByText("Sold");
    await fireEvent.changeText(screen.getByPlaceholderText("Message"), "Is the price final?");
    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    });
    expect(state.socket.sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({ text: "Is the price final?" }));
  });

  it("shows the Removed from sale badge and its banner for an archived Listing", async () => {
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => withListing("archived") });
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Removed from sale")).toBeTruthy();
    expect(
      screen.getByText("This car was removed from sale. You can keep talking, but the listing is no longer available."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "See other Toyota Camry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send message" })).toBeTruthy();
  });

  it.each([
    ["listing_unavailable", "This listing is no longer available"],
    ["chat_disabled", "The seller has turned off messages for this listing"],
    ["participant_unavailable", "You can't send messages in this Conversation"],
  ] as const)("replaces the composer with one line for %s and keeps History readable", async (restriction, line) => {
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () =>
        conversation({ listing: restriction === "listing_unavailable" ? null : conversation().listing, sendRestriction: restriction }),
    });
    state.messages.data = { pages: [{ items: [SELLER_MESSAGE] }] };
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText(line)).toBeTruthy();
    expect(screen.getByText("Thanks, already sold")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Message")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Attach photo" })).toBeNull();
    expect(screen.queryByText("Is the car still available?")).toBeNull();
    expect(screen.queryByText("typing...")).toBeNull();
    expect(state.socket.sendTextMessage).not.toHaveBeenCalled();
  });

  it("does not make the strip tappable when the Listing is no longer available", async () => {
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () => conversation({ sendRestriction: "listing_unavailable" }),
    });
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("This listing is no longer available")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Open:/ })).toBeNull();
  });

  it("lets the blocked banner with Unblock win over a closed Listing line", async () => {
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () =>
        conversation({ blockedByMe: true, sendRestriction: "blocked_by_me", listing: withListing("sold").listing }),
    });
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByRole("button", { name: "Unblock" })).toBeTruthy();
    expect(screen.getByText("User blocked")).toBeTruthy();
    expect(screen.queryByText("This listing is no longer available")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
  });

  it("reloads the Conversation and updates the footer when a send is refused after the state changed", async () => {
    let restricted = false;
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () =>
        conversation({ sendRestriction: restricted ? "chat_disabled" : null }),
    });
    state.socket.sendTextMessage.mockImplementation(async () => {
      restricted = true;
      return { ok: false, code: "FORBIDDEN", message: "Forbidden" };
    });
    const screen = await renderMobile(<ConversationDetailScreen />);

    await screen.findByText("Merdan");
    await fireEvent.changeText(screen.getByPlaceholderText("Message"), "Hello");
    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    });

    expect(await screen.findByText("The seller has turned off messages for this listing")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
  });

  it("reloads the Conversation when the HTTP fallback send is refused", async () => {
    let restricted = false;
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () =>
        conversation({ sendRestriction: restricted ? "participant_unavailable" : null }),
    });
    state.socket.sendTextMessage.mockResolvedValue({ ok: false, code: "NOT_CONNECTED", message: "Offline" });
    state.mutation.mutate.mockImplementation((_input, options?: { onError?: (error: unknown) => void }) => {
      restricted = true;
      options?.onError?.(new ApiError("FORBIDDEN", 403, "Forbidden"));
    });
    const screen = await renderMobile(<ConversationDetailScreen />);

    await screen.findByText("Merdan");
    await fireEvent.changeText(screen.getByPlaceholderText("Message"), "Hello");
    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    });

    expect(state.mutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Hello" }),
      expect.anything(),
    );
    expect(await screen.findByText("You can't send messages in this Conversation")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
  });

  it("reloads the Conversation when initial image presigning is refused", async () => {
    let restricted = false;
    const readConversation = vi.fn(() =>
      conversation({ sendRestriction: restricted ? "participant_unavailable" : null }),
    );
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: readConversation });
    state.mutation.mutateAsync.mockImplementationOnce(async () => {
      restricted = true;
      throw new ApiError("FORBIDDEN", 403, "Forbidden");
    });
    const screen = await renderMobile(<ConversationDetailScreen />);

    await screen.findByText("Merdan");
    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Attach photo" }));
    });
    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    });

    expect(state.mutation.mutateAsync).toHaveBeenCalledWith({
      conversationId: CONVERSATION_ID,
      request: { contentType: "image/webp", sizeBytes: 1000 },
    });
    expect(state.socket.sendImageMessage).not.toHaveBeenCalled();
    expect(await screen.findByText("You can't send messages in this Conversation")).toBeTruthy();
    expect(readConversation).toHaveBeenCalledTimes(2);
    expect(screen.queryByPlaceholderText("Message")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Attach photo" })).toBeNull();
  });

  it("reloads the Conversation when image Retry presigning is refused", async () => {
    let restricted = false;
    const readConversation = vi.fn(() =>
      conversation({ sendRestriction: restricted ? "participant_unavailable" : null }),
    );
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: readConversation });
    state.mutation.mutateAsync
      .mockResolvedValueOnce({ uploadUrl: "https://upload", key: "chat-attachments/k.webp" })
      .mockImplementationOnce(async () => {
        restricted = true;
        throw new ApiError("FORBIDDEN", 403, "Forbidden");
      });
    state.socket.sendImageMessage.mockResolvedValueOnce({ ok: false, code: "INTERNAL" });
    const screen = await renderMobile(<ConversationDetailScreen />);

    await screen.findByText("Merdan");
    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Attach photo" }));
    });
    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    });
    expect(await screen.findByText("Failed to send")).toBeTruthy();
    expect(readConversation).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText("Message")).toBeTruthy();

    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    });

    expect(state.mutation.mutateAsync).toHaveBeenCalledTimes(2);
    expect(state.mutation.mutateAsync).toHaveBeenLastCalledWith({
      conversationId: CONVERSATION_ID,
      request: { contentType: "image/webp", sizeBytes: 1000 },
    });
    expect(state.socket.sendImageMessage).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("You can't send messages in this Conversation")).toBeTruthy();
    expect(readConversation).toHaveBeenCalledTimes(2);
    expect(screen.queryByPlaceholderText("Message")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Attach photo" })).toBeNull();
  });

  it.each([
    ["chat is off", { sendRestriction: "chat_disabled" as const }],
    ["the viewer blocked the participant", { sendRestriction: "blocked_by_me" as const, blockedByMe: true }],
  ])("drops the keep-talking banner on a sold Listing when %s", async (_why, change) => {
    routeGet({
      [`/conversations/${CONVERSATION_ID}`]: () => ({ ...withListing("sold"), ...change }),
    });
    const screen = await renderMobile(<ConversationDetailScreen />);

    expect(await screen.findByText("Sold")).toBeTruthy();
    expect(screen.queryByText(/You can keep talking/)).toBeNull();
    expect(screen.queryByRole("button", { name: "See other Toyota Camry" })).toBeNull();
  });
});

describe("Own Message acknowledgement", () => {
  it.each([false, true])("keeps a sent Message visible before HTTP/socket echo, existing=%s", async (existing) => {
    state.messages.data = { pages: [{ items: existing ? [serverMessage("older", SELLER_ID)] : [] }] };
    state.socket.sendTextMessage.mockResolvedValue({ ok: true, message: { id: "server-new" } });
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = await renderMobile(<ConversationDetailScreen />);
    await fireEvent.changeText(await screen.findByPlaceholderText("Message"), "Visible immediately");
    const scrollRequests = (RN as unknown as { scrollRequests: unknown[] }).scrollRequests;
    scrollRequests.length = 0;
    await act(async () => {
      void fireEvent.press(screen.getByRole("button", { name: "Send message" }));
    });
    expect(screen.getAllByText("Visible immediately")).toHaveLength(1);
    expect(scrollRequests).toContainEqual({ method: "scrollToOffset", offset: 0, animated: false });
    expect(screen.queryByText("Failed to send")).toBeNull();
    const firstSend = state.socket.sendTextMessage.mock.calls[0];
    if (!firstSend) throw new Error("Message send missing");
    const clientMessageId = firstSend[0].clientMessageId;
    state.messages.data = { pages: [{ items: [{ ...serverMessage("server-new", BUYER_ID, new Date().toISOString(), "Visible immediately"), clientMessageId }] }] };
    await screen.rerender(<ConversationDetailScreen />);
    expect(screen.getAllByText("Visible immediately")).toHaveLength(1);
    expect(state.socket.sendTextMessage).toHaveBeenCalledTimes(1);
  });
});

describe("First chat action notifications", () => {
  it.each(["text", "image"] as const)("requests Android permission on the first %s send, never screen entry", async (kind) => {
    const previousOS = Platform.OS;
    Platform.OS = "android";
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: Notifications.PermissionStatus.DENIED, granted: false, canAskAgain: true, expires: "never" });
    vi.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ status: Notifications.PermissionStatus.GRANTED, granted: true, canAskAgain: true, expires: "never" });
    vi.mocked(Notifications.getDevicePushTokenAsync).mockResolvedValue({ data: "first-chat-token", type: "android" });
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    state.socket.sendTextMessage.mockResolvedValue({ ok: true, message: { id: "server-first" } });
    state.socket.sendImageMessage.mockResolvedValue({ ok: true, message: { id: "server-first-image" } });
    state.mutation.mutateAsync.mockResolvedValue({ uploadUrl: "https://upload", key: "chat-attachments/first.webp" });
    state.post.mockResolvedValue({});
    try {
      const screen = await renderMobile(<ConversationDetailScreen />);
      const field = await screen.findByPlaceholderText("Message");
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
      if (kind === "text") await fireEvent.changeText(field, "First action");
      else await act(async () => { void fireEvent.press(screen.getByLabelText(/attach/i)); });
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
      await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Send message" })); });
      await waitFor(() => expect(state.post).toHaveBeenCalledWith("/notifications/tokens", { token: "first-chat-token", platform: "android" }, expect.anything()));
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalledOnce();
    } finally {
      Platform.OS = previousOS;
      vi.mocked(Notifications.getPermissionsAsync).mockReset();
      vi.mocked(Notifications.requestPermissionsAsync).mockReset();
      vi.mocked(Notifications.getDevicePushTokenAsync).mockReset();
    }
  });
});

describe("Conversation keyboard ownership", () => {
  // A KeyboardAvoidingView compares its onLayout frame, which is relative to its
  // parent, with the keyboard's screen position. A region around the footer alone
  // therefore pads too little (#843: the iOS composer sat fully behind the keys).
  // The one active region must be the whole screen column, directly under the
  // safe-area screen, whose own frame is in screen coordinates.
  it.each(["android", "ios"] as const)("pads the whole %s screen column, so the composer and the latest Message sit above the keys", async (os) => {
    const previousOS = Platform.OS;
    Platform.OS = os;
    state.messages.data = { pages: [{ items: [serverMessage("Read while typing", SELLER_ID)] }] };
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    try {
      const screen = await renderMobile(<ConversationDetailScreen />);
      const field = await screen.findByPlaceholderText("Message");
      await fireEvent.changeText(field, "Above the keyboard");
      const active = getAllHosts(screen.container, "KeyboardAvoidingView").filter((view) => view.props.enabled !== false);
      expect(active).toHaveLength(1);
      const region = first(active);
      expect(region.props.behavior).toBe("padding");
      expect(region.props.className).toBe("flex-1");
      expect(region.props.keyboardVerticalOffset ?? 0).toBe(0);
      // Its parent is the screen root that applies the safe-area insets as padding.
      expect(Object.keys(region.parent?.props.style ?? {})).toEqual(
        expect.arrayContaining(["paddingTop", "paddingBottom"]),
      );
      expect(within(region).getByText("Read while typing")).toBeTruthy();
      expect(within(region).getByDisplayValue("Above the keyboard")).toBeTruthy();
      expect(within(region).getByRole("button", { name: "Send message", disabled: false })).toBeTruthy();
      expect(within(region).getByLabelText(/attach/i)).toBeTruthy();
      // No second, footer-local region anywhere in the screen, even a disabled one.
      expect(getAllHosts(screen.container, "KeyboardAvoidingView")).toHaveLength(1);
    } finally { Platform.OS = previousOS; }
  });

  it.each(["android", "ios"] as const)("keeps a pending photo and its Remove inside the %s avoidance region", async (os) => {
    const previousOS = Platform.OS;
    Platform.OS = os;
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    try {
      const screen = await renderMobile(<ConversationDetailScreen />);
      await act(async () => {
        await fireEvent.press(await screen.findByLabelText(/attach/i));
      });
      const remove = await screen.findByRole("button", { name: "Remove" });
      const region = activeKeyboardRegion(screen);
      expect(region.props.className).toBe("flex-1");
      expect(within(region).getByRole("button", { name: "Remove" })).toBe(remove);
      // The pending photo's preview is drawn inside the region, above the composer row.
      expect(getAllHosts(region, "Image").map((node: { props: { source?: unknown } }) => node.props.source)).toContainEqual({ uri: "file:///staged.webp" });
      expect(within(region).getByRole("button", { name: "Send message", disabled: false })).toBeTruthy();
    } finally { Platform.OS = previousOS; }
  });
});

describe("Acknowledged Message transport coverage", () => {
  it("keeps an HTTP fallback text Message visible while the refresh is delayed", async () => {
    state.messages.data = { pages: [{ items: [serverMessage("older", SELLER_ID)] }] };
    state.socket.sendTextMessage.mockResolvedValue({ ok: false, code: "NOT_CONNECTED" });
    state.mutation.mutate.mockImplementation((_input, options) => options?.onSuccess?.(serverMessage("http-message", BUYER_ID, new Date().toISOString(), "HTTP still visible")));
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = await renderMobile(<ConversationDetailScreen />);
    await fireEvent.changeText(await screen.findByPlaceholderText("Message"), "HTTP still visible");
    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Send message" })); });
    expect(screen.getAllByText("HTTP still visible")).toHaveLength(1);
    state.messages.data = { pages: [{ items: [serverMessage("http-message", BUYER_ID, new Date().toISOString(), "HTTP still visible")] }] };
    await screen.rerender(<ConversationDetailScreen />);
    expect(screen.getAllByText("HTTP still visible")).toHaveLength(1);
  });
  it.each([false, true])("keeps an acknowledged image visible without an echo, HTTP=%s", async (http) => {
    state.mutation.mutateAsync.mockResolvedValue({ uploadUrl: "https://upload", key: "chat-attachments/ack.webp" });
    state.socket.sendImageMessage.mockResolvedValue(http ? { ok: false, code: "NOT_CONNECTED" } : { ok: true, message: { id: "image-ack" } });
    state.mutation.mutate.mockImplementation((_input, options) => options?.onSuccess?.({ ...serverMessage("image-ack", BUYER_ID, new Date().toISOString()), kind: "image", text: null, metadata: { key: "chat-attachments/ack.webp" } }));
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = await renderMobile(<ConversationDetailScreen />);
    await screen.findByPlaceholderText("Message");
    await act(async () => { void fireEvent.press(screen.getByLabelText(/attach/i)); });
    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Send message" })); });
    expect(screen.getAllByRole("imagebutton", { name: "Photo" })).toHaveLength(1);
    expect(getHost(screen.getByRole("imagebutton", { name: "Photo" }), "Image").props.source.uri).toContain("chat-attachments/ack.webp");
  });
});

describe("Acknowledged own Message actions", () => {
  it.each([false, true])("offers Delete and redacts its acknowledged local row without echo, HTTP=%s", async (http) => {
    const deletedAt = new Date().toISOString();
    state.socket.sendTextMessage.mockResolvedValue({ ok: true, message: { id: "ack-to-delete" } });
    state.socket.deleteMessage.mockResolvedValue(http ? { ok: false, code: "NOT_CONNECTED" } : { ok: true, messageId: "ack-to-delete", conversationId: CONVERSATION_ID, deletedAt });
    state.mutation.mutate.mockImplementation((_input, options) => options?.onSuccess?.({ messageId: "ack-to-delete", conversationId: CONVERSATION_ID, deletedAt }));
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    const screen = await renderMobile(<ConversationDetailScreen />);
    await fireEvent.changeText(await screen.findByPlaceholderText("Message"), "Acknowledged and deletable");
    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Send message" })); });
    await fireEvent(screen.getByText("Acknowledged and deletable"), "longPress");
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete message?")).toBeTruthy();
    await act(async () => { void fireEvent.press(screen.getByText("Delete")); });
    expect(screen.queryByText("Acknowledged and deletable")).toBeNull();
    expect(screen.getByText("Message deleted")).toBeTruthy();
    expect(state.socket.deleteMessage).toHaveBeenCalledWith({ conversationId: CONVERSATION_ID, messageId: "ack-to-delete" });
  });
});

describe("Authoritative acknowledgement cache", () => {
  it.each([false, true])("keeps the server Message across reopening within staleTime and later echo, echoFirst=%s", async (echoFirst) => {
    state.cachedMessages = true;
    const older = serverMessage("older-ack", SELLER_ID);
    state.messages.data = { pages: [{ items: [older], nextCursor: "older-page" }, { items: [], nextCursor: null }], pageParams: [null, "older-page"] };
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    let acknowledge: ((value: unknown) => void) | undefined;
    state.socket.sendTextMessage.mockImplementation(() => new Promise((resolve) => { acknowledge = resolve; }));
    const screen = await renderMobile(<ConversationDetailScreen />);
    await fireEvent.changeText(await screen.findByPlaceholderText("Message"), "Typed before server acknowledgement");
    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Send message" })); });
    const firstSend = state.socket.sendTextMessage.mock.calls[0];
    if (!firstSend) throw new Error("Send missing");
    const message = { ...serverMessage("canonical-id", BUYER_ID, "2026-10-08T12:34:56.000Z", "Canonical server text"), clientMessageId: firstSend[0].clientMessageId };
    let finishOldRead: ((value: unknown) => void) | undefined;
    const oldRead = !echoFirst ? screen.queryClient.fetchQuery({
      queryKey: queryKeys.conversations.messages(CONVERSATION_ID),
      queryFn: () => new Promise((resolve) => { finishOldRead = resolve; }),
      staleTime: 0,
    }).catch(() => undefined) : undefined;
    if (echoFirst) await act(() => screen.queryClient.setQueryData(queryKeys.conversations.messages(CONVERSATION_ID), { pages: [{ items: [message, older], nextCursor: "older-page" }, { items: [], nextCursor: null }], pageParams: [null, "older-page"] }));
    await act(async () => { acknowledge?.({ ok: true, message }); });
    await act(async () => { finishOldRead?.(state.messages.data); await oldRead; });
    const cached = screen.queryClient.getQueryData<{ pages: { items: ConversationsSchemas.MessageSummary[]; nextCursor: string | null }[]; pageParams: unknown[] }>(queryKeys.conversations.messages(CONVERSATION_ID));
    expect(cached?.pages.flatMap((page) => page.items).filter((row) => row.id === "canonical-id")).toEqual([message]);
    expect(cached?.pageParams).toEqual([null, "older-page"]);
    expect(cached?.pages[0]?.nextCursor).toBe("older-page");
    expect(screen.getAllByText("Canonical server text")).toHaveLength(1);
    // Same provider/client, but the route and its local outbox are remounted.
    await screen.rerender(<RN.View />);
    await screen.rerender(<ConversationDetailScreen />);
    expect(await screen.findByText("Canonical server text")).toBeTruthy();
    expect(screen.getAllByText("Canonical server text")).toHaveLength(1);
  });
});

describe("Acknowledgement cannot undo a newer deletion", () => {
  it("keeps the authoritative redaction when a send acknowledgement arrives late", async () => {
    state.cachedMessages = true;
    state.messages.data = { pages: [{ items: [], nextCursor: null }], pageParams: [null] };
    routeGet({ [`/conversations/${CONVERSATION_ID}`]: () => conversation() });
    let acknowledge: ((value: unknown) => void) | undefined;
    state.socket.sendTextMessage.mockImplementation(() => new Promise((resolve) => { acknowledge = resolve; }));
    const screen = await renderMobile(<ConversationDetailScreen />);
    await fireEvent.changeText(await screen.findByPlaceholderText("Message"), "Before deletion");
    await act(async () => { void fireEvent.press(screen.getByRole("button", { name: "Send message" })); });
    const send = state.socket.sendTextMessage.mock.calls[0];
    if (!send) throw new Error("Send missing");
    const message = { ...serverMessage("deleted-before-ack", BUYER_ID, new Date().toISOString(), "Before deletion"), clientMessageId: send[0].clientMessageId };
    await act(() => screen.queryClient.setQueryData(queryKeys.conversations.messages(CONVERSATION_ID), { pages: [{ items: [{ ...message, text: null, deletedAt: "2026-10-08T14:00:00.000Z" }], nextCursor: null }], pageParams: [null] }));
    await act(async () => { acknowledge?.({ ok: true, message }); });
    expect(screen.queryByText("Before deletion")).toBeNull();
    expect(screen.getByText("Message deleted")).toBeTruthy();
  });
});
