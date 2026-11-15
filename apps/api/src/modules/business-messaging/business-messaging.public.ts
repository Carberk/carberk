import type {
  SendServiceTextInput, ReadServiceMessagesInput, ServiceMessage, ServiceMessagePage,
  AcknowledgeServiceMessagesInput, ServiceReceipt, ServiceStream,
  SendOnceServiceTextInput, FindServiceTextOperationInput,
} from "./domain/ServiceMessageRepository";

export {
  ServiceMessageError,
  type ServiceMessageErrorCode,
  type ServiceStream,
  type SendServiceTextInput,
  type SendOnceServiceTextInput,
  type FindServiceTextOperationInput,
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
  /** Once across senders/attempts; conflicting text or ordinary-intent adoption refuses.
   * Recovery preserves the first committed author, attempt, text, order and time.
   * The optional caller-owned confirmation runs after append waits, inside the
   * message transaction before commit. Its refusal rolls back and propagates.
   * The caller must retain its own authority fence; no persistence is exposed.
   */
  sendOnceText(input: SendOnceServiceTextInput, confirmCommit?: () => Promise<void>): Promise<ServiceMessage>;
  /** Locks/creates the stream; waits for older append commit/rollback, never ACKs. */
  findTextOperation(input: FindServiceTextOperationInput): Promise<ServiceMessage | null>;
  sendText(input: SendServiceTextInput): Promise<ServiceMessage>;
  readMessages(input: ReadServiceMessagesInput): Promise<ServiceMessagePage>;
  acknowledge(input: AcknowledgeServiceMessagesInput): Promise<ServiceReceipt>;
  readReceipts(input: ServiceStream): Promise<{ items: ServiceReceipt[] }>;
}
