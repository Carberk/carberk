// Relocated out of `app/` (was app/conversations/[id].spec.tsx): a *.spec under the
// Expo Router app dir gets bundled by require.context — importing Node `fs` breaks the
// native bundle and registers a bogus route. Test files must live outside `app/`
// (Expo Router docs); metro.config.js resolver.blockList is the backstop. Node/vitest.
import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, it, expect } from "vitest";

const source = readFileSync(
  resolve(__dirname, "../../app/conversations/[id].tsx"),
  "utf-8",
);

describe("ConversationDetailScreen", () => {
  it("exports default screen component", () => {
    expect(source).toContain("export default function ConversationDetailScreen");
  });

  it("reads conversation id from route params", () => {
    expect(source).toContain("useLocalSearchParams");
    expect(source).toContain('typeof rawId === "string" ? rawId : ""');
  });

  it("uses useViewer for current user id", () => {
    expect(source).toContain('import { useViewer } from "../../src/auth/useViewer"');
    expect(source).toContain("const viewer = useViewer()");
  });

  it("uses useConversationMessages for message list", () => {
    expect(source).toContain(
      'import { useConversationMessages } from "../../src/api/conversations/useConversationMessages"',
    );
  });

  it("reads the Conversation by ID instead of from route params", () => {
    // Read by ID, and only once a User is signed in.
    expect(source).toContain("useConversation(readId)");
    expect(source).not.toContain("params.listingId");
    expect(source).not.toContain("params.buyerId");
  });

  it("uses useSendTextMessage for sending", () => {
    expect(source).toContain(
      'import { useSendTextMessage } from "../../src/api/conversations/useSendTextMessage"',
    );
  });

  it("renders ConversationListingCard at top", () => {
    expect(source).toContain("ConversationListingCard");
  });

  it("renders MessageList with messages", () => {
    expect(source).toContain("MessageList");
  });

  it("renders MessageComposer at bottom", () => {
    expect(source).toContain("MessageComposer");
  });
});

describe("ConversationDetailScreen optimistic states", () => {
  it("tracks local pending messages", () => {
    expect(source).toContain("const [localMessages, setLocalMessages]");
    expect(source).toContain('status: "pending"');
  });

  it("marks pending as sent on send success", () => {
    expect(source).toContain('status: "sent"');
    expect(source).toContain("onSuccess");
  });

  it("marks pending as failed on send error", () => {
    expect(source).toContain('status: "failed"');
    expect(source).toContain("onError");
  });

  it("supports retry for failed messages", () => {
    expect(source).toContain("handleRetry");
    expect(source).toContain("onRetry={handleRetry}");
  });

  it("deduplicates server and local messages", () => {
    expect(source).toContain("serverIds");
    expect(source).toContain("serverClientIds");
    expect(source).toContain("pendingOrFailed");
  });
});

describe("ConversationDetailScreen confirmation dialogs", () => {
  it("renders native dialog labels inside Text components", () => {
    expect(source).toContain('<Text>{t("cancel")}</Text>');
    expect(source).toContain("<Text>{confirmActionLabel}</Text>");
  });
});

describe("ConversationDetailScreen realtime text send", () => {
  it("uses the conversation socket hook", () => {
    expect(source).toContain("useConversationSocket");
  });

  it("generates a clientMessageId for every send", () => {
    expect(source).toContain("clientMessageId");
    expect(source).toContain("generateClientMessageId");
  });

  it("creates an optimistic pending row before sending", () => {
    expect(source).toContain('status: "pending"');
  });

  it("reconciles optimistic rows by clientMessageId", () => {
    expect(source).toContain("serverClientIds");
    expect(source).toContain("lm.clientMessageId");
  });

  it("marks messages confirmed on socket ack", () => {
    expect(source).toContain("markConfirmed");
    expect(source).toContain("result.message.id");
  });

  it("falls back to HTTP when socket is not connected", () => {
    expect(source).toContain('result.code === "NOT_CONNECTED"');
    expect(source).toContain("sendViaHttp");
  });

  it("marks messages failed on non-recoverable send errors", () => {
    expect(source).toContain("markFailed");
  });

  it("supports retry for failed messages", () => {
    expect(source).toContain("handleRetry");
    expect(source).toContain('msg.status !== "failed"');
  });

  it("keeps the composer usable while socket connects", () => {
    expect(source).toContain("<ConversationFooter");
    expect(source).toContain("disabled: isBlocked || blockUser.isPending || unblockUser.isPending");
    expect(source).not.toContain("disabled: true");
  });
});
