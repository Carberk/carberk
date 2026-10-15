import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import type { BusinessSchemas } from "@auto-tm/contracts";
import { BusinessAuthorityDenied, type BusinessSubject } from "../domain/ports/BusinessAuthorityPort";
import type { BusinessRepository, NewBusinessInvitation } from "../domain/ports/BusinessRepository";
import { StaffAuthorityDenied } from "../domain/ports/StaffAuthorityPort";
import { assertCurrentStaffSession, assertStaffElevation } from "../domain/staffPolicy";

type Tx = Prisma.TransactionClient;
@Injectable()
export class PrismaBusinessRepository implements BusinessRepository {
 constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
 private async locks(tx: Tx, subject: BusinessSubject, otherUserId?: string, businessId?: string) {
  // All membership writes and account deletion lock User before Business.
  await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" IN (${subject.userId}, ${otherUserId ?? subject.userId}) ORDER BY "id" FOR UPDATE`;
  if (businessId) await tx.$queryRaw`SELECT "id" FROM "dealerships" WHERE "id" = ${businessId} FOR UPDATE`;
 }
 private async person(tx: Tx, subject: BusinessSubject, now: Date) {
  const session = await tx.session.findUnique({ where: { id: subject.sessionId }, include: { user: true } });
  if (!session || session.userId !== subject.userId || session.expiresAt <= now) throw new BusinessAuthorityDenied("SESSION_REQUIRED");
  if (session.user.suspendedAt || session.user.deletionScheduledAt) throw new BusinessAuthorityDenied("USER_INACTIVE");
  return session;
 }
 private async founder(tx: Tx, input: BusinessSubject, capability: string, now: Date) {
  const session = await this.person(tx, input, now);
  const grants = await tx.staffGrant.findMany({ where: { userId: input.userId, revokedAt: null } });
  const actor = { userId: input.userId, sessionUserId: session.userId, role: session.user.role, suspended: false, deleting: false, expiresAt: session.expiresAt, elevatedUntil: session.adminTotpExpiresAt, capabilities: grants.map((g) => g.capability) };
  assertCurrentStaffSession(actor, input, now); assertStaffElevation(actor, now);
  if (!actor.capabilities.includes(capability)) throw new StaffAuthorityDenied("CAPABILITY_REQUIRED");
 }
 private async owner(tx: Tx, input: BusinessSubject & { businessId: string }, now: Date) {
  await this.person(tx, input, now);
  const member = await tx.dealershipMember.findUnique({ where: { userId: input.userId }, include: { dealership: true } });
  if (!member || member.dealershipId !== input.businessId || member.status !== "active") throw new BusinessAuthorityDenied("MEMBERSHIP_REQUIRED");
  if (member.role !== "owner") throw new BusinessAuthorityDenied("OWNER_REQUIRED");
  if (member.dealership.status !== "active") throw new BusinessAuthorityDenied("BUSINESS_INACTIVE");
  return member;
 }
 private async recipient(tx: Tx, userId: string, replacementBusinessId?: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, include: { dealershipMemberships: true } });
  const existing = user?.dealershipMemberships[0];
  if (!user || user.suspendedAt || user.deletionScheduledAt || (existing && !(replacementBusinessId && existing.dealershipId === replacementBusinessId && existing.role === "sales" && existing.status === "active"))) throw new BusinessAuthorityDenied("MEMBERSHIP_CONFLICT");
 }
 private audit(tx: Tx, actorId: string, businessId: string, action: string, details: Prisma.InputJsonObject) {
  return tx.auditLog.create({ data: { actorId, targetType: "Dealership", targetId: businessId, action, details } });
 }
 async workspace(subject: BusinessSubject, now: Date): Promise<BusinessSchemas.BusinessWorkspace | null> {
  return this.prisma.$transaction(async (tx) => {
   await this.person(tx, subject, now);
   const member = await tx.dealershipMember.findUnique({ where: { userId: subject.userId }, include: { dealership: { include: { members: true, invitations: { orderBy: { createdAt: "desc" }, take: 100 } } } } });
   if (!member) return null;
   if (member.status !== "active") throw new BusinessAuthorityDenied("MEMBERSHIP_REQUIRED");
   const business = member.dealership;
   return { business: { id: business.id, name: business.name, slug: business.slug, cityId: business.cityId, status: business.status as "active" | "suspended" | "recovery", admissionMode: business.admissionMode as "synthetic" | "checked" },
    membership: { id: member.id, role: member.role, status: "active" },
    members: member.role === "owner" ? business.members.map((m) => ({ userId: m.userId, role: m.role, status: m.status as "active" | "suspended" })) : [],
    invitations: member.role === "owner" ? business.invitations.map((i) => ({ id: i.id, recipientUserId: i.recipientUserId, role: i.role, expiresAt: i.expiresAt.toISOString(), revokedAt: i.revokedAt?.toISOString() ?? null, redeemedAt: i.redeemedAt?.toISOString() ?? null })) : [] };
  });
 }
 async admit(input: BusinessSubject & BusinessSchemas.AdmitBusinessInput & NewBusinessInvitation, now: Date) {
  return this.prisma.$transaction(async (tx) => {
   await this.locks(tx, input, input.ownerUserId); await this.founder(tx, input, "founder.admission", now); await this.recipient(tx, input.ownerUserId);
   const business = await tx.dealership.create({ data: { name: input.name, slug: input.slug, status: "recovery", admissionMode: input.mode, admittedAt: input.mode === "checked" ? now : null, checkedEvidence: input.evidence } });
   const invitation = await tx.dealershipInvitation.create({ data: { dealershipId: business.id, recipientUserId: input.ownerUserId, role: "owner", tokenHash: input.tokenHash, expiresAt: input.expiresAt } });
   await this.audit(tx, input.userId, business.id, "BUSINESS_ADMITTED", { mode: input.mode, evidence: input.evidence, reason: input.reason, verifiedScope: input.mode === "checked" ? "Business identity only; no vehicle condition claim" : "Synthetic fixture; no real business verified" });
   return { businessId: business.id, invitationId: invitation.id };
  });
 }
 async invite(input: BusinessSubject & { businessId: string; recipientUserId: string } & NewBusinessInvitation, now: Date) {
  return this.prisma.$transaction(async (tx) => {
   await this.locks(tx, input, input.recipientUserId, input.businessId); await this.owner(tx, input, now); await this.recipient(tx, input.recipientUserId);
   await tx.dealershipInvitation.updateMany({ where: { dealershipId: input.businessId, recipientUserId: input.recipientUserId, redeemedAt: null, revokedAt: null }, data: { revokedAt: now } });
   const invite = await tx.dealershipInvitation.create({ data: { dealershipId: input.businessId, recipientUserId: input.recipientUserId, role: "sales", tokenHash: input.tokenHash, expiresAt: input.expiresAt } });
   await this.audit(tx, input.userId, input.businessId, "BUSINESS_INVITATION_CREATED", { invitationId: invite.id, role: "sales" });
   return { businessId: input.businessId, invitationId: invite.id };
  });
 }
 async redeem(input: BusinessSubject & { tokenHash: string }, now: Date) {
  return this.prisma.$transaction(async (tx) => {
   const initial = await tx.dealershipInvitation.findUnique({ where: { tokenHash: input.tokenHash } });
   if (!initial) throw new BusinessAuthorityDenied("INVITATION_INVALID");
   await this.locks(tx, input, undefined, initial.dealershipId); await this.person(tx, input, now);
   const invite = await tx.dealershipInvitation.findUnique({ where: { tokenHash: input.tokenHash }, include: { dealership: true } });
   if (!invite || invite.recipientUserId !== input.userId || invite.expiresAt <= now || invite.revokedAt || invite.redeemedAt) throw new BusinessAuthorityDenied("INVITATION_INVALID");
   if (invite.dealership.status === "suspended" || (invite.role === "sales" && invite.dealership.status !== "active") || (invite.role === "owner" && invite.dealership.status !== "recovery")) throw new BusinessAuthorityDenied("INVITATION_INVALID");
   await this.recipient(tx, input.userId, invite.role === "owner" ? invite.dealershipId : undefined);
   if (invite.role === "owner") await tx.dealershipMember.deleteMany({ where: { userId: input.userId, dealershipId: invite.dealershipId, role: "sales" } });
   const consumed = await tx.dealershipInvitation.updateMany({ where: { id: invite.id, redeemedAt: null, revokedAt: null }, data: { redeemedAt: now } });
   if (consumed.count !== 1) throw new BusinessAuthorityDenied("INVITATION_INVALID");
   await tx.dealershipMember.create({ data: { userId: input.userId, dealershipId: invite.dealershipId, role: invite.role, status: "active" } });
   if (invite.role === "owner") await tx.dealership.update({ where: { id: invite.dealershipId }, data: { status: "active" } });
   await this.audit(tx, input.userId, invite.dealershipId, "BUSINESS_INVITATION_REDEEMED", { invitationId: invite.id, role: invite.role });
   return { businessId: invite.dealershipId };
  });
 }
 async revoke(input: BusinessSubject & { businessId: string; invitationId: string }, now: Date) {
  await this.prisma.$transaction(async (tx) => {
   await this.locks(tx, input, undefined, input.businessId); await this.owner(tx, input, now);
   const result = await tx.dealershipInvitation.updateMany({ where: { id: input.invitationId, dealershipId: input.businessId, revokedAt: null, redeemedAt: null }, data: { revokedAt: now } });
   if (result.count) await this.audit(tx, input.userId, input.businessId, "BUSINESS_INVITATION_REVOKED", { invitationId: input.invitationId });
  });
 }
 async changeMember(input: BusinessSubject & BusinessSchemas.BusinessMembershipChangeInput & { businessId: string }, now: Date) {
  await this.prisma.$transaction(async (tx) => {
   await this.locks(tx, input, input.targetUserId, input.businessId); await this.owner(tx, input, now);
   const target = await tx.dealershipMember.findUnique({ where: { userId: input.targetUserId } });
   if (!target || target.dealershipId !== input.businessId) throw new BusinessAuthorityDenied("MEMBERSHIP_REQUIRED");
   if (target.role === "owner") throw new BusinessAuthorityDenied("SOLE_OWNER");
   if (input.action === "remove") await tx.dealershipMember.delete({ where: { id: target.id } });
   else await tx.dealershipMember.update({ where: { id: target.id }, data: { status: input.action === "suspend" ? "suspended" : "active" } });
   await this.audit(tx, input.userId, input.businessId, "BUSINESS_MEMBERSHIP_CHANGED", { targetUserId: target.userId, action: input.action });
  });
 }
 async settings(input: BusinessSubject & BusinessSchemas.BusinessSettingsInput & { businessId: string }, now: Date) {
  await this.prisma.$transaction(async (tx) => {
   await this.locks(tx, input, undefined, input.businessId); await this.owner(tx, input, now);
   await tx.dealership.update({ where: { id: input.businessId }, data: { name: input.name, ...(input.cityId !== undefined ? { cityId: input.cityId } : {}) } });
   await this.audit(tx, input.userId, input.businessId, "BUSINESS_SETTINGS_CHANGED", { fields: input.cityId !== undefined ? ["name", "cityId"] : ["name"] });
  });
 }
 async recover(input: BusinessSubject & BusinessSchemas.RecoverBusinessInput & { businessId: string } & NewBusinessInvitation, now: Date) {
  return this.prisma.$transaction(async (tx) => {
   await this.locks(tx, input, input.ownerUserId, input.businessId); await this.founder(tx, input, "founder.recovery", now);
   const business = await tx.dealership.findUnique({ where: { id: input.businessId }, include: { members: { where: { role: "owner" }, include: { user: true } } } });
   if (!business) throw new BusinessAuthorityDenied("RECOVERY_REQUIRED");
   const owner = business.members[0];
   if (owner && owner.status === "active" && !owner.user.suspendedAt && !owner.user.deletionScheduledAt) throw new BusinessAuthorityDenied("RECOVERY_REQUIRED");
   // A suspension by moderation must remain suspended until explicitly restored;
   // recovery cannot use a replacement owner to bypass business suspension.
   if (business.status === "suspended") throw new BusinessAuthorityDenied("BUSINESS_INACTIVE");
   if (owner) await tx.dealershipMember.delete({ where: { id: owner.id } });
   await this.recipient(tx, input.ownerUserId, input.businessId);
   await tx.dealership.update({ where: { id: input.businessId }, data: { status: "recovery" } });
   await tx.dealershipInvitation.updateMany({ where: { dealershipId: input.businessId, role: "owner", redeemedAt: null, revokedAt: null }, data: { revokedAt: now } });
   const invite = await tx.dealershipInvitation.create({ data: { dealershipId: input.businessId, recipientUserId: input.ownerUserId, role: "owner", tokenHash: input.tokenHash, expiresAt: input.expiresAt } });
   await this.audit(tx, input.userId, input.businessId, "BUSINESS_OWNER_RECOVERY", { evidence: input.evidence, reason: input.reason, invitationId: invite.id });
   return { businessId: input.businessId, invitationId: invite.id };
  });
 }
}
