import type {
  SendServiceTextInput, ReadServiceMessagesInput, ServiceMessage, ServiceMessagePage,
  AcknowledgeServiceMessagesInput, ServiceReceipt, ServiceStream,
} from "./domain/ServiceMessageRepository";

export {
  ServiceMessageError,
  type ServiceMessageErrorCode,
  type ServiceStream,
  type SendServiceTextInput,
  type ReadServiceMessagesInput,
  type ServiceMessage,
  type ServiceMessagePage,
  type ServiceParticipant,
  type AcknowledgeServiceMessagesInput,
  type ServiceReceipt,
} from "./domain/ServiceMessageRepository";

export const BUSINESS_MESSAGING_PORT = Symbol("BusinessMessagingPort");

/** Trusted server use only: keys identify streams, never authenticate a reader/sender.
 * History must hold its current authority/assignment fence through each operation.
 * On UNAVAILABLE, retry the same intent: a lost result is not a new message.
 * Message facts establish Sent only. Cursors identify messages in the exact stream.
 * Pass the current participant/session/version on transcript reads to allow later
 * explicit receipt acks. Fetching alone never establishes Received or Read.
 * Receipt orders are attributable to participantId + assignmentVersion, never a
 * generic staff role; 0 is the requester, positive versions are staff epochs.
 */
export interface BusinessMessagingPort {
  sendText(input: SendServiceTextInput): Promise<ServiceMessage>;
  readMessages(input: ReadServiceMessagesInput): Promise<ServiceMessagePage>;
  acknowledge(input: AcknowledgeServiceMessagesInput): Promise<ServiceReceipt>;
  readReceipts(input: ServiceStream): Promise<{ items: ServiceReceipt[] }>;
}
