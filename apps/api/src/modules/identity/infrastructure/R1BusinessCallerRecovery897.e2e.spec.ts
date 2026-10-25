import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "@auto-tm/db";
import { cleanSuiteFixtures, defineE2eSuite } from "../../../../test/helpers/e2eSuite";
import { PrismaBusinessRepository } from "./PrismaBusinessRepository";
import { PrismaAccountDeletionUnitOfWork } from "./PrismaAccountDeletionUnitOfWork";
import { PrismaAccountRestoreUnitOfWork } from "./PrismaAccountRestoreUnitOfWork";

// Authored recovery evidence only. Do not collect/execute without the parent's
// PostgreSQL/profile authorization. No source-command wrapper surrounds callers.
const suite = defineE2eSuite("r1-business-caller-recovery-897-20261025");
const aliases = ["founder", "owner", "sales", "recipient", "foreign"];
const uid = (name: string) => suite.id(name);
const subject = (name: string) => ({ userId: uid(name), sessionId: uid(`${name}-session`) });
const now = new Date("2026-10-25T07:00:00.000Z"), future = new Date("2026-11-01T00:00:00.000Z");
const invitation = (token = "token") => ({ tokenHash: suite.id(token), expiresAt: future });

describe("R1 actual Business entrypoints and account opposition", () => {
 let db: PrismaService, repository: PrismaBusinessRepository;
 const businessId = uid("business"), epoch = uid("epoch");
 async function cleanup() {
  if (!db) return;
  await db.dealership.deleteMany({ where: { slug: { startsWith: suite.slug } } });
  await db.measurementPrincipal.deleteMany({ where: { epoch } });
  await db.measurementState.deleteMany({ where: { epoch } });
  await cleanSuiteFixtures(db, suite, { userAliases: aliases });
 }
 beforeAll(async () => { db = new PrismaService(); await db.$connect(); repository = new PrismaBusinessRepository(db); });
 beforeEach(async () => {
  await cleanup();
  for (const alias of aliases) {
   await db.user.create({ data: { id: uid(alias), phone: suite.phone(alias), role: alias === "founder" ? "admin" : "seller" } });
   await db.session.create({ data: { id: uid(`${alias}-session`), userId: uid(alias), refreshTokenHash: randomUUID(), expiresAt: future, adminTotpExpiresAt: future } });
  }
  await db.staffGrant.createMany({ data: ["founder.admission", "founder.recovery"].map(capability => ({ userId: uid("founder"), capability })) });
  await db.dealership.create({ data: { id: businessId, slug: suite.slugFor("business"), name: "Checked Business", status: "active", admissionMode: "checked", admittedAt: now } });
  await db.dealershipMember.createMany({ data: [
   { id: uid("owner-member"), userId: uid("owner"), dealershipId: businessId, role: "owner", status: "active" },
   { id: uid("sales-member"), userId: uid("sales"), dealershipId: businessId, role: "sales", status: "active" },
  ] });
  await db.measurementState.createMany({ data: [{ key: "collector", epoch }, { key: `inventory_baseline:${epoch}`, epoch }, { key: `inventory_baseline:${uid("foreign-epoch")}`, epoch }] });
 });
 afterAll(async () => { await cleanup(); await db.$disconnect(); });
 async function noReceipts() { expect(await db.$queryRaw`SELECT id FROM public.diagnostic_source_commands`).toEqual([]); }
 async function schedule(client = db) {
  await new PrismaAccountDeletionUnitOfWork(client).run({ userId: uid("recipient"), deletionScheduledAt: now }, async writes => {
   await writes.scheduleDeletion(uid("recipient"), now); await writes.archiveActiveListings(uid("recipient"));
  });
 }
 async function ownerInvite() {
  await db.dealershipMember.delete({ where: { id: uid("owner-member") } });
  await db.dealership.update({ where: { id: businessId }, data: { status: "recovery" } });
  await db.dealershipInvitation.create({ data: { id: uid("owner-invite"), dealershipId: businessId, recipientUserId: uid("recipient"), role: "owner", ...invitation() } });
 }
 it("admission remains invitation-only, then scalar settings/invite/revoke commit their actual audits", async () => {
  const admitted = await repository.admit({ ...subject("founder"), ...invitation("admission-token"), ownerUserId: uid("recipient"), name: "New Business", slug: suite.slugFor("admitted"), mode: "checked", evidence: "Checked identity", reason: "Admission" }, now);
  expect(await db.dealershipMember.count({ where: { dealershipId: admitted.businessId } })).toBe(0);
  expect(await db.dealership.findUnique({ where: { id: admitted.businessId } })).toMatchObject({ status: "recovery", admissionMode: "checked", admittedAt: now });
  expect(await db.dealershipInvitation.findUnique({ where: { id: admitted.invitationId } })).toMatchObject({ role: "owner", recipientUserId: uid("recipient"), redeemedAt: null });
  await repository.settings({ ...subject("owner"), businessId, name: "Renamed", cityId: null }, now);
  const first = await repository.invite({ ...subject("owner"), businessId, recipientUserId: uid("recipient"), ...invitation("sales-a") }, now);
  const second = await repository.invite({ ...subject("owner"), businessId, recipientUserId: uid("recipient"), ...invitation("sales-b") }, now);
  await repository.revoke({ ...subject("owner"), businessId, invitationId: second.invitationId }, now);
  expect(await db.dealershipInvitation.findMany({ where: { id: { in: [first.invitationId, second.invitationId] } } })).toEqual(expect.arrayContaining([expect.objectContaining({ id: first.invitationId, revokedAt: now }), expect.objectContaining({ id: second.invitationId, revokedAt: now })]));
  expect(await db.auditLog.count({ where: { targetId: { in: [businessId, admitted.businessId] } } })).toBe(5);
  await noReceipts();
 });
 it("competing redemptions serialize an absent member/owner slot into one consented owner", async () => {
  await ownerInvite();
  const results = await Promise.allSettled([repository.redeem({ ...subject("recipient"), tokenHash: invitation().tokenHash }, now), repository.redeem({ ...subject("recipient"), tokenHash: invitation().tokenHash }, now)]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(await db.dealershipMember.findMany({ where: { userId: uid("recipient") } })).toMatchObject([{ role: "owner", status: "active", dealershipId: businessId }]);
  expect(await db.dealershipInvitation.findUnique({ where: { id: uid("owner-invite") } })).toMatchObject({ redeemedAt: now });
  expect(await db.dealership.findUnique({ where: { id: businessId } })).toMatchObject({ status: "active" });
  expect(await db.measurementState.findUnique({ where: { key: `inventory_baseline:${epoch}` } })).toBeNull();
  expect(await db.measurementState.findUnique({ where: { key: `inventory_baseline:${uid("foreign-epoch")}` } })).not.toBeNull();
  await noReceipts();
 });
 it.each([true, false])("recovery removes the actual outgoing owner and waits for Sales consent, outgoing=%s", async outgoing => {
  if (outgoing) await db.user.update({ where: { id: uid("owner") }, data: { suspendedAt: now } });
  else await db.dealershipMember.delete({ where: { id: uid("owner-member") } });
  const recovered = await repository.recover({ ...subject("founder"), businessId, ownerUserId: uid("sales"), ...invitation(), evidence: "Checked recovery", reason: "Owner unavailable" }, now);
  expect(await db.dealershipMember.findUnique({ where: { userId: uid("sales") } })).toMatchObject({ id: uid("sales-member"), role: "sales" });
  expect(await db.dealershipMember.findUnique({ where: { userId: uid("owner") } })).toBeNull();
  expect(await db.dealershipInvitation.findUnique({ where: { id: recovered.invitationId } })).toMatchObject({ role: "owner", redeemedAt: null });
  await repository.redeem({ ...subject("sales"), tokenHash: invitation().tokenHash }, now);
  const member = await db.dealershipMember.findUniqueOrThrow({ where: { userId: uid("sales") } });
  expect(member.role).toBe("owner"); expect(member.id).not.toBe(uid("sales-member")); await noReceipts();
 });
 it("membership suspension/restoration/removal preserve the foreign member and audit every actual change", async () => {
  for (const action of ["suspend", "restore", "remove"] as const) await repository.changeMember({ ...subject("owner"), businessId, targetUserId: uid("sales"), action }, now);
  expect(await db.dealershipMember.findUnique({ where: { userId: uid("sales") } })).toBeNull();
  expect(await db.dealershipMember.findUnique({ where: { userId: uid("owner") } })).toMatchObject({ role: "owner", status: "active" });
  expect(await db.auditLog.count({ where: { targetId: businessId, action: "BUSINESS_MEMBERSHIP_CHANGED" } })).toBe(3); await noReceipts();
 });
 it("a failure after the actual redemption work rolls back invitation, member, Business, baseline and audit", async () => {
  await ownerInvite();
  const failing = new Proxy(db, { get(target, key) {
   if (key === "$transaction") return (work: (tx: object) => Promise<unknown>) => db.$transaction(async tx => { await work(tx); throw new Error("R1 commit failure"); });
   const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
  await expect(new PrismaBusinessRepository(failing).redeem({ ...subject("recipient"), tokenHash: invitation().tokenHash }, now)).rejects.toThrow("R1 commit failure");
  expect(await db.dealershipMember.findUnique({ where: { userId: uid("recipient") } })).toBeNull();
  expect(await db.dealershipInvitation.findUnique({ where: { id: uid("owner-invite") } })).toMatchObject({ redeemedAt: null });
  expect(await db.dealership.findUnique({ where: { id: businessId } })).toMatchObject({ status: "recovery" });
  expect(await db.measurementState.findUnique({ where: { key: `inventory_baseline:${epoch}` } })).not.toBeNull();
  expect(await db.auditLog.count({ where: { targetId: businessId } })).toBe(0); await noReceipts();
 });
 it.each(["account-first", "member-first"] as const)("actual account scheduling opposes actual redemption, %s", async ordering => {
  await ownerInvite();
  if (ordering === "account-first") {
   await schedule(); await expect(repository.redeem({ ...subject("recipient"), tokenHash: invitation().tokenHash }, now)).rejects.toThrow();
  } else { await repository.redeem({ ...subject("recipient"), tokenHash: invitation().tokenHash }, now); await schedule(); }
  expect(await db.user.findUnique({ where: { id: uid("recipient") } })).toMatchObject({ deletionScheduledAt: now });
  expect(await db.dealershipMember.findUnique({ where: { userId: uid("recipient") } })).toBeNull();
  expect(await db.dealershipInvitation.count({ where: { recipientUserId: uid("recipient") } })).toBe(0);
  await new PrismaAccountRestoreUnitOfWork(db).run({ userId: uid("recipient") }, async writes => { await writes.republishListingsArchivedByDeletion(uid("recipient")); await writes.clearDeletionSchedule(uid("recipient")); });
  expect(await db.dealershipMember.findUnique({ where: { userId: uid("recipient") } })).toBeNull(); await noReceipts();
 });
});
