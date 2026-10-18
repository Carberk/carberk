import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import type { DirectMessagePushInput } from "../domain/DirectMessagePushInput";
import type { DirectMessageDeliveryEligibility } from "../domain/DirectMessageDeliveryEligibility";

@Injectable()
export class PrismaDirectMessageDeliveryEligibility implements DirectMessageDeliveryEligibility {
 constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
 async mayDeliver(input: DirectMessagePushInput): Promise<boolean> {
  const id = input.data["conversationId"];
  if (typeof id !== "string") return false;
  const conversation = await this.prisma.conversation.findUnique({ where: { id }, include: { business: true } });
  if (!conversation) return false;
  // Personal notification policy remains owned by its existing API decision.
  if (!conversation.businessId) return true;
  if (conversation.business?.status !== "active") return false;
  const user = await this.prisma.user.findUnique({ where: { id: input.recipientUserId }, include: { dealershipMemberships: true } });
  if (!user || user.suspendedAt || user.deletionScheduledAt) return false;
  if (user.id === conversation.buyerId) return true;
  const member = user.dealershipMemberships.find(item => item.dealershipId === conversation.businessId);
  return !!member && member.dealershipId === conversation.businessId && member.status === "active" && (!conversation.assigneeId || conversation.assigneeId === user.id);
 }
}
