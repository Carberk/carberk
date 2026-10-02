import type { MessageStatus } from "./components/MessageBubble";
import { isSameLocalDay } from "./messageTime";

interface RowMessage {
  senderId: string;
  createdAt: string;
  status: MessageStatus;
  deletedAt?: string | null;
}

export interface MessageRow<T extends RowMessage> {
  message: T;
  /** The oldest loaded Message of its day: the day separator sits above it. */
  startsDay: boolean;
  /** The last own Message, once read (D6). */
  showReadLabel: boolean;
}

/**
 * Decorates Messages, newest first as the inverted list holds them, with the
 * day separator and Read label. A page of older Messages appended later moves
 * the separator up to the new oldest Message of that day.
 */
export function buildMessageRows<T extends RowMessage>(
  messages: readonly T[],
  currentUserId: string,
): MessageRow<T>[] {
  const lastOwn = messages.find((m) => m.senderId === currentUserId);
  return messages.map((message, index) => {
    const older = messages[index + 1];
    return {
      message,
      startsDay: !older || !isSameLocalDay(older.createdAt, message.createdAt),
      showReadLabel:
        message === lastOwn && message.status === "read" && !message.deletedAt,
    };
  });
}
