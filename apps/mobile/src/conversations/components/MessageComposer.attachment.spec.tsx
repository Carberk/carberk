import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, fireEvent, renderMobile } from "../../../test/render";

import { MessageComposer } from "./MessageComposer";

// Native picker/filesystem/manipulator boundaries only. Real composer and
// compression/staging code execute, so the attachment is selected by the user.
const picker = vi.hoisted(() => ({ canceled: false }));
const removedFiles = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("expo-image-picker", () => ({
  useMediaLibraryPermissions: () => [{ granted: true }, async () => ({ granted: true })],
  launchImageLibraryAsync: async () => ({
    canceled: picker.canceled,
    assets: picker.canceled ? [] : [{ uri: "file:///picked.webp" }],
  }),
}));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  getInfoAsync: async () => ({ exists: true, size: 1024 }),
  copyAsync: async () => {},
  deleteAsync: removedFiles,
}));
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", WEBP: "webp" },
  ImageManipulator: {
    manipulate: () => ({
      resize: () => {},
      renderAsync: async () => ({
        saveAsync: async () => ({ uri: "file:///compressed.webp", width: 1200, height: 800 }),
      }),
    }),
  },
}));

beforeEach(() => {
  picker.canceled = false;
  removedFiles.mockClear();
});

async function attach(view: ReturnType<typeof renderMobile>, label = "Attach photo") {
  await act(async () => {
    fireEvent.press(view.getByRole("button", { name: label }));
  });
}

describe("Conversation attachment removal", () => {
  it.each([
    ["en", "Attach photo", "Remove", "Send message"],
    ["ru", "Прикрепить фото", "Удалить", "Отправить сообщение"],
    ["tk", "Surat goş", "Aýyr", "Habar ugrat"],
  ] as const)("exposes localized Remove as a button and preserves held text in %s", async (locale, attachLabel, removeLabel, sendLabel) => {
    const onSend = vi.fn();
    const onSendImage = vi.fn();
    const view = renderMobile(<MessageComposer conversationId="conversation" onSend={onSend} onSendImage={onSendImage} initialText="Held question" />, { locale });
    await attach(view, attachLabel);
    const remove = view.getByRole("button", { name: removeLabel });
    fireEvent.press(remove);
    expect(view.queryByRole("button", { name: removeLabel })).toBeNull();
    expect(view.getByDisplayValue("Held question")).toBeTruthy();
    expect(removedFiles).toHaveBeenLastCalledWith(expect.stringMatching(/^file:\/\/\/doc\/chat-staging\/conversation\/picker-.*\.webp$/), { idempotent: true });
    fireEvent.press(view.getByRole("button", { name: sendLabel, disabled: false }));
    expect(onSend).toHaveBeenCalledWith("Held question");
    expect(onSendImage).not.toHaveBeenCalled();
  });

  it("disables Send again after an image-only attachment is removed", async () => {
    const view = renderMobile(<MessageComposer conversationId="conversation" onSend={vi.fn()} onSendImage={vi.fn()} />);
    await attach(view);
    expect(view.getByRole("button", { name: "Send message", disabled: false })).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: "Remove" }));
    expect(view.getByRole("button", { name: "Send message", disabled: true })).toBeTruthy();
  });

  it("keeps image sending and held text after selecting an attachment", async () => {
    const onSend = vi.fn();
    const onSendImage = vi.fn();
    const view = renderMobile(<MessageComposer conversationId="conversation" onSend={onSend} onSendImage={onSendImage} initialText="Held question" />);
    await attach(view);
    fireEvent.press(view.getByRole("button", { name: "Send message", disabled: false }));
    expect(onSendImage).toHaveBeenCalledWith({
      uri: expect.stringMatching(/^file:\/\/\/doc\/chat-staging\/conversation\/picker-.*\.webp$/),
      width: 1200, height: 800, fileSize: 1024,
    });
    expect(onSend).not.toHaveBeenCalled();
    expect(view.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(view.getByDisplayValue("Held question")).toBeTruthy();
  });

  it("keeps removal available when the parent disables sending", async () => {
    const onSend = vi.fn();
    const view = renderMobile(<MessageComposer conversationId="conversation" onSend={onSend} />);
    await attach(view);
    view.rerender(<MessageComposer conversationId="conversation" onSend={onSend} disabled />);
    expect(view.getByRole("button", { name: "Send message", disabled: true })).toBeTruthy();
    expect(view.getByRole("button", { name: "Attach photo", disabled: true })).toBeTruthy();
    fireEvent.press(view.getByRole("button", { name: "Remove" }));
    expect(view.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("leaves no attachment when the native picker is canceled", async () => {
    picker.canceled = true;
    const view = renderMobile(<MessageComposer conversationId="conversation" onSend={vi.fn()} />);
    await attach(view);
    expect(view.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(view.getByRole("button", { name: "Send message", disabled: true })).toBeTruthy();
    expect(removedFiles).not.toHaveBeenCalled();
  });

});
