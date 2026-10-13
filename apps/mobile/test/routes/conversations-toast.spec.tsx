import { StyleSheet } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile, routeParams } from "../render";
import ConversationDetailScreen from "../../app/conversations/[id]";

import { ToastProvider } from "@/components/ui/toast";

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, right: 0, bottom: 0, left: 0 }),
}));
vi.mock("../../src/api/conversations/useConversation", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useConversation: () => ({ data: mocks.conversation, isPending: false, isError: false, error: null }),
}));

const mocks = vi.hoisted(() => ({
  sendTextMessage: vi.fn(async () => ({ ok: true, message: { id: "server-1" } })),
  mutation: { mutate: vi.fn(), isPending: false },
  conversation: {
    id: "conversation-1", listing: null, buyerId: "buyer", sellerId: "seller", myRole: "buyer",
    peer: { id: "seller", displayName: "Merdan Ataýew", nameNumber: 2057, avatarIndex: 7, avatarKey: null, deleted: false }, blockedByMe: false,
    updatedAt: "2026-10-01T10:00:00.000Z",
  },
}));

vi.mock("../../src/auth/useViewer", () => ({ useViewer: () => ({ userId: "buyer" }) }));
vi.mock("../../src/api/conversations/useConversationMessages", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useConversationMessages: () => ({
    data: { pages: [{ items: [] }] },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../src/api/conversations/useConversations", () => ({
  useConversations: () => ({ data: undefined }),
}));
vi.mock("../../src/api/conversations/useSendTextMessage", () => ({
  useSendTextMessage: () => mocks.mutation,
}));
vi.mock("../../src/api/conversations/useSendImageMessage", () => ({
  useSendImageMessage: () => mocks.mutation,
}));
vi.mock("../../src/api/conversations/usePresignChatAttachment", () => ({
  usePresignChatAttachment: () => mocks.mutation,
}));
vi.mock("../../src/api/conversations/useUpdateWatermark", () => ({
  useUpdateWatermark: () => mocks.mutation,
}));
vi.mock("../../src/api/conversations/useDeleteMessage", () => ({
  useDeleteMessage: () => mocks.mutation,
}));
vi.mock("../../src/api/conversations/useMuteConversation", () => ({
  useMuteConversation: () => mocks.mutation,
}));
vi.mock("../../src/api/identity/useBlockUser", () => ({ useBlockUser: () => mocks.mutation }));
vi.mock("../../src/api/identity/useUnblockUser", () => ({ useUnblockUser: () => mocks.mutation }));
vi.mock("../../src/api/admin/useConfig", () => ({ useConfig: () => ({ data: undefined }) }));
vi.mock("../../src/api/catalog/useBrands", () => ({ useBrands: () => ({ data: undefined }) }));
vi.mock("../../src/api/catalog/useModels", () => ({ useModels: () => ({ data: undefined }) }));
vi.mock("../../src/navigation/useSafeBack", () => ({ useSafeBack: () => vi.fn() }));
vi.mock("../../src/conversations/socket/useConversationSocket", () => ({
  useConversationSocket: () => ({
    peerTyping: false,
    peerPresence: { online: false },
    signalTyping: vi.fn(),
    stopTyping: vi.fn(),
    sendTextMessage: mocks.sendTextMessage,
    sendImageMessage: vi.fn(),
    markRead: vi.fn(async () => ({ ok: true })),
    deleteMessage: vi.fn(),
  }),
}));
vi.mock("../../src/conversations/components/useConversationCatalogMaps", () => ({
  useConversationCatalogMaps: () => ({ brandName: () => undefined, modelName: () => undefined }),
}));
vi.mock("../../src/conversations/components/MessageList", () => ({ MessageList: () => null }));
vi.mock("../../src/conversations/components/ImagePreviewModal", () => ({
  ImagePreviewModal: () => null,
}));
vi.mock("../../src/admin/components/MessageReportSheet", () => ({
  MessageReportSheet: () => null,
}));
vi.mock("@/components/ui/skeleton", async () => ({
  Skeleton: (await import("react-native")).View,
}));
// The real theme module imports React Navigation, which needs the native runtime.
vi.mock("../../lib/theme", () => ({
  THEME: { light: { mutedForeground: "0 0% 45%" }, dark: { mutedForeground: "0 0% 60%" } },
}));
vi.mock("../../src/conversations/upload/chatImageUpload", () => ({
  compressChatImage: vi.fn(),
  getChatImageStagingPath: vi.fn(),
  ensureChatStagingDir: vi.fn(),
  uploadChatImageToPresignedUrl: vi.fn(),
  ChatImageUploadError: class extends Error {},
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock("expo-image-picker", () => ({
  useMediaLibraryPermissions: () => [{ granted: true }, vi.fn()],
  launchImageLibraryAsync: vi.fn(),
}));
vi.mock("expo-file-system/legacy", () => ({ deleteAsync: vi.fn(async () => {}) }));
vi.mock("expo-linking", () => ({ openSettings: vi.fn() }));

beforeEach(() => {
  routeParams.id = "conversation-1";
  // The mute request fails, so the screen raises its error toast.
  mocks.mutation.mutate.mockImplementation((_vars: unknown, options?: { onError?: () => void }) => options?.onError?.());
});

describe("Conversation toast and header boundary", () => {
  it("places a top toast below the measured header, whatever the text size", async () => {
    const screen = await renderMobile(<ToastProvider><ConversationDetailScreen /></ToastProvider>);
    let header = screen.getByRole("button", { name: "Go back" }).parent;
    while (header && !header.props.className?.includes("border-b")) header = header.parent;
    if (!header) throw new Error("Conversation header missing");
    // A native layout event reports the larger header that a bigger text size produces.
    await fireEvent(header, "layout", { nativeEvent: { layout: { height: 132, width: 390, x: 0, y: 0 } } });

    await fireEvent.press(screen.getByRole("button", { name: "Conversation actions" }));
    await fireEvent.press(screen.getByRole("button", { name: "Mute notifications" }));

    expect(screen.getByText("Couldn't update the notification setting")).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId("toast-viewport-top").props.style).top).toBe(59 + 132 + 8);
  });
});
