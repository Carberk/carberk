import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { type Prisma, PrismaService } from "@auto-tm/db";
import { ServiceMessagingSchemas } from "@auto-tm/contracts";

import { STAFF_AUTHORITY_PORT, type StaffAuthorityPort, StaffAuthorityDenied } from "../../identity/identity.public";
import { assertServiceAccess, serviceCapability, ServiceDenied, type ServiceAction, type ServiceActor, type ServiceScope } from "../domain/serviceAccess";
import { staffedMilliseconds, transitionSupport, type SupportState, type SupportAction } from "../domain/SupportOperations";
import { assertServiceRights } from "../domain/ServiceRights";
import { SERVICE_PRIVATE_STORE, SERVICE_RUNTIME, type ServiceMessagingPort, type ServicePrivateStore, type ServiceRuntime, type ServiceSubject } from "../domain/ports/ServiceMessagingPort";
import { cleanServiceBytes } from "./cleanServiceBytes";

type Tx = Prisma.TransactionClient;
const graph = { supportCase: true, historyRequest: true } as const;
type Conversation = Prisma.ServiceConversationGetPayload<{ include: typeof graph }>;
const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

/** Every transport uses this transaction boundary. User/session locks fence
 * grant/deletion changes; owner/conversation locks fence handover and retries. */
@Injectable()
export class PrismaServiceMessaging implements ServiceMessagingPort {
 constructor(@Inject(PrismaService) private readonly db: PrismaService,
  @Inject(STAFF_AUTHORITY_PORT) private readonly staff: StaffAuthorityPort,
  @Inject(SERVICE_PRIVATE_STORE) private readonly store: ServicePrivateStore,
  @Inject(SERVICE_RUNTIME) private readonly runtime: ServiceRuntime) {}

