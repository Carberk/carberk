import type { MessageStatus } from "./components/MessageBubble";
import { isSameLocalDay } from "./messageTime";

interface RowMessage {
  id: string;
  senderId: string;
  createdAt: string;
  status: MessageStatus;
  deletedAt?: string | null;
}

/** One inverted-list row: a Message, or the day separator above a day's oldest Message. */
export type MessageListRow<T extends RowMessage> =
  | { kind: "message"; key: string; message: T; showReadLabel: boolean }
  | { kind: "separator"; key: string; day: string };

/**
 * Decorates Messages, newest first as the inverted list holds them, with the
 * day separator and Read label. An inverted VirtualizedList cell lays its own
 * children out bottom-up, so the separator cannot share the Message cell: it
 * is its own row. The list draws each row directly above the previous one,
 * so a day's separator row sits right after that day's oldest loaded Message.
 * A page of older Messages appended later moves the separator up to the new
 * oldest Message of that day.
 */
export function buildMessageRows<T extends RowMessage>(
  messages: readonly T[],
  currentUserId: string,
): MessageListRow<T>[] {
  const lastOwn = messages.find((m) => m.senderId === currentUserId);
  const rows: MessageListRow<T>[] = [];
  messages.forEach((message, index) => {
    const older = messages[index + 1];
    rows.push({
      kind: "message",
      key: message.id,
      message,
      showReadLabel:
        message === lastOwn && message.status === "read" && !message.deletedAt,
    });
    if (!older || !isSameLocalDay(older.createdAt, message.createdAt)) {
      rows.push({ kind: "separator", key: `${message.id}:day`, day: message.createdAt });
    }
  });
  return rows;
}
