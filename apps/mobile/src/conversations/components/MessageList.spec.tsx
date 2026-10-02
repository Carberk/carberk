import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderMobile } from "../../../test/render";

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

/** Every text in render order. Cells are in data order, newest first; the list draws them bottom-up. */
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
    // Newest first in the tree: each separator sits just before (so above) its day's oldest Message.
    expect(order).toEqual([
      "today-2",
      "Today",
      "today-1",
      "Yesterday",
      "yesterday-1",
      "September 28",
      "older-1",
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
      "Yesterday",
      "yesterday-2",
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
    ).toEqual(["yesterday-2", "Yesterday", "yesterday-1", "September 29"]);
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