 private async actor(tx: Tx, subject: ServiceSubject, purpose: ServiceMessagingSchemas.ServicePurpose): Promise<ServiceActor> {
  if (!this.runtime.syntheticSubjectAllowed(subject)) throw new ServiceDenied("COLLECTION_DISABLED");
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${subject.userId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${subject.sessionId} FOR UPDATE`;
  const [user, session] = await Promise.all([tx.user.findUnique({ where: { id: subject.userId } }), tx.session.findUnique({ where: { id: subject.sessionId } })]);
  let staffAuthorized = false;
  try { await this.staff.authorize({ ...subject, capability: serviceCapability(purpose) }, tx); staffAuthorized = true; }
  catch (error) { if (!(error instanceof StaffAuthorityDenied)) throw error; }
  return { ...subject, sessionValid: !!user && !!session && session.userId === subject.userId && session.expiresAt > this.runtime.now(), deleting: !!user?.deletionScheduledAt, suspended: !!user?.suspendedAt, staffAuthorized };
 }
 private async locked<T>(subject: ServiceSubject, id: string, action: ServiceAction, work: (tx: Tx, row: Conversation, scope: ServiceScope, actor: ServiceActor, audience: "customer" | "staff") => Promise<T>, otherPrincipal?: string): Promise<T> {
  return this.db.$transaction(async tx => {
   // Lock principal first, the order used by Identity's deletion/grant writers.
   await tx.$queryRaw`SELECT id FROM users WHERE id IN (${subject.userId}, ${otherPrincipal ?? subject.userId}) ORDER BY id FOR UPDATE`;
   const initial = await tx.serviceConversation.findUnique({ where: { id }, include: graph });
   if (!initial) throw new ServiceDenied("NO_ACCESS");
   if (initial.supportCaseId) await tx.$queryRaw`SELECT id FROM support_cases WHERE id = ${initial.supportCaseId} FOR UPDATE`;
   else await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id = ${initial.historyRequestId} FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM service_conversations WHERE id = ${id} FOR UPDATE`;
   const row = await tx.serviceConversation.findUniqueOrThrow({ where: { id }, include: graph });
   const owner = row.supportCase ?? row.historyRequest;
   if (!owner || (row.purpose !== "support" && row.purpose !== "history")) throw new ServiceDenied("NO_ACCESS");
   const scope: ServiceScope = { purpose: row.purpose, conversationId: id, resourceId: owner.id, customerId: owner.customerId, assigneeId: owner.assigneeId, assignmentVersion: owner.assignmentVersion, lifecycleEpoch: row.lifecycleEpoch, erased: row.erasedAt !== null };
   const actor = await this.actor(tx, subject, scope.purpose);
   const audience = assertServiceAccess(scope, actor, action === "file" ? "read" : action);
   if (audience === "staff") await tx.serviceAudit.create({ data: { actorId: subject.userId, purpose: row.purpose, resourceId: owner.id, action: `SERVICE_${action.toUpperCase()}`, assignmentVersion: owner.assignmentVersion } });
   return work(tx, row, scope, actor, audience);
  }, { timeout: 20000 });
 }
 async subscribePush(subject: ServiceSubject, id: string, deviceToken: string): Promise<void> {
  await this.locked(subject, id, "read", async (tx, row) => {
   const device = await tx.fcmDevice.findUnique({ where: { token: deviceToken } });
   if (!device || device.userId !== subject.userId || device.invalidatedAt) throw new ServiceDenied("NO_ACCESS");
   await tx.$queryRaw`SELECT id FROM fcm_devices WHERE id = ${device.id} FOR UPDATE`;
   const current = await tx.fcmDevice.findUnique({ where: { id: device.id } });
   if (!current || current.userId !== subject.userId || current.token !== deviceToken || current.invalidatedAt) throw new ServiceDenied("NO_ACCESS");
   await tx.servicePushSubscription.upsert({ where: { sessionId_deviceId_conversationId: { sessionId: subject.sessionId, deviceId: device.id, conversationId: id } }, create: { sessionId: subject.sessionId, deviceId: device.id, conversationId: id, lifecycleEpoch: row.lifecycleEpoch }, update: { lifecycleEpoch: row.lifecycleEpoch } });
  });
 }
 async open(subject: ServiceSubject, purpose: ServiceMessagingSchemas.ServicePurpose, sourceListingId?: string) {
  if (!this.runtime.syntheticEnabled()) throw new ServiceDenied("COLLECTION_DISABLED");
  return this.db.$transaction(async tx => {
   const actor = await this.actor(tx, subject, purpose);
   if (!actor.sessionValid || actor.deleting) throw new ServiceDenied("NO_ACCESS");
   if (purpose === "support") {
    const prior = await tx.supportCase.findUnique({ where: { customerId: subject.userId }, include: { conversation: true } });
    if (prior?.conversation && !prior.conversation.erasedAt) return { id: prior.conversation.id, resourceId: prior.id };
   }
   if (sourceListingId && !await tx.listing.findUnique({ where: { id: sourceListingId }, select: { id: true } })) throw new ServiceDenied("NO_ACCESS");
   const ownerData = { id: this.runtime.id(), customerId: subject.userId, ...(sourceListingId ? { sourceListingId } : {}), mode: "synthetic" };
   const owner = purpose === "support" ? await tx.supportCase.create({ data: ownerData }) : await tx.vehicleHistoryRequest.create({ data: ownerData });
   const conversation = await tx.serviceConversation.create({ data: { id: this.runtime.id(), purpose, ...(purpose === "support" ? { supportCaseId: owner.id } : { historyRequestId: owner.id }) } });
   return { id: conversation.id, resourceId: owner.id };
  });
 }
 async read(subject: ServiceSubject, id: string, after: number, limit: number): Promise<ServiceMessagingSchemas.ServiceConversation> {
  return this.locked(subject, id, "read", async (tx, row, scope, _actor, audience) => {
   const where = { conversationId: id, ...(audience === "customer" ? { visibility: "customer" } : {}) };
   const [messages, state, unread, assigned, peerState] = await Promise.all([
    tx.serviceMessage.findMany({ where: { ...where, sequence: { gt: after } }, orderBy: { sequence: "asc" }, take: limit + 1, include: { attachment: true, sender: { select: { displayName: true, nameNumber: true } } } }),
    tx.serviceReadState.findUnique({ where: { conversationId_userId: { conversationId: id, userId: subject.userId } } }),
    tx.serviceReadState.findUnique({ where: { conversationId_userId: { conversationId: id, userId: subject.userId } } }).then(state => tx.serviceMessage.count({ where: { ...where, sequence: { gt: state?.lastSequence ?? 0 }, NOT: { senderId: subject.userId } } })),
    scope.assigneeId && (scope.purpose === "history" || audience === "staff") ? tx.user.findUnique({ where: { id: scope.assigneeId }, select: { displayName: true, nameNumber: true } }) : null,
    (audience === "customer" ? scope.assigneeId : scope.customerId) ? tx.serviceReadState.findUnique({ where: { conversationId_userId: { conversationId: id, userId: (audience === "customer" ? scope.assigneeId : scope.customerId) as string } } }) : null,
   ]);
   const owner = row.supportCase ?? row.historyRequest;
   return { id, resourceId: scope.resourceId, purpose: scope.purpose, status: owner?.status ?? "unavailable", assignmentVersion: scope.assignmentVersion, assigned: scope.assigneeId !== null, operatorName: assigned ? assigned.displayName ?? `#${assigned.nameNumber}` : null, sourceListingId: owner?.sourceListingId ?? null, canSend: true, support: row.supportCase ? { unansweredSince: row.supportCase.unansweredSince?.toISOString() ?? null, awaitingCustomerSince: row.supportCase.awaitingCustomerSince?.toISOString() ?? null, investigation: row.supportCase.investigationState === "active", category: this.supportState(row.supportCase).category, escalatedAt: row.supportCase.escalatedAt?.toISOString() ?? null, staffedElapsedMs: row.supportCase.unansweredSince ? staffedMilliseconds(row.supportCase.unansweredSince, this.runtime.now()) : 0, overdue: !!row.supportCase.unansweredSince && staffedMilliseconds(row.supportCase.unansweredSince, this.runtime.now()) >= 4 * 3600000 } : null, messages: messages.slice(0, limit).map(message => this.messageDto(message, scope.purpose, audience === "staff")), lastSequence: row.lastSequence, readThrough: state?.lastSequence ?? 0, peerReadThrough: peerState?.lastSequence ?? 0, unread, hasMore: messages.length > limit };
  });
 }
 private messageDto(row: Prisma.ServiceMessageGetPayload<{ include: { attachment: true; sender: { select: { displayName: true; nameNumber: true } } } }>, purpose: ServiceMessagingSchemas.ServicePurpose, staffViewer = false): ServiceMessagingSchemas.ServiceMessage {
  return { id: row.id, clientMessageId: row.clientMessageId, sequence: row.sequence, sender: row.senderKind === "customer" ? "customer" : purpose === "support" ? "carberk" : "operator", operatorName: row.senderKind === "staff" && (purpose === "history" || staffViewer) && row.sender ? row.sender.displayName ?? `#${row.sender.nameNumber}` : null, visibility: row.visibility === "staff" ? "staff" : "customer", body: row.body, createdAt: row.createdAt.toISOString(), attachment: row.attachment && !row.attachment.removedAt ? { id: row.attachment.id, contentType: row.attachment.contentType, filename: row.attachment.filename, sizeBytes: row.attachment.sizeBytes ?? 0 } : null };
 }
 async send(subject: ServiceSubject, id: string, message: ServiceMessagingSchemas.ServiceSend): Promise<ServiceMessagingSchemas.ServiceMessage> {
  return this.locked(subject, id, message.visibility === "staff" ? "note" : "send", async (tx, row, scope, _actor, audience) => {
   const hash = digest(JSON.stringify({ supportKind: message.supportKind ?? null, reason: message.reason ?? null, body: message.body ?? null, attachmentId: message.attachmentId ?? null, visibility: message.visibility }));
   const prior = await tx.serviceMessage.findUnique({ where: { conversationId_senderId_clientMessageId: { conversationId: id, senderId: subject.userId, clientMessageId: message.clientMessageId } }, include: { attachment: true, sender: { select: { displayName: true, nameNumber: true } } } });
   if (prior) { if (prior.requestHash !== hash) throw new ServiceDenied("IDEMPOTENCY_CONFLICT"); return this.messageDto(prior, scope.purpose, audience === "staff"); }
   if (!message.body?.trim() && !message.attachmentId) throw new ServiceDenied("INVALID_MESSAGE");
   if (message.attachmentId) {
    const file = await tx.serviceAttachment.findUnique({ where: { id: message.attachmentId } });
    if (!file || file.conversationId !== id || file.uploaderId !== subject.userId || file.lifecycleEpoch !== scope.lifecycleEpoch || file.state !== "staged" || !file.objectKey || file.removedAt || file.expiresAt <= this.runtime.now() || file.visibility !== message.visibility) throw new ServiceDenied("INVALID_ATTACHMENT");
    const rights = ServiceMessagingSchemas.ServiceRightsSchema.parse(file.rights);
    assertServiceRights(scope.purpose, { category: ServiceMessagingSchemas.ServiceContentCategorySchema.parse(file.category), visibility: message.visibility, contentType: ServiceMessagingSchemas.ServiceStageAttachmentSchema.shape.contentType.parse(file.contentType), sizeBytes: file.sizeBytes ?? 0, filename: file.filename, rights }, this.runtime.now());
    await tx.serviceAttachment.update({ where: { id: file.id }, data: { state: "adopted", adoptedAt: this.runtime.now() } });
   }
   if (row.supportCase) {
    if (audience === "customer" && (message.supportKind || message.reason)) throw new ServiceDenied("INVALID_MESSAGE");
    if (message.visibility === "staff" && (message.supportKind || message.reason)) throw new ServiceDenied("INVALID_MESSAGE");
    const kind = audience === "customer" ? "customer_message" : message.visibility === "staff" ? "private_note" : message.supportKind ?? "reply";
    const action: SupportAction = kind === "notice" ? { kind, reason: message.reason ?? "" } : { kind };
    if ((kind === "reply" || kind === "request_information" || kind === "notice") && !message.body?.trim()) throw new ServiceDenied("INVALID_MESSAGE");
    await this.applySupport(tx, row.supportCase, action, subject.userId);
   } else if (message.supportKind || message.reason) throw new ServiceDenied("INVALID_MESSAGE");
   const updated = await tx.serviceConversation.update({ where: { id }, data: { lastSequence: { increment: 1 } } });
   const saved = await tx.serviceMessage.create({ data: { id: this.runtime.id(), conversationId: id, sequence: updated.lastSequence, clientMessageId: message.clientMessageId, senderId: subject.userId, senderKind: audience, visibility: message.visibility, body: message.body?.trim() || null, attachmentId: message.attachmentId ?? null, requestHash: hash }, include: { attachment: true, sender: { select: { displayName: true, nameNumber: true } } } });
   await tx.serviceOutbox.create({ data: { id: this.runtime.id(), conversationId: id, eventType: "message", sequence: saved.sequence, visibility: message.visibility, lifecycleEpoch: scope.lifecycleEpoch } });
   return this.messageDto(saved, scope.purpose, audience === "staff");
  });
 }
 private supportState(row: Prisma.SupportCaseGetPayload<Record<string, never>>): SupportState {
  return { status: row.status === "closed" ? "closed" : "open", closedAt: row.closedAt, unansweredSince: row.unansweredSince, awaitingCustomerSince: row.awaitingCustomerSince, investigation: row.investigationState === "active", category: row.priority === "exposure" || row.priority === "account" ? row.priority : "ordinary", escalatedAt: row.escalatedAt };
 }
 private async applySupport(tx: Tx, row: Prisma.SupportCaseGetPayload<Record<string, never>>, action: SupportAction, actorId: string) {
  const next = transitionSupport(this.supportState(row), action, this.runtime.now());
  await tx.supportCase.update({ where: { id: row.id }, data: { status: next.status, closedAt: next.closedAt, unansweredSince: next.unansweredSince, awaitingCustomerSince: next.awaitingCustomerSince, investigationState: next.investigation ? "active" : "none", priority: next.category, escalatedAt: next.escalatedAt } });
  await tx.serviceAudit.create({ data: { actorId, purpose: "support", resourceId: row.id, action: `SUPPORT_${action.kind.toUpperCase()}`, reason: "reason" in action ? action.reason : null, assignmentVersion: row.assignmentVersion } });
 }
 async supportCommand(subject: ServiceSubject, id: string, command: ServiceMessagingSchemas.SupportCommand): Promise<void> {
  await this.locked(subject, id, "note", async (tx, row, scope) => {
   if (!row.supportCase) throw new ServiceDenied("NO_ACCESS");
   if (command.kind === "close_awaiting") {
    const hash = digest(JSON.stringify(command));
    const prior = await tx.serviceMessage.findUnique({ where: { conversationId_senderId_clientMessageId: { conversationId: id, senderId: subject.userId, clientMessageId: command.clientMessageId } } });
    if (prior) { if (prior.requestHash !== hash) throw new ServiceDenied("IDEMPOTENCY_CONFLICT"); return; }
    await this.applySupport(tx, row.supportCase, { kind: "close_awaiting", reason: command.reason }, subject.userId);
    const updated = await tx.serviceConversation.update({ where: { id }, data: { lastSequence: { increment: 1 } } });
    await tx.serviceMessage.create({ data: { conversationId: id, clientMessageId: command.clientMessageId, sequence: updated.lastSequence, senderId: subject.userId, senderKind: "staff", visibility: "customer", body: command.body, requestHash: hash } });
    await tx.serviceOutbox.create({ data: { conversationId: id, eventType: "message", sequence: updated.lastSequence, visibility: "customer", lifecycleEpoch: scope.lifecycleEpoch } });
   } else await this.applySupport(tx, row.supportCase, command, subject.userId);
  });
 }
 async assign(subject: ServiceSubject, id: string, expectedVersion: number, targetUserId?: string) {
  await this.locked(subject, id, "assign", async (tx, row, scope) => {
   if (scope.assignmentVersion !== expectedVersion) throw new ServiceDenied("STALE_ASSIGNMENT");
   const target = targetUserId ?? subject.userId;
   const targetRow = await tx.user.findUnique({ where: { id: target }, include: { staffGrants: { where: { capability: serviceCapability(scope.purpose), revokedAt: null } } } });
   if (!targetRow || targetRow.suspendedAt || targetRow.deletionScheduledAt || !targetRow.staffGrants.length) throw new ServiceDenied("NO_ACCESS");
   const data = { assigneeId: target, assignmentVersion: { increment: 1 } };
   if (row.supportCaseId) await tx.supportCase.update({ where: { id: row.supportCaseId }, data });
   else if (row.historyRequestId) await tx.vehicleHistoryRequest.update({ where: { id: row.historyRequestId }, data });
   await tx.serviceAudit.create({ data: { actorId: subject.userId, purpose: scope.purpose, resourceId: scope.resourceId, action: "SERVICE_HANDOVER", targetStaffId: target, assignmentVersion: expectedVersion + 1 } });
   const updated = await tx.serviceConversation.update({ where: { id }, data: { lastSequence: { increment: 1 } } });
   await tx.serviceOutbox.create({ data: { id: this.runtime.id(), conversationId: id, eventType: "handover", sequence: updated.lastSequence, visibility: "customer", lifecycleEpoch: scope.lifecycleEpoch } });
  }, targetUserId);
 }
 async markRead(subject: ServiceSubject, id: string, throughSequence: number) {
  await this.locked(subject, id, "read", async (tx, row) => {
   const through = Math.min(throughSequence, row.lastSequence);
   await tx.serviceReadState.upsert({ where: { conversationId_userId: { conversationId: id, userId: subject.userId } }, create: { conversationId: id, userId: subject.userId, lastSequence: through }, update: {} });
   await tx.serviceReadState.updateMany({ where: { conversationId: id, userId: subject.userId, lastSequence: { lt: through } }, data: { lastSequence: through } });
  });
 }
 async stage(subject: ServiceSubject, id: string, upload: ServiceMessagingSchemas.ServiceStageAttachment) {
  return this.locked(subject, id, upload.visibility === "staff" ? "note" : "send", async (tx, _row, scope, _actor, audience) => {
   if (audience === "customer" && upload.category !== (scope.purpose === "support" ? "support_communication" : "history_communication") && upload.category !== "payment_evidence") throw new ServiceDenied("INVALID_ATTACHMENT");
   if (audience === "customer" && (upload.rights.hold !== null || upload.rights.use.some(use => use !== "service"))) throw new ServiceDenied("INVALID_ATTACHMENT");
   assertServiceRights(scope.purpose, upload, this.runtime.now());
   const attachmentId = this.runtime.id();
   await tx.serviceAttachment.create({ data: { id: attachmentId, conversationId: id, uploaderId: subject.userId, lifecycleEpoch: scope.lifecycleEpoch, category: upload.category, visibility: upload.visibility, stagingKey: `service-staging/${attachmentId}`, contentType: upload.contentType, expectedBytes: upload.sizeBytes, filename: upload.filename, rights: upload.rights as unknown as Prisma.InputJsonValue, expiresAt: new Date(this.runtime.now().getTime() + 3600000) } });
   return { id: attachmentId };
  });
 }
 async upload(subject: ServiceSubject, id: string, attachmentId: string, bytes: Uint8Array) {
  // Commit the immutable locator before attempting an external write. Cleanup
  // can then find bytes even if storage commits but its response/DB commit is lost.
  const prepared = await this.locked(subject, id, "send", async (tx, _row, scope) => {
   const file = await tx.serviceAttachment.findUnique({ where: { id: attachmentId } });
   if (!file || file.conversationId !== id || file.uploaderId !== subject.userId || file.lifecycleEpoch !== scope.lifecycleEpoch || file.state !== "staged" || file.removedAt || file.expiresAt <= this.runtime.now() || bytes.length !== file.expectedBytes) throw new ServiceDenied("INVALID_ATTACHMENT");
   const cleaned = await cleanServiceBytes(bytes, file.contentType, scope.purpose);
   const sha256 = digest(cleaned);
   if (file.sha256 && file.sha256 !== sha256) throw new ServiceDenied("IDEMPOTENCY_CONFLICT");
   const key = file.objectKey ?? `service-private/${id}/${attachmentId}/${sha256}`;
   if (!file.objectKey) await tx.serviceAttachment.update({ where: { id: attachmentId }, data: { objectKey: key, sha256 } });
   return { cleaned, key, sha256, contentType: file.contentType, epoch: scope.lifecycleEpoch };
  });
  await this.locked(subject, id, "send", async (tx, _row, scope) => {
   const file = await tx.serviceAttachment.findUnique({ where: { id: attachmentId } });
   if (!file || file.conversationId !== id || file.uploaderId !== subject.userId || file.lifecycleEpoch !== scope.lifecycleEpoch || prepared.epoch !== scope.lifecycleEpoch || file.state !== "staged" || file.removedAt || file.expiresAt <= this.runtime.now() || file.objectKey !== prepared.key || file.sha256 !== prepared.sha256) throw new ServiceDenied("INVALID_ATTACHMENT");
   if (file.sizeBytes !== null) return;
   await this.store.putImmutable(prepared.key, prepared.cleaned, prepared.contentType);
   await tx.serviceAttachment.update({ where: { id: attachmentId }, data: { sizeBytes: prepared.cleaned.length } });
  });
 }
 async file(subject: ServiceSubject, id: string, attachmentId: string) {
  return this.locked(subject, id, "file", async (tx, _row, scope, actor) => {
   const file = await tx.serviceAttachment.findUnique({ where: { id: attachmentId } });
   if (!file || !file.objectKey) throw new ServiceDenied("NO_ACCESS");
   assertServiceAccess(scope, actor, "file", { conversationId: file.conversationId, lifecycleEpoch: file.lifecycleEpoch, adopted: file.state === "adopted", removed: !!file.removedAt, visibility: file.visibility === "staff" ? "staff" : "customer" });
   const bytes = await this.store.get(file.objectKey, file.sizeBytes ?? 0);
   if (digest(bytes) !== file.sha256) throw new ServiceDenied("INVALID_ATTACHMENT");
   return { bytes, filename: file.filename, contentType: file.contentType };
  });
 }
 async queue(subject: ServiceSubject, purpose: ServiceMessagingSchemas.ServicePurpose) {
  return this.db.$transaction(async tx => {
   const actor = await this.actor(tx, subject, purpose);
   if (!actor.sessionValid || actor.deleting || actor.suspended || !actor.staffAuthorized) throw new ServiceDenied("NO_ACCESS");
   let rows: ({ id: string; assigneeId: string | null; assignmentVersion: number; createdAt: Date; conversation: { id: string; erasedAt: Date | null } | null })[];
   if (purpose === "support") {
    const ordered = await tx.$queryRaw<{ id: string }[]>`SELECT s.id FROM support_cases s JOIN service_conversations c ON c."supportCaseId"=s.id WHERE s."customerId" IS NOT NULL AND c."erasedAt" IS NULL ORDER BY CASE s.priority WHEN 'exposure' THEN 0 WHEN 'account' THEN 1 ELSE 2 END, s."unansweredSince" ASC NULLS LAST, s."createdAt", s.id LIMIT 50`;
    const found = await tx.supportCase.findMany({ where: { id: { in: ordered.map(row => row.id) } }, include: { conversation: true } });
    rows = ordered.flatMap(item => { const row = found.find(row => row.id === item.id); return row ? [row] : []; });
   } else rows = await tx.vehicleHistoryRequest.findMany({ where: { customerId: { not: null } }, orderBy: { createdAt: "asc" }, take: 50, include: { conversation: true } });
   return rows.flatMap(row => row.conversation && !row.conversation.erasedAt ? [{ id: row.conversation.id, resourceId: row.id, assigned: row.assigneeId !== null, assignmentVersion: row.assignmentVersion, createdAt: row.createdAt.toISOString() }] : []);
  });
 }
 async mine(subject: ServiceSubject) {
  return this.db.$transaction(async tx => {
   const actor = await this.actor(tx, subject, "support");
   if (!actor.sessionValid || actor.deleting) throw new ServiceDenied("NO_ACCESS");
   const rows = await tx.serviceConversation.findMany({ where: { erasedAt: null, OR: [{ supportCase: { customerId: subject.userId } }, { historyRequest: { customerId: subject.userId } }] }, orderBy: { createdAt: "desc" }, take: 50 });
   return rows.map(row => ({ id: row.id, purpose: ServiceMessagingSchemas.ServicePurposeSchema.parse(row.purpose), createdAt: row.createdAt.toISOString() }));
  });
 }
}
