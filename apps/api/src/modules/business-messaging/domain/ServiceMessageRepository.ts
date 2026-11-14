import type { ServiceMessagesSchemas } from "@auto-tm/contracts";

export type ServiceStream = ServiceMessagesSchemas.ServiceStream;
export type SendServiceTextInput = ServiceMessagesSchemas.SendServiceText;
export type ServiceParticipant = ServiceMessagesSchemas.ServiceParticipant;
export type ReadServiceMessagesInput = ServiceMessagesSchemas.ReadServiceMessages & { participant?: ServiceParticipant };
export type AcknowledgeServiceMessagesInput = ServiceMessagesSchemas.AcknowledgeServiceMessages;
export type ServiceReceipt = ServiceMessagesSchemas.ServiceReceipt;
export type ServiceMessage = ServiceMessagesSchemas.ServiceMessage;
export type ServiceMessagePage = ServiceMessagesSchemas.ServiceMessagePage;

export type ServiceMessageErrorCode =
  | "SERVICE_MESSAGE_INVALID_INPUT"
  | "SERVICE_MESSAGE_INTENT_CONFLICT"
  | "SERVICE_MESSAGE_INVALID_CURSOR"
  | "SERVICE_MESSAGE_UNAVAILABLE";

export class ServiceMessageError extends Error {
  constructor(readonly code: ServiceMessageErrorCode) {
    super(code);
    this.name = "ServiceMessageError";
  }
}

export const SERVICE_MESSAGE_REPOSITORY = Symbol("ServiceMessageRepository");

/** Internal persistence boundary. No identity, assignment or service-object policy. */
export interface ServiceMessageRepository {
  // Serialize append/retry within the stream; return the original on a reused intent.
  append(input: SendServiceTextInput): Promise<ServiceMessage>;
  // Ascending committed order, cursor must be an existing message in this stream.
  page(input: ReadServiceMessagesInput & { limit: number }): Promise<ServiceMessagePage>;
  acknowledge(input: AcknowledgeServiceMessagesInput): Promise<ServiceReceipt>;
  receipts(input: ServiceStream): Promise<{ items: ServiceReceipt[] }>;
}
