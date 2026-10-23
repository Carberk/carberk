import type { PrismaService } from "@auto-tm/db";

import type { PushPort } from "../push/domain/PushPort";
import { PUSH_RESULT_REASON } from "../push/domain/types";

import { canDeliverServicePush } from "./servicePushPolicy";

const copy = {
 en: { title: "Carberk", body: "You have an update in your service conversation." },
 ru: { title: "Carberk", body: "В вашем обращении есть обновление." },
 tk: { title: "Carberk", body: "Hyzmat söhbetiňizde täzelik bar." },
};
export interface ServicePushRuntime { enabled(): boolean; allowed(userId: string): boolean }
/** At-least-once generic invalidation. Event ID permits client deduplication.
 * Current authority stays locked through the bounded test-transport send.
 * Live transport remains unavailable until service activation is approved. */
export class DeliverServicePush {
 constructor(private readonly db: PrismaService, private readonly push: PushPort, private readonly runtime: ServicePushRuntime) {}
 async execute(now: Date): Promise<{ processed: number; delivered: number }> {
  if (!this.runtime.enabled()) return { processed: 0, delivered: 0 };
  const events = await this.db.serviceOutbox.findMany({ where: { deliveredAt: null, nextAttemptAt: { lte: now } }, orderBy: { createdAt: "asc" }, take: 50, select: { id: true, conversationId: true } });
  let processed = 0, delivered = 0;
  for (const candidate of events) await this.db.$transaction(async tx => {
   const initial = await tx.servicePushSubscription.findMany({ where: { conversationId: candidate.conversationId }, include: { session: true } });
   const users = [...new Set(initial.map(row => row.session.userId))].sort();
   for (const id of users) await tx.$queryRaw`SELECT id FROM users WHERE id=${id} FOR UPDATE`;
   for (const id of [...new Set(initial.map(row => row.sessionId))].sort()) await tx.$queryRaw`SELECT id FROM sessions WHERE id=${id} FOR UPDATE`;
   const first = await tx.serviceConversation.findUnique({ where: { id: candidate.conversationId } });
   if (!first) return;
   if (first.supportCaseId) await tx.$queryRaw`SELECT id FROM support_cases WHERE id=${first.supportCaseId} FOR UPDATE`;
   else await tx.$queryRaw`SELECT id FROM vehicle_history_requests WHERE id=${first.historyRequestId} FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM service_conversations WHERE id=${candidate.conversationId} FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM service_outbox WHERE id=${candidate.id} FOR UPDATE`;
   const event = await tx.serviceOutbox.findUnique({ where: { id: candidate.id } });
   if (!event || event.deliveredAt || event.nextAttemptAt > now) return;
   const conversation = await tx.serviceConversation.findUniqueOrThrow({ where: { id: event.conversationId }, include: { supportCase: true, historyRequest: true } });
   const owner = conversation.supportCase ?? conversation.historyRequest;
   if (!owner || owner.mode !== "synthetic" || !owner.customerId || !this.runtime.allowed(owner.customerId) || (conversation.purpose !== "support" && conversation.purpose !== "history")) return;
   const subscriptions = await tx.servicePushSubscription.findMany({ where: { id: { in: initial.map(row => row.id) }, conversationId: event.conversationId, createdAt: { lte: event.createdAt } }, include: { session: { include: { user: { include: { staffGrants: { where: { revokedAt: null } } } } } }, device: true } });
   const sender = await tx.serviceMessage.findUnique({ where: { conversationId_sequence: { conversationId: event.conversationId, sequence: event.sequence } }, select: { senderId: true } });
   let retry = false;
   for (const subscription of subscriptions) {
    const { session, device } = subscription, user = session.user;
    if (!this.runtime.allowed(user.id) || user.id === sender?.senderId || subscription.lifecycleEpoch !== event.lifecycleEpoch) continue;
    await tx.$queryRaw`SELECT id FROM fcm_devices WHERE id=${device.id} FOR UPDATE`;
    const currentDevice = await tx.fcmDevice.findUnique({ where: { id: device.id } });
    if (!currentDevice || !canDeliverServicePush({ id: conversation.id, purpose: conversation.purpose, customerId: owner.customerId, assigneeId: owner.assigneeId, epoch: conversation.lifecycleEpoch, erased: conversation.erasedAt !== null }, { userId: user.id, sessionUserId: session.userId, deviceUserId: currentDevice.userId, expiresAt: session.expiresAt, elevatedUntil: session.adminTotpExpiresAt, suspended: user.suspendedAt !== null, deleting: user.deletionScheduledAt !== null, deviceInvalidated: currentDevice.invalidatedAt !== null, capabilities: user.staffGrants.map(grant => grant.capability) }, { epoch: event.lifecycleEpoch, visibility: event.visibility }, now)) continue;
    const localized = copy[user.locale === "ru" || user.locale === "tk" ? user.locale : "en"];
    const result = await this.push.send({ deviceToken: currentDevice.token, platform: currentDevice.platform, ...localized, deepLink: `/services?conversationId=${conversation.id}`, data: { kind: "service_update", conversationId: conversation.id, eventId: event.id } });
    if (result.ok) delivered++;
    else if (result.reason === PUSH_RESULT_REASON.InvalidToken) await tx.fcmDevice.update({ where: { id: device.id }, data: { invalidatedAt: now } });
    else if (result.reason === PUSH_RESULT_REASON.Retryable) retry = true;
   }
   await tx.serviceOutbox.update({ where: { id: event.id }, data: { deliveredAt: retry ? null : now, attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + Math.min(3600000, 1000 * 2 ** Math.min(event.attempts, 12))) } });
   processed++;
  }, { timeout: 20000 });
  return { processed, delivered };
 }
}
