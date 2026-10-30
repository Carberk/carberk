import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma, withDiagnosticSourceCommand, assertDiagnosticSourceCommand, businessSourceCommand, withCampaignPreparation, type CampaignMutation } from "@auto-tm/db";
import type { BusinessSchemas } from "@auto-tm/contracts";
import { BusinessAuthorityDenied, type BusinessSubject } from "../domain/ports/BusinessAuthorityPort";
import type { BusinessRepository, NewBusinessInvitation } from "../domain/ports/BusinessRepository";
import { StaffAuthorityDenied } from "../domain/ports/StaffAuthorityPort";
import { assertCurrentStaffSession, assertStaffElevation } from "../domain/staffPolicy";

type Tx = Prisma.TransactionClient;

const sameSnapshot = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const campaignInsert = (table: string, id: string, next: Record<string, Prisma.InputJsonValue | null>): CampaignMutation => ({ table, key: { id }, verb: "insert", next });
const campaignUpdate = (table: string, id: string, next: Record<string, Prisma.InputJsonValue | null>): CampaignMutation => ({ table, key: { id }, verb: "update", next });
@Injectable()
export class PrismaBusinessRepository implements BusinessRepository {
 constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
 private async locks(tx: Tx, subject: BusinessSubject, otherUserId?: string, businessId?: string) {
  // All membership writes and account deletion lock User before Business.
  await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" IN (${subject.userId}, ${otherUserId ?? subject.userId}) ORDER BY "id" FOR UPDATE`;
  if (businessId) await tx.$queryRaw`SELECT "id" FROM "dealerships" WHERE "id" = ${businessId} FOR UPDATE`;
 }
 private async invalidateInventory(tx:Tx, expected?: { epoch: string } | null){
  const collector=await tx.$queryRaw<{epoch:string}[]>`SELECT "epoch" FROM "measurement_state" WHERE "key"='collector' FOR UPDATE`;
  if (expected !== undefined && (collector[0]?.epoch ?? null) !== (expected?.epoch ?? null)) throw new Error("diagnostic_source_graph_changed");
  if(collector[0])await tx.measurementState.deleteMany({where:{key:`inventory_baseline:${collector[0].epoch}`}});
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
 private audit(tx: Tx, actorId: string, businessId: string, action: string, details: Prisma.InputJsonObject, id?: string) {
  return tx.auditLog.create({ data: { ...(id ? { id } : {}), actorId, targetType: "Dealership", targetId: businessId, action, details } });
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
   const businessId = randomUUID(), invitationId = randomUUID(), auditId = randomUUID();
   await this.founder(tx, input, "founder.admission", now); await this.recipient(tx, input.ownerUserId);
   return withCampaignPreparation(tx, [
    campaignInsert("dealerships", businessId, { id: businessId, slug: input.slug }),
    campaignInsert("dealership_invitations", invitationId, { id: invitationId, dealershipId: businessId, recipientUserId: input.ownerUserId }),
    campaignInsert("audit_logs", auditId, { id: auditId, actorId: input.userId, targetType: "Dealership", targetId: businessId }),
   ], async () => {
    await this.locks(tx, input, input.ownerUserId); await this.founder(tx, input, "founder.admission", now); await this.recipient(tx, input.ownerUserId);
    const business = await tx.dealership.create({ data: { id: businessId, name: input.name, slug: input.slug, status: "recovery", admissionMode: input.mode, admittedAt: input.mode === "checked" ? now : null, checkedEvidence: input.evidence } });
    const invitation = await tx.dealershipInvitation.create({ data: { id: invitationId, dealershipId: business.id, recipientUserId: input.ownerUserId, role: "owner", tokenHash: input.tokenHash, expiresAt: input.expiresAt } });
    await this.audit(tx, input.userId, business.id, "BUSINESS_ADMITTED", { mode: input.mode, evidence: input.evidence, reason: input.reason, verifiedScope: input.mode === "checked" ? "Business identity only; no vehicle condition claim" : "Synthetic fixture; no real business verified" }, auditId);
    return { businessId: business.id, invitationId: invitation.id };
   });
  });
 }
 async invite(input: BusinessSubject & { businessId: string; recipientUserId: string } & NewBusinessInvitation, now: Date) {
  return this.prisma.$transaction(async (tx) => {
   const pending = await tx.dealershipInvitation.findMany({ where: { dealershipId: input.businessId, recipientUserId: input.recipientUserId, redeemedAt: null, revokedAt: null }, orderBy: { id: "asc" }, select: { id: true, dealershipId: true, recipientUserId: true, role: true, tokenHash: true, expiresAt: true, revokedAt: true, redeemedAt: true } });
   const invitationId = randomUUID(), auditId = randomUUID();
   await this.owner(tx, input, now); await this.recipient(tx, input.recipientUserId);
   return withCampaignPreparation(tx, [
    ...pending.map((row) => campaignUpdate("dealership_invitations", row.id, { id: row.id, dealershipId: row.dealershipId, recipientUserId: row.recipientUserId, tokenHash: row.tokenHash, expiresAt: row.expiresAt.toISOString(), revokedAt: now.toISOString(), redeemedAt: null })),
    campaignInsert("dealership_invitations", invitationId, { id: invitationId, dealershipId: input.businessId, recipientUserId: input.recipientUserId }),
    campaignInsert("audit_logs", auditId, { id: auditId, actorId: input.userId, targetType: "Dealership", targetId: input.businessId }),
   ], async () => {
    await this.locks(tx, input, input.recipientUserId, input.businessId); await this.owner(tx, input, now); await this.recipient(tx, input.recipientUserId);
    const current = await tx.dealershipInvitation.findMany({ where: { dealershipId: input.businessId, recipientUserId: input.recipientUserId, redeemedAt: null, revokedAt: null }, orderBy: { id: "asc" }, select: { id: true, dealershipId: true, recipientUserId: true, role: true, tokenHash: true, expiresAt: true, revokedAt: true, redeemedAt: true } });
    if (!sameSnapshot(current, pending)) throw new Error("diagnostic_source_graph_changed");
    await tx.dealershipInvitation.updateMany({ where: { dealershipId: input.businessId, recipientUserId: input.recipientUserId, redeemedAt: null, revokedAt: null }, data: { revokedAt: now } });
    const invite = await tx.dealershipInvitation.create({ data: { id: invitationId, dealershipId: input.businessId, recipientUserId: input.recipientUserId, role: "sales", tokenHash: input.tokenHash, expiresAt: input.expiresAt } });
    await this.audit(tx, input.userId, input.businessId, "BUSINESS_INVITATION_CREATED", { invitationId: invite.id, role: "sales" }, auditId);
    return { businessId: input.businessId, invitationId: invite.id };
   });
  });
 }
 async redeem(input: BusinessSubject & { tokenHash: string }, now: Date) {
  return this.prisma.$transaction(async (tx) => {
   const initial = await tx.dealershipInvitation.findUnique({ where: { tokenHash: input.tokenHash } });
   if (!initial) throw new BusinessAuthorityDenied("INVITATION_INVALID");
   await this.person(tx, input, now);
   if (initial.recipientUserId !== input.userId || initial.expiresAt <= now || initial.revokedAt || initial.redeemedAt) throw new BusinessAuthorityDenied("INVITATION_INVALID");
   await this.recipient(tx, input.userId, initial.role === "owner" ? initial.dealershipId : undefined);
   const existing = await tx.dealershipMember.findUnique({ where: { userId: input.userId } });
   const memberId = randomUUID(), auditId = randomUUID();
   const operation = existing?.dealershipId === initial.dealershipId && existing.role === "sales" && initial.role === "owner" ? "member_replace" : "member_create";
   const command = await businessSourceCommand(tx, { operation, businessId: initial.dealershipId, actorUserId: input.userId, sessionId: input.sessionId,
    roots: [{ table: "dealership_invitations", key: { id: initial.id } }, { table: "audit_logs", key: { id: auditId } }],
    ...(operation === "member_replace" && existing ? { removedMemberId: existing.id } : {}),
    member: { id: memberId, userId: input.userId, role: initial.role },
   });
   return withDiagnosticSourceCommand(tx, command, async (receipt) => {
    await assertDiagnosticSourceCommand(tx, receipt, operation);
    await this.locks(tx, input, undefined, initial.dealershipId); await this.person(tx, input, now);
    const invite = await tx.dealershipInvitation.findUnique({ where: { tokenHash: input.tokenHash }, include: { dealership: true } });
    if (!invite || invite.id !== initial.id || invite.recipientUserId !== input.userId || invite.expiresAt <= now || invite.revokedAt || invite.redeemedAt) throw new BusinessAuthorityDenied("INVITATION_INVALID");
    if (!sameSnapshot({ ...invite, dealership: undefined }, { ...initial, dealership: undefined })) throw new Error("diagnostic_source_graph_changed");
    if (invite.dealership.status === "suspended" || (invite.role === "sales" && invite.dealership.status !== "active") || (invite.role === "owner" && invite.dealership.status !== "recovery")) throw new BusinessAuthorityDenied("INVITATION_INVALID");
    await this.recipient(tx, input.userId, invite.role === "owner" ? invite.dealershipId : undefined);
    if (invite.role === "owner") await tx.dealershipMember.deleteMany({ where: { userId: input.userId, dealershipId: invite.dealershipId, role: "sales" } });
    const consumed = await tx.dealershipInvitation.updateMany({ where: { id: invite.id, redeemedAt: null, revokedAt: null }, data: { redeemedAt: now } });
    if (consumed.count !== 1) throw new BusinessAuthorityDenied("INVITATION_INVALID");
    await tx.dealershipMember.create({ data: { id: memberId, userId: input.userId, dealershipId: invite.dealershipId, role: invite.role, status: "active" } });
    if (invite.role === "owner") { await tx.dealership.update({ where: { id: invite.dealershipId }, data: { status: "active" } }); await this.invalidateInventory(tx); }
    await this.audit(tx, input.userId, invite.dealershipId, "BUSINESS_INVITATION_REDEEMED", { invitationId: invite.id, role: invite.role }, auditId);
    return { businessId: invite.dealershipId };
   });
  });
 }
 async revoke(input: BusinessSubject & { businessId: string; invitationId: string }, now: Date) {
  await this.prisma.$transaction(async (tx) => {
   const invitation = await tx.dealershipInvitation.findUnique({ where: { id: input.invitationId } });
   const active = invitation && invitation.dealershipId === input.businessId && !invitation.revokedAt && !invitation.redeemedAt;
   if (!active) {
    // A no-op still authorizes under the same Business/User prefix. It performs
    // no DML; the unchanged Business candidate supplies its campaign namespace.
    return withCampaignPreparation(tx, [campaignUpdate("dealerships", input.businessId, {})], async () => {
     await this.locks(tx, input, undefined, input.businessId); await this.owner(tx, input, now);
     const current = await tx.dealershipInvitation.findUnique({ where: { id: input.invitationId } });
     if (!sameSnapshot(current, invitation)) throw new Error("diagnostic_source_graph_changed");
    });
   }
   const auditId = randomUUID();
   return withCampaignPreparation(tx, [campaignUpdate("dealership_invitations", input.invitationId, { id: input.invitationId, dealershipId: input.businessId, recipientUserId: invitation.recipientUserId, tokenHash: invitation.tokenHash, expiresAt: invitation.expiresAt.toISOString(), revokedAt: now.toISOString(), redeemedAt: null }), campaignInsert("audit_logs", auditId, { id: auditId, actorId: input.userId, targetType: "Dealership", targetId: input.businessId })], async () => {
    await this.locks(tx, input, undefined, input.businessId); await this.owner(tx, input, now);
    const current = await tx.dealershipInvitation.findUnique({ where: { id: input.invitationId } });
    if (!sameSnapshot(current, invitation)) throw new Error("diagnostic_source_graph_changed");
    await tx.dealershipInvitation.update({ where: { id: input.invitationId }, data: { revokedAt: now } });
    await this.audit(tx, input.userId, input.businessId, "BUSINESS_INVITATION_REVOKED", { invitationId: input.invitationId }, auditId);
   });
  });
 }
 async changeMember(input: BusinessSubject & BusinessSchemas.BusinessMembershipChangeInput & { businessId: string }, now: Date) {
  await this.prisma.$transaction(async (tx) => {
   await this.owner(tx, input, now);
   const target = await tx.dealershipMember.findUnique({ where: { userId: input.targetUserId } });
   if (!target || target.dealershipId !== input.businessId) throw new BusinessAuthorityDenied("MEMBERSHIP_REQUIRED");
   if (target.role === "owner") throw new BusinessAuthorityDenied("SOLE_OWNER");
   const auditId = randomUUID();
   const operation = input.action === "remove" ? "member_remove" : "member_eligibility";
   const command = await businessSourceCommand(tx, { operation, businessId: input.businessId, actorUserId: input.userId, sessionId: input.sessionId,
    roots: [{ table: "users", key: { id: input.targetUserId } }, { table: "audit_logs", key: { id: auditId } }], memberId: target.id, status: input.action === "suspend" ? "suspended" : "active" });
   await withDiagnosticSourceCommand(tx, command, async (receipt) => {
    await assertDiagnosticSourceCommand(tx, receipt, operation);
    await this.locks(tx, input, input.targetUserId, input.businessId); await this.owner(tx, input, now);
    const current = await tx.dealershipMember.findUnique({ where: { userId: input.targetUserId } });
    if (!current || current.id !== target.id || current.dealershipId !== input.businessId || current.role !== target.role || current.status !== target.status) throw new Error("diagnostic_source_graph_changed");
    if (input.action === "remove") await tx.dealershipMember.delete({ where: { id: current.id } });
    else await tx.dealershipMember.update({ where: { id: current.id }, data: { status: input.action === "suspend" ? "suspended" : "active" } });
    await this.audit(tx, input.userId, input.businessId, "BUSINESS_MEMBERSHIP_CHANGED", { targetUserId: target.userId, action: input.action }, auditId);
   });
  });
 }
 async settings(input: BusinessSubject & BusinessSchemas.BusinessSettingsInput & { businessId: string }, now: Date) {
  await this.prisma.$transaction(async (tx) => {
   const auditId = randomUUID();
   await withCampaignPreparation(tx, [
    campaignUpdate("dealerships", input.businessId, { name: input.name, ...(input.cityId !== undefined ? { cityId: input.cityId } : {}) }),
    campaignInsert("audit_logs", auditId, { actorId: input.userId, targetType: "Dealership", targetId: input.businessId }),
   ], async () => {
    await this.locks(tx, input, undefined, input.businessId); await this.owner(tx, input, now);
    await tx.dealership.update({ where: { id: input.businessId }, data: { name: input.name, ...(input.cityId !== undefined ? { cityId: input.cityId } : {}) } });
    await this.audit(tx, input.userId, input.businessId, "BUSINESS_SETTINGS_CHANGED", { fields: input.cityId !== undefined ? ["name", "cityId"] : ["name"] }, auditId);
   });
  });
 }
 async recover(input: BusinessSubject & BusinessSchemas.RecoverBusinessInput & { businessId: string } & NewBusinessInvitation, now: Date) {
  return this.prisma.$transaction(async (tx) => {
   // Discover the outgoing owner before source preparation, including their
   // User and retained graph. Re-read policy under the prepared locks below.
   const initial = await tx.dealership.findUnique({ where: { id: input.businessId }, include: { members: { where: { role: "owner" }, include: { user: true } } } });
   if (!initial) throw new BusinessAuthorityDenied("RECOVERY_REQUIRED");
   const outgoing = initial.members[0];
   await this.founder(tx, input, "founder.recovery", now);
   if (outgoing && outgoing.status === "active" && !outgoing.user.suspendedAt && !outgoing.user.deletionScheduledAt) throw new BusinessAuthorityDenied("RECOVERY_REQUIRED");
   if (initial.status === "suspended") throw new BusinessAuthorityDenied("BUSINESS_INACTIVE");
   const pending = await tx.dealershipInvitation.findMany({ where: { dealershipId: input.businessId, role: "owner", redeemedAt: null, revokedAt: null }, orderBy: { id: "asc" } });
   const invitationId = randomUUID(), auditId = randomUUID();
   const collector = await tx.measurementState.findUnique({ where: { key: "collector" } });
   const roots = [{ table: "measurement_state" as const, key: { key: "collector" } },
    ...(collector ? [{ table: "measurement_state" as const, key: { key: `inventory_baseline:${collector.epoch}` } }] : []),
    { table: "dealership_invitations" as const, key: { id: invitationId } },
    { table: "audit_logs" as const, key: { id: auditId } },
    { table: "users" as const, key: { id: input.ownerUserId } },
    ...pending.map(i => ({ table: "dealership_invitations" as const, key: { id: i.id } })),
    ...(outgoing ? [{ table: "users" as const, key: { id: outgoing.userId } }] : []),
   ];
   const command = await businessSourceCommand(tx, outgoing
    ? { operation: "member_replace", businessId: input.businessId, actorUserId: input.userId, sessionId: input.sessionId, roots, removedMemberId: outgoing.id }
    : { operation: "business_eligibility", businessId: input.businessId, actorUserId: input.userId, sessionId: input.sessionId, roots, status: "recovery" });
   return withDiagnosticSourceCommand(tx, command, async receipt => {
    await assertDiagnosticSourceCommand(tx, receipt, command.operation);
    await this.locks(tx, input, input.ownerUserId, input.businessId); await this.founder(tx, input, "founder.recovery", now);
    const business = await tx.dealership.findUnique({ where: { id: input.businessId }, include: { members: { where: { role: "owner" }, include: { user: true } } } });
    if (!business) throw new BusinessAuthorityDenied("RECOVERY_REQUIRED");
    const owner = business.members[0];
    if (owner?.id !== outgoing?.id || owner?.status !== outgoing?.status || owner?.userId !== outgoing?.userId || business.status !== initial.status) throw new Error("diagnostic_source_graph_changed");
    if (owner && owner.status === "active" && !owner.user.suspendedAt && !owner.user.deletionScheduledAt) throw new BusinessAuthorityDenied("RECOVERY_REQUIRED");
    if (business.status === "suspended") throw new BusinessAuthorityDenied("BUSINESS_INACTIVE");
    const current = await tx.dealershipInvitation.findMany({ where: { dealershipId: input.businessId, role: "owner", redeemedAt: null, revokedAt: null }, orderBy: { id: "asc" } });
    if (!sameSnapshot(current, pending)) throw new Error("diagnostic_source_graph_changed");
    if (owner) await tx.dealershipMember.delete({ where: { id: owner.id } });
    await this.recipient(tx, input.ownerUserId, input.businessId);
    if (!outgoing || business.status !== "recovery") await tx.dealership.update({ where: { id: input.businessId }, data: { status: "recovery" } });
    await this.invalidateInventory(tx, collector);
    await tx.dealershipInvitation.updateMany({ where: { dealershipId: input.businessId, role: "owner", redeemedAt: null, revokedAt: null }, data: { revokedAt: now } });
    const invite = await tx.dealershipInvitation.create({ data: { id: invitationId, dealershipId: input.businessId, recipientUserId: input.ownerUserId, role: "owner", tokenHash: input.tokenHash, expiresAt: input.expiresAt } });
    await this.audit(tx, input.userId, input.businessId, "BUSINESS_OWNER_RECOVERY", { evidence: input.evidence, reason: input.reason, invitationId: invite.id }, auditId);
    return { businessId: input.businessId, invitationId: invite.id };
   });
  });
 }
}
