import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../../test/render";

import { ProfilePhotoSheet } from "./ProfilePhotoSheet";

// Render the real sheet/backdrop; only the native dialog boundary is replaced.
vi.unmock("@/components/ui/sheet");
vi.mock("@rn-primitives/dialog", async () => {
  const React = await import("react");
  const { Text, View } = await import("react-native");
  const Open = React.createContext<(open: boolean) => void>(() => {});
  const Box = ({ children }: React.PropsWithChildren) => <View>{children}</View>;
  const Close = ({ children }: { children: React.ReactNode }) => {
    const onOpenChange = React.useContext(Open);
    return React.cloneElement(children as React.ReactElement<{ onPress: () => void }>, { onPress: () => onOpenChange(false) });
  };
  const Root = ({ open, onOpenChange, children }: React.PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) =>
    open ? <Open.Provider value={onOpenChange}>{children}</Open.Provider> : null;
  return { Root, Close, useRootContext: () => ({ open: true, onOpenChange: React.useContext(Open) }), Portal: Box, Overlay: Box, Content: Box, Trigger: Box, Title: Text, Description: Text };
});
vi.mock("react-native-screens", async () => ({ FullWindowOverlay: (await import("react-native")).View }));

function setup(hasPhoto = false, locale = "en") {
  const callbacks = { onOpenChange: vi.fn(), onTakePhoto: vi.fn(), onChoosePhoto: vi.fn(), onRemovePhoto: vi.fn() };
  return { ...renderMobile(<ProfilePhotoSheet open hasPhoto={hasPhoto} {...callbacks} />, { locale }), callbacks };
}

describe("ProfilePhotoSheet", () => {
  it.each(["close", "outside"])("dismisses with %s without choosing or removing a photo", (control) => {
    const view = setup(true);
    fireEvent.press(control === "close" ? view.getByRole("button", { name: "Close" }) : view.getByTestId("sheet-backdrop", { includeHiddenElements: true }));
    expect(view.callbacks.onOpenChange).toHaveBeenCalledWith(false);
    expect(view.callbacks.onChoosePhoto).not.toHaveBeenCalled();
    expect(view.callbacks.onTakePhoto).not.toHaveBeenCalled();
    expect(view.callbacks.onRemovePhoto).not.toHaveBeenCalled();
  });

  it.each([
    ["en", "Profile photo", "Take photo", "Choose from library", "Remove photo"],
    ["ru", "Фото профиля", "Сделать фото", "Выбрать из галереи", "Удалить фото"],
    ["tk", "Profil suraty", "Surata al", "Galereýadan saýla", "Suraty aýyr"],
  ])("offers the photo actions and conditional removal in %s", (locale, title, camera, library, remove) => {
    const empty = setup(false, locale);
    expect(empty.getByText(title)).toBeTruthy();
    expect(empty.getByRole("button", { name: camera })).toBeTruthy();
    expect(empty.queryByRole("button", { name: remove })).toBeNull();
    fireEvent.press(empty.getByRole("button", { name: library }));
    expect(empty.callbacks.onChoosePhoto).toHaveBeenCalledOnce();
    expect(empty.callbacks.onOpenChange).toHaveBeenCalledWith(false);
    empty.unmount();
    const full = setup(true, locale);
    fireEvent.press(full.getByRole("button", { name: remove }));
    expect(full.callbacks.onRemovePhoto).toHaveBeenCalledOnce();
    expect(full.callbacks.onOpenChange).toHaveBeenCalledWith(false);
  });
});
