import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, fireEvent, renderMobile, routeParams } from "../render";
import ConversationDetailScreen from "../../app/conversations/[id]";

const DRAFT = "Can I see the car?";

const mocks = vi.hoisted(() => ({
  sendTextMessage: vi.fn(async () => ({ ok: true, message: { id: "server-1" } })),
  mutation: { mutate: vi.fn(), isPending: false },
}));

vi.mock("../../src/auth/useViewer", () => ({ useViewer: () => ({ userId: "buyer" }) }));
vi.mock("../../src/api/conversations/useConversationMessages", () => ({
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
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));
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
  mocks.sendTextMessage.mockClear();
  routeParams.id = "conversation-1";
  routeParams.listingId = "00000000-0000-4000-8000-000000000374";
});

describe("Conversation opened from Ask the seller", () => {
  it("shows the chosen question in the composer without sending it", () => {
    routeParams.draft = DRAFT;
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(screen.getByDisplayValue(DRAFT)).toBeTruthy();
    expect(mocks.sendTextMessage).not.toHaveBeenCalled();
    expect(mocks.mutation.mutate).not.toHaveBeenCalled();
  });

  it("sends the question only when the buyer presses Send", async () => {
    routeParams.draft = DRAFT;
    const screen = renderMobile(<ConversationDetailScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Send message", disabled: false }));
    });

    expect(mocks.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conversation-1", text: DRAFT }),
    );
  });

  it("opens with an empty composer when there is no draft", () => {
    const screen = renderMobile(<ConversationDetailScreen />);

    expect(screen.queryByDisplayValue(DRAFT)).toBeNull();
    expect(screen.getByRole("button", { name: "Send message", disabled: true })).toBeTruthy();
  });
});
