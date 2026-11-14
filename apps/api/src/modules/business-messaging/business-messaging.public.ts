import type {
  SendServiceTextInput, ReadServiceMessagesInput, ServiceMessage, ServiceMessagePage,
} from "./domain/ServiceMessageRepository";

export {
  ServiceMessageError,
  type ServiceMessageErrorCode,
  type ServiceStream,
  type SendServiceTextInput,
  type ReadServiceMessagesInput,
  type ServiceMessage,
  type ServiceMessagePage,
} from "./domain/ServiceMessageRepository";

export const BUSINESS_MESSAGING_PORT = Symbol("BusinessMessagingPort");

/** Trusted server use only: keys identify streams, never authenticate a reader/sender.
 * History must hold its current authority/assignment fence through each operation.
 * On UNAVAILABLE, retry the same intent: a lost result is not a new message.
 * Facts establish Sent only. Cursors are message IDs in the exact requested stream.
 */
export interface BusinessMessagingPort {
  sendText(input: SendServiceTextInput): Promise<ServiceMessage>;
  readMessages(input: ReadServiceMessagesInput): Promise<ServiceMessagePage>;
}
