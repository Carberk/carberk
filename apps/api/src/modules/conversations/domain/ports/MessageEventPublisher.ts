import type { MessageKind, MessageMetadata } from "../types";

export interface MessageSentEvent {
  event: "MessageSent";
  conversationId: string;
  /** Business events never broadcast to historical conversation rooms. */
  businessId?: string;
  echoSender?: boolean;
  messageId: string;
  senderId: string;
  recipientId: string;
  sentAt: string;
  messageKind: MessageKind;
  messageBody: string | null;
  messageMetadata: MessageMetadata | null;
  messageDeletedAt: string | null;
  clientMessageId: string | null;
}

export interface MessageEventPublisher {
  emitMessageSent(event: MessageSentEvent): Promise<void>;
}

export const MESSAGE_EVENT_PUBLISHER = Symbol("MessageEventPublisher");
