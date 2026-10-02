import { beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../../../test/render";

import { ConversationMenuSheet } from "./ConversationMenuSheet";

const handlers = {
  onOpenChange: vi.fn(),
  onToggleMute: vi.fn(),
  onReport: vi.fn(),
  onBlock: vi.fn(),
  onUnblock: vi.fn(),
};

function menu(props: Partial<React.ComponentProps<typeof ConversationMenuSheet>> = {}) {
  return renderMobile(
    <ConversationMenuSheet open isMuted={false} isBlocked={false} {...handlers} {...props} />,
  );
}

beforeEach(() => {
  Object.values(handlers).forEach((handler) => handler.mockClear());
});

describe("ConversationMenuSheet", () => {
  it("lists Mute, Report and Block, in that order, and nothing else", () => {
    const screen = menu();

    expect(screen.getAllByRole("button").map((item) => item.props.accessibilityLabel)).toEqual([
      "Mute notifications",
      "Report",
      "Block user",
    ]);
    expect(screen.queryByText(/Delete/)).toBeNull();
    expect(screen.queryByText(/support/i)).toBeNull();
  });

  it("offers Unmute and Unblock when muted and blocked", () => {
    const screen = menu({ isMuted: true, isBlocked: true });

    expect(screen.getAllByRole("button").map((item) => item.props.accessibilityLabel)).toEqual([
      "Unmute notifications",
      "Report",
      "Unblock user",
    ]);
  });

  it("gives every item a 44 pt target and draws Block in the destructive colour", () => {
    const screen = menu();

    for (const item of screen.getAllByRole("button")) {
      expect(item.props.className).toContain("min-h-11");
    }
    expect(screen.getByText("Block user").props.className).toContain("text-destructive");
    expect(screen.getByText("Mute notifications").props.className).not.toContain("text-destructive");
  });

  it("closes, then runs the chosen action", () => {
    const screen = menu();

    fireEvent.press(screen.getByRole("button", { name: "Mute notifications" }));
    fireEvent.press(screen.getByRole("button", { name: "Report" }));
    fireEvent.press(screen.getByRole("button", { name: "Block user" }));

    expect(handlers.onToggleMute).toHaveBeenCalledOnce();
    expect(handlers.onReport).toHaveBeenCalledOnce();
    expect(handlers.onBlock).toHaveBeenCalledOnce();
    expect(handlers.onOpenChange).toHaveBeenCalledTimes(3);
    expect(handlers.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("runs Unblock when blocked", () => {
    const screen = menu({ isBlocked: true });

    fireEvent.press(screen.getByRole("button", { name: "Unblock user" }));
    expect(handlers.onUnblock).toHaveBeenCalledOnce();
    expect(handlers.onBlock).not.toHaveBeenCalled();
  });

  it("hides Report when there is no report action", () => {
    const screen = menu({ onReport: undefined });

    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("disables Mute while a mute change is in flight", () => {
    const screen = menu({ muteDisabled: true });

    expect(screen.getByRole("button", { name: "Mute notifications", disabled: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Block user", disabled: false })).toBeTruthy();
  });

  it("closes on a tap outside (the shell mock passes the prop to a View)", () => {
    expect(menu().UNSAFE_getByProps({ closeOnBackdropPress: true })).toBeTruthy();
  });

  it("is localized", () => {
    const screen = renderMobile(
      <ConversationMenuSheet open isMuted={false} isBlocked={false} {...handlers} />,
      { locale: "ru" },
    );

    expect(screen.getAllByRole("button").map((item) => item.props.accessibilityLabel)).toEqual([
      "Отключить уведомления",
      "Пожаловаться",
      "Заблокировать",
    ]);
  });
});
