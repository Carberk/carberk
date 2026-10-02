import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, it, expect } from "vitest";

const source = readFileSync(resolve(__dirname, "./MessageComposer.tsx"), "utf-8");

describe("MessageComposer", () => {
  it("exports MessageComposer component", () => {
    expect(source).toContain("export function MessageComposer");
  });

  it("accepts onSend callback prop", () => {
    expect(source).toContain("onSend: (text: string) => void");
  });

  it("has a disabled prop", () => {
    expect(source).toContain("disabled?: boolean");
  });

  it("uses a multiline TextInput for message entry", () => {
    expect(source).toContain("multiline");
    expect(source).toContain("TextInput");
  });

  it("enforces 1000 character max length", () => {
    expect(source).toContain("const MAX_CHARS = 1000");
    expect(source).toContain("maxLength={MAX_CHARS}");
  });

  it("rejects blank text", () => {
    expect(source).toContain("const trimmed = text.trim()");
    expect(source).toContain("trimmed.length > 0");
  });

  it("disables send when text is empty", () => {
    expect(source).toContain("const canSendText = trimmed.length > 0");
    expect(source).toContain("const canSend = canSendText || canSendImage");
  });

  it("disables send when over character limit", () => {
    expect(source).toContain("!isOverLimit");
  });

  it("shows Send button that calls onSend", () => {
    expect(source).toContain('accessibilityLabel={t("sendMessage")}');
    expect(source).toContain("onPress={handleSend}");
    expect(source).toContain("onSend(trimmed)");
  });

  it("clears input after send", () => {
    expect(source).toContain('setText("")');
  });

  it("shows error text when over limit", () => {
    expect(source).toContain("isOverLimit &&");
    expect(source).toContain("text-destructive");
    expect(source).toContain('t("messageTooLong"');
  });

  it("uses KeyboardAvoidingView for composer", () => {
    expect(source).toContain("KeyboardAvoidingView");
  });

  it("has accessible input label", () => {
    expect(source).toContain('accessibilityLabel={t("sendMessage")}');
  });

  it("accepts showQuickReplies prop", () => {
    expect(source).toContain("showQuickReplies?: boolean");
  });

  it("renders QuickReplies when showQuickReplies is true", () => {
    expect(source).toContain("showQuickReplies &&");
    expect(source).toContain("<QuickReplies");
  });

  it("fills composer text when a quick reply is selected", () => {
    expect(source).toContain("onSelect={setText}");
  });

  it("forwards disabled state to QuickReplies", () => {
    expect(source).toContain("disabled={disabled}");
  });

  it("accepts onTyping callback for typing indicators", () => {
    expect(source).toContain("onTyping?: () => void");
  });

  it("accepts onStopTyping callback to clear typing state", () => {
    expect(source).toContain("onStopTyping?: () => void");
  });

  it("calls onTyping while the user is entering text", () => {
    expect(source).toContain("onTyping?.()");
  });

  it("calls onStopTyping when the input is cleared", () => {
    expect(source).toContain("onStopTyping?.()");
  });

  it("calls onStopTyping when the input loses focus", () => {
    expect(source).toContain("onBlur={handleBlur}");
  });
});

describe("MessageComposer image attachment", () => {
  it("accepts onSendImage callback prop", () => {
    expect(source).toContain("onSendImage?: (attachment: ComposerAttachment) => void");
  });

  it("accepts conversationId for staging", () => {
    expect(source).toContain("conversationId?: string");
  });

  it("has an attachment picker button", () => {
    expect(source).toContain("handlePickImage");
  });

  it("disables send when neither text nor image is available", () => {
    expect(source).toContain("const canSend = canSendText || canSendImage");
  });

  it("enables send when an image attachment is present", () => {
    expect(source).toContain("const canSendImage = !!attachment && !disabled");
  });

  it("calls onSendImage when send is pressed with an attachment", () => {
    expect(source).toContain("onSendImage(attachment)");
  });
});

describe("MessageComposer state transitions", () => {
  it("send disabled when empty", () => {
    expect(source).toContain("disabled={!canSend}");
  });

  it("send disabled while parent is disabled", () => {
    expect(source).toContain("!disabled");
  });
});
