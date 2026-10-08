import * as RN from "react-native";
import { StyleSheet } from "react-native";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../../../test/render";

import { MessageList, type MessageItem } from "./MessageList";

const ME = "buyer-1";
const PEER = "seller-1";

/** A local date and time, so the day boundaries hold in any time zone. */
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).toISOString();

function message(id: string, createdAt: string, updates: Partial<MessageItem> = {}): MessageItem {
  return { id, senderId: ME, text: id, createdAt, status: "sent", ...updates };
}

interface RenderedNode {
  children: (RenderedNode | string)[] | null;
}

/** Every text in render order. Rows are in data order, newest first; the inverted list draws each row above the previous one. */
function texts(json: ReturnType<ReturnType<typeof renderMobile>["toJSON"]>): string[] {
  const out: string[] = [];
  const walk = (node: RenderedNode | string | null) => {
    if (node == null) return;
    if (typeof node === "string") {
      out.push(node);
      return;
    }
    node.children?.forEach(walk);
  };
  (Array.isArray(json) ? json : [json]).forEach((node) => walk(node as RenderedNode | null));
  return out;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 2, 18, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MessageList day separators", () => {
  it("puts Today, Yesterday and a dated separator above the first Message of each day", () => {
    const screen = renderMobile(
      <MessageList
        currentUserId={ME}
        messages={[
          message("today-2", at(2, 9, 30), { senderId: PEER }),
          message("today-1", at(2, 9, 0)),
          message("yesterday-1", at(1, 20, 0), { senderId: PEER }),
          message("older-1", new Date(2026, 8, 28, 10, 0).toISOString()),
        ]}
      />,
    );

    const order = texts(screen.toJSON()).filter((s) =>
      ["Today", "Yesterday", "September 28", "today-2", "today-1", "yesterday-1", "older-1"].includes(s),
    );
    // The inverted list draws each row directly above the previous one, so the
    // separator row sits directly after (so above) its day's oldest Message.
    expect(order).toEqual([
      "today-2",
      "today-1",
      "Today",
      "yesterday-1",
      "Yesterday",
      "older-1",
      "September 28",
    ]);
  });

  it("renders each day separator as its own row directly above the day's oldest Message", () => {
    const screen = renderMobile(
      <MessageList
        currentUserId={ME}
        messages={[
          message("today-2", at(2, 9, 30), { senderId: PEER }),
          message("today-1", at(2, 9, 0)),
          message("yesterday-1", at(1, 20, 0), { senderId: PEER }),
        ]}
      />,
    );

    // An inverted VirtualizedList cell lays its children out bottom-up, so a
    // separator nested in the Message cell would land below the bubble. Each
    // separator must be a sibling row instead; the row after the oldest
    // Message of a day renders directly above it.
    const list = screen.UNSAFE_getByProps({ inverted: true });
    const keys = (list.props.data as Array<{ key: string }>).map((row) => row.key);
    expect(keys).toEqual([
      "today-2",
      "today-1",
      "today-1:day",
      "yesterday-1",
      "yesterday-1:day",
    ]);
  });

  it("writes the date in the app language", () => {
    const screen = renderMobile(
      <MessageList currentUserId={ME} messages={[message("old", new Date(2026, 8, 28, 10).toISOString())]} />,
      { locale: "ru" },
    );
    expect(screen.getByText("28 сентября")).toBeTruthy();
  });

  it("adds the year for a date in another year", () => {
    const screen = renderMobile(
      <MessageList currentUserId={ME} messages={[message("old", new Date(2025, 11, 30, 10).toISOString())]} />,
    );
    expect(screen.getByText("December 30, 2025")).toBeTruthy();
  });

  it("moves the separator up when an older page of the same day loads", () => {
    const firstPage = [message("today-1", at(2, 9)), message("yesterday-2", at(1, 21))];
    const screen = renderMobile(<MessageList currentUserId={ME} messages={firstPage} />);
    expect(texts(screen.toJSON()).filter((s) => ["Yesterday", "yesterday-2"].includes(s))).toEqual([
      "yesterday-2",
      "Yesterday",
    ]);

    screen.rerender(
      <MessageList
        currentUserId={ME}
        messages={[...firstPage, message("yesterday-1", at(1, 8)), message("before", new Date(2026, 8, 29, 8).toISOString())]}
      />,
    );

    expect(screen.getAllByText("Yesterday")).toHaveLength(1);
    expect(
      texts(screen.toJSON()).filter((s) => ["Yesterday", "yesterday-2", "yesterday-1", "September 29"].includes(s)),
    ).toEqual(["yesterday-2", "yesterday-1", "Yesterday", "September 29"]);
  });

  it("asks for older Messages at the top of the history", () => {
    const onLoadOlder = vi.fn();
    const screen = renderMobile(
      <MessageList currentUserId={ME} messages={[message("today-1", at(2, 9))]} onLoadOlder={onLoadOlder} />,
    );
    screen.UNSAFE_getByProps({ inverted: true }).props.onEndReached();
    expect(onLoadOlder).toHaveBeenCalledOnce();
  });
});

