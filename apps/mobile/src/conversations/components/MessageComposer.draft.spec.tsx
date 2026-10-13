import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../../../test/render";

import { MessageComposer } from "./MessageComposer";

// The real theme module imports React Navigation, which needs the native runtime.
vi.mock("../../../lib/theme", () => ({
  THEME: { light: { mutedForeground: "0 0% 45%" }, dark: { mutedForeground: "0 0% 60%" } },
}));
vi.mock("expo-image-picker", () => ({
  useMediaLibraryPermissions: () => [{ granted: true }, vi.fn()],
  launchImageLibraryAsync: vi.fn(),
}));
vi.mock("expo-file-system/legacy", () => ({ deleteAsync: vi.fn(async () => {}) }));
vi.mock("expo-linking", () => ({ openSettings: vi.fn() }));
vi.mock("../upload/chatImageUpload", () => ({
  compressChatImage: vi.fn(),
  getChatImageStagingPath: vi.fn(),
  ensureChatStagingDir: vi.fn(),
  ChatImageUploadError: class extends Error {},
}));

const DRAFT = "Can I see the car?";

describe("Message composer with a draft from Ask the seller", () => {
  it("starts with the question typed in and sends nothing on its own", async () => {
    const onSend = vi.fn();
    const screen = await renderMobile(<MessageComposer onSend={onSend} initialText={DRAFT} />);

    expect(screen.getByDisplayValue(DRAFT)).toBeTruthy();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends the question when the buyer presses Send, and clears the field", async () => {
    const onSend = vi.fn();
    const screen = await renderMobile(<MessageComposer onSend={onSend} initialText={DRAFT} />);

    await fireEvent.press(screen.getByRole("button", { name: "Send message", disabled: false }));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(DRAFT);
    expect(screen.queryByDisplayValue(DRAFT)).toBeNull();
  });

  it("lets the buyer edit the question before sending", async () => {
    const onSend = vi.fn();
    const screen = await renderMobile(<MessageComposer onSend={onSend} initialText={DRAFT} />);

    await fireEvent.changeText(screen.getByDisplayValue(DRAFT), "Can I see the car on Sunday?");
    await fireEvent.press(screen.getByRole("button", { name: "Send message", disabled: false }));

    expect(onSend).toHaveBeenCalledWith("Can I see the car on Sunday?");
  });

  it("starts empty, with Send disabled, when there is no draft", async () => {
    const screen = await renderMobile(<MessageComposer onSend={vi.fn()} />);

    expect(screen.queryByDisplayValue(DRAFT)).toBeNull();
    expect(screen.getByRole("button", { name: "Send message", disabled: true })).toBeTruthy();
  });
});

describe("Send button appearance (#623)", () => {
  // The Send icon is the only size-5 element inside the Send button.
  function sendIconClass(screen: Awaited<ReturnType<typeof renderMobile>>) {
    const button = screen.getByRole("button", { name: "Send message" });
    const icon = button.queryAll((node) => typeof node.props.className === "string" && node.props.className.includes("size-5"), { includeSelf: true })[0];
    return String(icon?.props.className ?? "");
  }

  it("draws an empty composer's Send icon muted, and a sendable one bright, through typing", async () => {
    const screen = await renderMobile(<MessageComposer onSend={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Send message", disabled: true })).toBeTruthy();
    expect(sendIconClass(screen)).toContain("text-muted-foreground");
    expect(sendIconClass(screen)).not.toContain("text-primary-foreground");

    await fireEvent.changeText(screen.getByPlaceholderText(/./), "Hello");

    expect(screen.getByRole("button", { name: "Send message", disabled: false })).toBeTruthy();
    expect(sendIconClass(screen)).toContain("text-primary-foreground");

    await fireEvent.changeText(screen.getByPlaceholderText(/./), "   ");

    expect(sendIconClass(screen)).toContain("text-muted-foreground");
  });
});
