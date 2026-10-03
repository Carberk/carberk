import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../../../test/render";

import { MessageActionsSheet } from "./MessageActionsSheet";

function renderSheet(props: Partial<React.ComponentProps<typeof MessageActionsSheet>> = {}) {
  const handlers = { onOpenChange: vi.fn(), onCopy: vi.fn(), onReport: vi.fn(), onDelete: vi.fn() };
  const screen = renderMobile(
    <MessageActionsSheet open canCopy canReport canDelete {...handlers} {...props} />,
  );
  return { screen, ...handlers };
}

describe("MessageActionsSheet", () => {
  it("renders nothing while closed", () => {
    const { screen } = renderSheet({ open: false });
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("lists only the offered actions, with Cancel last", () => {
    const { screen } = renderSheet({ canDelete: false });

    const names = screen.getAllByRole("button").map((node) => node.props.accessibilityLabel);
    expect(names).toEqual(["Copy", "Report message", "Cancel"]);
  });

  it("omits Copy and Report when they are not offered", () => {
    const { screen } = renderSheet({ canCopy: false, canReport: false });

    const names = screen.getAllByRole("button").map((node) => node.props.accessibilityLabel);
    expect(names).toEqual(["Delete", "Cancel"]);
  });

  it("gives every item a 44 pt touch target", () => {
    const { screen } = renderSheet();

    for (const node of screen.getAllByRole("button")) {
      expect(node.props.className.split(" ")).toContain("min-h-[44px]");
    }
  });

  it("runs the chosen action and closes the sheet", () => {
    const { screen, onCopy, onReport, onDelete, onOpenChange } = renderSheet();

    fireEvent.press(screen.getByRole("button", { name: "Copy" }));
    expect(onCopy).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    fireEvent.press(screen.getByRole("button", { name: "Report message" }));
    expect(onReport).toHaveBeenCalledOnce();

    fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("closes on Cancel without acting", () => {
    const { screen, onCopy, onOpenChange } = renderSheet();

    fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCopy).not.toHaveBeenCalled();
  });

  it("reads in Russian and Turkmen", () => {
    const ru = renderMobile(
      <MessageActionsSheet open canCopy canReport canDelete onOpenChange={vi.fn()} onCopy={vi.fn()} onReport={vi.fn()} onDelete={vi.fn()} />,
      { locale: "ru" },
    );
    expect(ru.getAllByRole("button").map((node) => node.props.accessibilityLabel))
      .toEqual(["Копировать", "Пожаловаться на сообщение", "Удалить", "Отмена"]);
    ru.unmount();
    const tk = renderMobile(
      <MessageActionsSheet open canCopy canReport canDelete onOpenChange={vi.fn()} onCopy={vi.fn()} onReport={vi.fn()} onDelete={vi.fn()} />,
      { locale: "tk" },
    );
    expect(tk.getAllByRole("button").map((node) => node.props.accessibilityLabel))
      .toEqual(["Göçür", "Habar barada şikaýat et", "Poz", "Ýatyr"]);
  });
});
