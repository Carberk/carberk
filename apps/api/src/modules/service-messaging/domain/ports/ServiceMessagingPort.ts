import type { ServiceMessagingSchemas } from "@auto-tm/contracts";

export interface ServiceSubject { userId: string; sessionId: string }
export interface ServiceMessagingPort {
  open(subject: ServiceSubject, purpose: ServiceMessagingSchemas.ServicePurpose, sourceListingId?: string): Promise<{ id: string; resourceId: string }>;
  read(subject: ServiceSubject, id: string, after: number, limit: number): Promise<ServiceMessagingSchemas.ServiceConversation>;
  send(subject: ServiceSubject, id: string, message: ServiceMessagingSchemas.ServiceSend): Promise<ServiceMessagingSchemas.ServiceMessage>;
  assign(subject: ServiceSubject, id: string, expectedVersion: number, targetUserId?: string): Promise<void>;
  subscribePush(subject: ServiceSubject, id: string, deviceToken: string): Promise<void>;
  markRead(subject: ServiceSubject, id: string, throughSequence: number): Promise<void>;
  stage(subject: ServiceSubject, id: string, upload: ServiceMessagingSchemas.ServiceStageAttachment): Promise<{ id: string }>;
  upload(subject: ServiceSubject, id: string, attachmentId: string, bytes: Uint8Array): Promise<void>;
  file(subject: ServiceSubject, id: string, attachmentId: string): Promise<{ bytes: Uint8Array; contentType: string; filename: string }>;
  queue(subject: ServiceSubject, purpose: ServiceMessagingSchemas.ServicePurpose): Promise<{ id: string; resourceId: string; assigned: boolean; assignmentVersion: number; createdAt: string }[]>;
  mine(subject: ServiceSubject): Promise<{ id: string; purpose: ServiceMessagingSchemas.ServicePurpose; createdAt: string }[]>;
}
export const SERVICE_MESSAGING_PORT = Symbol("ServiceMessagingPort");
export interface ServicePrivateStore {
  putImmutable(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string, maxBytes: number): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}
export const SERVICE_PRIVATE_STORE = Symbol("ServicePrivateStore");
export interface ServiceRuntime { now(): Date; id(): string; syntheticEnabled(): boolean; syntheticSubjectAllowed(subject: ServiceSubject): boolean }
export const SERVICE_RUNTIME = Symbol("ServiceRuntime");