describe("MessageList older pages", () => {
  it("shows a loading row at the top of the history while an older page loads", () => {
    const screen = renderMobile(
      <MessageList currentUserId={ME} messages={[message("today-1", at(2, 9))]} loadingOlder />,
    );
    expect(screen.getByLabelText("Loading earlier messages")).toBeTruthy();
  });

  it("has no loading row otherwise", () => {
    const screen = renderMobile(<MessageList currentUserId={ME} messages={[message("today-1", at(2, 9))]} />);
    expect(screen.queryByLabelText("Loading earlier messages")).toBeNull();
  });

  it("keeps the Messages and offers Retry when an older page fails", () => {
    const onRetryOlder = vi.fn();
    const screen = renderMobile(
      <MessageList
        currentUserId={ME}
        messages={[message("today-1", at(2, 9))]}
        olderFailed
        onRetryOlder={onRetryOlder}
      />,
    );

    expect(screen.getByText("today-1")).toBeTruthy();
    expect(screen.getByText("Could not load earlier messages")).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(retry.props.style).toMatchObject({ minHeight: 44 });
    fireEvent.press(retry);
    expect(onRetryOlder).toHaveBeenCalledOnce();
  });
});

describe("MessageList Message actions", () => {
  function renderList(messages: MessageItem[], props: Partial<ComponentProps<typeof MessageList>> = {}) {
    const handlers = { onCopy: vi.fn(), onDelete: vi.fn(), onReport: vi.fn() };
    const screen = renderMobile(
      <MessageList currentUserId={ME} messages={messages} {...handlers} {...props} />,
    );
    return { screen, ...handlers };
  }

  const longPressText = (screen: ReturnType<typeof renderMobile>, label: string) =>
    fireEvent(screen.getByLabelText(label), "longPress");
  const longPressPhoto = (screen: ReturnType<typeof renderMobile>) =>
    fireEvent(screen.getByRole("imagebutton", { name: "Photo" }), "longPress");
  const sheetOpen = (screen: ReturnType<typeof renderMobile>) => screen.queryByText("Cancel") !== null;

  it("offers Copy, Report message and Cancel for the other participant's text Message", () => {
    const { screen } = renderList([message("peer-1", at(2, 9), { senderId: PEER })]);

    expect(sheetOpen(screen)).toBe(false);
    longPressText(screen, "peer-1, 09:00 AM");
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Report message" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("opens the sheet through the TalkBack long-press accessibility action", () => {
    const { screen } = renderList([message("peer-1", at(2, 9), { senderId: PEER })]);

    const target = screen.getByLabelText("peer-1, 09:00 AM");
    expect(target.props.accessibilityActions).toEqual([{ name: "longpress", label: "Message actions" }]);
    fireEvent(target, "accessibilityAction", { nativeEvent: { actionName: "longpress" } });
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });

  it("copies the text, closes the sheet and reports the Message to the screen", () => {
    const { screen, onCopy } = renderList([message("peer-1", at(2, 9), { senderId: PEER, text: "Call me" })]);

    longPressText(screen, "Call me, 09:00 AM");
    fireEvent.press(screen.getByRole("button", { name: "Copy" }));
    expect(onCopy).toHaveBeenCalledWith("Call me");
    expect(sheetOpen(screen)).toBe(false);
  });

  it("hands the Message to the report reasons and closes the sheet", () => {
    const { screen, onReport } = renderList([message("peer-1", at(2, 9), { senderId: PEER })]);

    longPressText(screen, "peer-1, 09:00 AM");
    fireEvent.press(screen.getByRole("button", { name: "Report message" }));
    expect(onReport).toHaveBeenCalledWith("peer-1");
    expect(sheetOpen(screen)).toBe(false);
  });

  it.each(["Copy", "Report message"])("removes %s when the open sheet's Message is deleted and redacted", (action) => {
    const incoming = message("peer-recent", at(2, 17, 59), { senderId: PEER, text: "Private original text" });
    const handlers = { onCopy: vi.fn(), onReport: vi.fn() };
    const screen = renderMobile(<MessageList currentUserId={ME} messages={[incoming]} {...handlers} />);
    longPressText(screen, "Private original text, 05:59 PM");
    expect(screen.getByRole("button", { name: action })).toBeTruthy();

    // The websocket deletion replaces the cached item and clears its text.
    screen.rerender(
      <MessageList currentUserId={ME} messages={[{ ...incoming, text: "", deletedAt: at(2, 18) }]} {...handlers} />,
    );
    expect(screen.getByText("Message deleted")).toBeTruthy();
    const staleAction = screen.queryByRole("button", { name: action });
    if (staleAction) fireEvent.press(staleAction);

    expect(handlers.onCopy).not.toHaveBeenCalled();
    expect(handlers.onReport).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Report message" })).toBeNull();
  });

  it.each(["pending", "failed", "absent"] as const)("closes an open sheet when its Message becomes %s", (status) => {
    const incoming = message("peer-recent", at(2, 17, 59), { senderId: PEER });
    const { screen, onCopy, onReport } = renderList([incoming]);
    longPressText(screen, "peer-recent, 05:59 PM");
    expect(sheetOpen(screen)).toBe(true);

    screen.rerender(
      <MessageList currentUserId={ME} messages={status === "absent" ? [] : [{ ...incoming, status }]} onCopy={onCopy} onReport={onReport} />,
    );
    expect(sheetOpen(screen)).toBe(false);
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Report message" })).toBeNull();
    expect(onCopy).not.toHaveBeenCalled();
    expect(onReport).not.toHaveBeenCalled();
  });

  it("closes on Cancel without acting", () => {
    const { screen, onCopy, onReport } = renderList([message("peer-1", at(2, 9), { senderId: PEER })]);

    longPressText(screen, "peer-1, 09:00 AM");
    fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(sheetOpen(screen)).toBe(false);
    expect(onCopy).not.toHaveBeenCalled();
    expect(onReport).not.toHaveBeenCalled();
  });

  it("hides Report message when reporting is switched off", () => {
    const { screen } = renderList([message("peer-1", at(2, 9), { senderId: PEER })], { reportEnabled: false });

    longPressText(screen, "peer-1, 09:00 AM");
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Report message" })).toBeNull();
  });

  it("offers Copy only for a Message already reported, which shows Reported", () => {
    const { screen } = renderList([message("peer-1", at(2, 9), { senderId: PEER })], {
      reportedMessageIds: new Set(["peer-1"]),
    });

    expect(screen.getByText("Reported")).toBeTruthy();
    longPressText(screen, "peer-1, 09:00 AM, Reported");
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Report message" })).toBeNull();
  });

  it("offers Copy and Delete for an own Message inside the delete window", () => {
    const { screen, onDelete } = renderList([message("own-1", at(2, 9), { canDelete: true })]);

    longPressText(screen, "own-1, 09:00 AM, Sent");
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Report message" })).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("own-1");
    expect(sheetOpen(screen)).toBe(false);
  });

  it("offers Copy only for an own Message past the delete window", () => {
    const { screen } = renderList([message("own-1", at(2, 9), { canDelete: false })]);

    longPressText(screen, "own-1, 09:00 AM, Sent");
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it.each([
    ["deleted", { deletedAt: at(2, 9, 5) }, "Message deleted, 09:00 AM"],
    ["pending", { status: "pending" as const }, "peer-1, 09:00 AM, Sending..."],
    ["failed", { status: "failed" as const }, "peer-1, 09:00 AM, Failed to send"],
  ])("opens no sheet for a %s Message", (_name, updates, label) => {
    const { screen } = renderList([message("peer-1", at(2, 9), { canDelete: true, ...updates })]);

    longPressText(screen, label);
    expect(sheetOpen(screen)).toBe(false);
  });

  it("offers Report message only for the other participant's image Message", () => {
    const { screen } = renderList([
      message("img-1", at(2, 9), { senderId: PEER, kind: "image", text: "", localImageUri: "file:///photo.jpg" }),
    ]);

    longPressPhoto(screen);
    expect(screen.getByRole("button", { name: "Report message" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  });

  it("offers Delete only for an own image Message inside the delete window", () => {
    const { screen } = renderList([
      message("img-1", at(2, 9), { kind: "image", text: "", localImageUri: "file:///photo.jpg", canDelete: true }),
    ]);

    longPressPhoto(screen);
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  });

  it("opens no sheet for a reported image Message or an own one past the window", () => {
    const { screen } = renderList(
      [message("img-1", at(2, 9), { senderId: PEER, kind: "image", text: "", localImageUri: "file:///photo.jpg" })],
      { reportedMessageIds: new Set(["img-1"]) },
    );

    longPressPhoto(screen);
    expect(sheetOpen(screen)).toBe(false);
  });

  it("offers Report message only for the other participant's Listing Message", () => {
    const { screen } = renderList([
      message("ref-1", at(2, 9), {
        senderId: PEER,
        kind: "post_ref",
        text: "",
        metadata: {
          listingId: "00000000-0000-4000-8000-0000000000a1",
          brandId: "00000000-0000-4000-8000-0000000000d1",
          modelId: "00000000-0000-4000-8000-0000000000d2",
          year: 2018,
          displayPriceTmt: 285000,
          priceCurrency: "TMT",
          status: "active",
          available: true,
        },
      }),
    ]);

    fireEvent(screen.getByRole("button", { name: /^Open/ }), "longPress");
    expect(screen.getByRole("button", { name: "Report message" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  });

  it.each([true, false])("own Listing-reference Message actions follow canDelete=%s", (canDelete) => {
    const ownListing = message("own-ref", at(2, canDelete ? 17 : 9, canDelete ? 59 : 0), {
      kind: "post_ref",
      text: "",
      canDelete,
      metadata: {
        listingId: "00000000-0000-4000-8000-0000000000a1",
        brandId: "00000000-0000-4000-8000-0000000000d1",
        modelId: "00000000-0000-4000-8000-0000000000d2",
        year: 2018,
        displayPriceTmt: 285000,
        priceCurrency: "TMT",
        status: "active",
        available: true,
      },
    });
    const { screen, onDelete, onCopy, onReport } = renderList([ownListing]);
    fireEvent(screen.getByRole("button", { name: /^Open/ }), "longPress");

    if (canDelete) {
      expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Report message" })).toBeNull();
      fireEvent.press(screen.getByRole("button", { name: "Delete" }));
      expect(onDelete.mock.calls).toEqual([["own-ref"]]);
      expect(sheetOpen(screen)).toBe(false);
    } else {
      expect(sheetOpen(screen)).toBe(false);
      expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
      expect(onDelete).not.toHaveBeenCalled();
    }
    expect(onCopy).not.toHaveBeenCalled();
    expect(onReport).not.toHaveBeenCalled();
  });

  it("opens the Listing of a Listing-reference Message on a press", () => {
    const onPostRefPress = vi.fn();
    const screen = renderMobile(
      <MessageList
        currentUserId={ME}
        messages={[
          message("ref-1", at(2, 9), {
            senderId: PEER,
            kind: "post_ref",
            text: "",
            metadata: {
              listingId: "00000000-0000-4000-8000-0000000000a1",
              brandId: "00000000-0000-4000-8000-0000000000d1",
              modelId: "00000000-0000-4000-8000-0000000000d2",
              year: 2018,
              displayPriceTmt: 285000,
              priceCurrency: "TMT",
              status: "active",
              available: true,
            },
          }),
        ]}
        onPostRefPress={onPostRefPress}
      />,
    );

    fireEvent.press(screen.getByRole("button", { name: /^Open/ }));
    expect(onPostRefPress).toHaveBeenCalledWith("00000000-0000-4000-8000-0000000000a1");
  });

  it("dims a reported Message in the list", () => {
    const { screen } = renderList([message("peer-1", at(2, 9), { senderId: PEER })], {
      reportedMessageIds: new Set(["peer-1"]),
    });

    let node = screen.getByText("Reported") as { parent: unknown; props?: { className?: string } } | null;
    while (node && !node.props?.className?.includes("max-w-[80%]")) {
      node = node.parent as typeof node;
    }
    expect(node?.props?.className).toContain("opacity-60");
  });

  it("opens the photo of an image Message", () => {
    const onImagePress = vi.fn();
    const screen = renderMobile(
      <MessageList
        currentUserId={ME}
        messages={[message("img-1", at(2, 9), { kind: "image", text: "", localImageUri: "file:///photo.jpg" })]}
        onImagePress={onImagePress}
      />,
    );

    fireEvent.press(screen.getByRole("imagebutton", { name: "Photo" }));
    expect(onImagePress).toHaveBeenCalledWith("file:///photo.jpg");
  });
});

describe("MessageList Read label", () => {
  it("labels only the last own Message once it is read", () => {
    const screen = renderMobile(
      <MessageList
        currentUserId={ME}
        messages={[
          message("peer-reply", at(2, 10), { senderId: PEER }),
          message("own-2", at(2, 9, 30), { status: "read" }),
          message("own-1", at(2, 9), { status: "read" }),
        ]}
      />,
    );

    expect(screen.getAllByText("Read")).toHaveLength(1);
    const order = texts(screen.toJSON()).filter((s) => ["Read", "own-2", "own-1"].includes(s));
    expect(order).toEqual(["own-2", "Read", "own-1"]);
  });

  it("has no Read label while the last own Message is not read yet", () => {
    const screen = renderMobile(
      <MessageList
        currentUserId={ME}
        messages={[
          message("own-2", at(2, 9, 30), { status: "delivered" }),
          message("own-1", at(2, 9), { status: "read" }),
        ]}
      />,
    );
    expect(screen.queryByText("Read")).toBeNull();
  });

  it("moves the label to a newer own Message once that one is read", () => {
    const older = message("own-1", at(2, 9), { status: "read" });
    const screen = renderMobile(
      <MessageList currentUserId={ME} messages={[message("own-2", at(2, 9, 30), { status: "delivered" }), older]} />,
    );
    expect(screen.queryByText("Read")).toBeNull();

    screen.rerender(
      <MessageList currentUserId={ME} messages={[message("own-2", at(2, 9, 30), { status: "read" }), older]} />,
    );

    expect(screen.getAllByText("Read")).toHaveLength(1);
    expect(texts(screen.toJSON()).filter((s) => ["Read", "own-2", "own-1"].includes(s))).toEqual([
      "own-2",
      "Read",
      "own-1",
    ]);
  });
});

describe("MessageList empty", () => {
  it("shows the empty state with no Messages", () => {
    const screen = renderMobile(<MessageList currentUserId={ME} messages={[]} />);
    expect(screen.getByText("No messages yet. Start the conversation.")).toBeTruthy();
  });
});

describe("MessageList empty layout and send scrolling", () => {
  it("lets the native inverted list keep its empty label upright", () => {
     const screen = renderMobile(<MessageList messages={[]} currentUserId={ME} />);
     const label = screen.getByText("No messages yet. Start the conversation.");
     // VirtualizedList already counter-inverts ListEmptyComponent. A second
     // transform overrides its correction and flips the label on the device.
     let container = label.parent;
     while (container && !container.props.className?.includes("py-12")) container = container.parent;
     if (!container) throw new Error("Empty-state container missing");
     expect(StyleSheet.flatten(container.props.style)?.transform).toBeUndefined();
   });
  
  it("returns to the newest Message after sending while reading older history", () => {
    const requests = (RN as unknown as { scrollRequests: unknown[] }).scrollRequests;
    const screen = renderMobile(<MessageList currentUserId={ME} messages={[message("old", at(1, 10), { senderId: PEER })]} />);
    requests.length = 0;
    screen.rerender(<MessageList currentUserId={ME} sendCount={1} messages={[
      message("new-send", at(2, 10), { status: "pending" }),
      message("old", at(1, 10), { senderId: PEER }),
    ]} />);
    expect(screen.getByText("new-send")).toBeTruthy();
    expect(requests).toContainEqual({ method: "scrollToOffset", offset: 0, animated: false });
  });
  
  it("leaves older history in place when an incoming Message arrives", () => {
    const requests = (RN as unknown as { scrollRequests: unknown[] }).scrollRequests;
    const screen = renderMobile(<MessageList currentUserId={ME} messages={[message("old", at(1, 10), { senderId: PEER })]} />);
    requests.length = 0;
    screen.rerender(<MessageList currentUserId={ME} messages={[message("incoming", at(2, 10), { senderId: PEER }), message("old", at(1, 10), { senderId: PEER })]} />);
    expect(screen.getByText("incoming")).toBeTruthy();
    expect(requests).toHaveLength(0);
  });
});

describe("MessageList acknowledgement preserves reading position", () => {
  it("scrolls for the send, but not its later acknowledgement after the User scrolls up", () => {
    const requests = (RN as unknown as { scrollRequests: unknown[] }).scrollRequests;
    const screen = renderMobile(<MessageList currentUserId={ME} sendCount={1} messages={[message("pending-slow", at(2, 10), { status: "pending" })]} />);
    requests.length = 0; // The User has moved into older history during the send.
    screen.rerender(<MessageList currentUserId={ME} sendCount={1} messages={[message("server-slow", at(2, 10))]} />);
    expect(screen.getByText("server-slow")).toBeTruthy();
    expect(requests).toHaveLength(0);
    screen.rerender(<MessageList currentUserId={ME} sendCount={2} messages={[message("next-send", at(2, 11), { status: "pending" }), message("server-slow", at(2, 10))]} />);
    expect(requests).toEqual([{ method: "scrollToOffset", offset: 0, animated: false }]);
  });
});
