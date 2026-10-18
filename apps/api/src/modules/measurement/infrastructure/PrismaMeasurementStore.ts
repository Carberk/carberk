import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PrismaService } from "@auto-tm/db";
import { MeasurementSchemas } from "@auto-tm/contracts";
import type { MeasurementSubjectPort } from "../application/AcceptClientMeasurementBatch";
import type { MeasurementAuthority, MeasurementLedgerPort, MeasurementConversionPort } from "../measurement.public";
import { MeasurementVisit } from "../domain/MeasurementVisit";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Principal = { id: string; pseudonym: string; generation: string; epoch: string; kind: string; userId: string | null; expiresAt: Date | null };
export interface MeasurementBootstrap {
 visitId: string; generation: string; guestCapability?: string;
}
export interface MeasurementStoreConfig {
 epoch: string;
 environment: MeasurementAuthority["environment"];
 population: MeasurementAuthority["population"];
 expiresAt?: string;
}

/** Atomic principal/visit eligibility and event-ID dedupe share the deletion lock. */
export class PrismaMeasurementStore implements MeasurementLedgerPort, MeasurementSubjectPort {
 constructor(private readonly prisma: PrismaService, private readonly config: MeasurementStoreConfig, private readonly now: () => Date = () => new Date(),private readonly conversion?:MeasurementConversionPort) {}
 private admitted(): boolean {
  return !this.config.expiresAt || Date.parse(this.config.expiresAt) > this.now().getTime();
 }
 private authority(row: Principal): MeasurementAuthority {
  return { origin: "client", environment: this.config.environment, population: this.config.population,
   subject: { kind: row.kind as "account" | "guest", pseudonym: row.pseudonym, generation: row.generation } };
 }
 async resolve(input: { authenticatedUserId?: string; guestCapability?: string }): Promise<MeasurementAuthority | null> {
  if (!this.admitted()) return null;
  if (!input.authenticatedUserId && (!input.guestCapability || !/^mg_[A-Za-z0-9_-]{43}$/.test(input.guestCapability))) return null;
  const state = await this.prisma.measurementState.findUnique({ where: { key: "collector" } });
  if (state?.epoch !== this.config.epoch) return null;
  const row = input.authenticatedUserId
   ? await this.prisma.measurementPrincipal.findUnique({ where: { userId: input.authenticatedUserId } })
   : await this.prisma.measurementPrincipal.findUnique({ where: { capabilityHash: hash(input.guestCapability ?? "") } });
  if (!row || row.epoch !== this.config.epoch || (row.expiresAt && row.expiresAt <= this.now())) return null;
  return this.authority(row);
 }
 async bootstrap(input: { authenticatedUserId?: string; guestCapability?: string; visitId?: string }): Promise<MeasurementBootstrap | null> {
  if (!this.admitted()) return null;
  const now = this.now();
  return this.prisma.$transaction(async (tx) => {
   const states = await tx.$queryRaw<{ epoch: string }[]>`SELECT "epoch" FROM "measurement_state" WHERE "key" = 'collector' FOR SHARE`;
   if (states[0]?.epoch !== this.config.epoch) return null;
   let principal: Principal | null = null; let guestCapability: string | undefined;
   if (input.authenticatedUserId) {
    // The account row lock serializes issuance with the identity deletion transaction.
    const users = await tx.$queryRaw<{ deletionScheduledAt: Date | null }[]>`SELECT "deletionScheduledAt" FROM "users" WHERE "id" = ${input.authenticatedUserId} FOR UPDATE`;
    if (!users[0] || users[0].deletionScheduledAt) return null;
    principal = await tx.measurementPrincipal.findUnique({ where: { userId: input.authenticatedUserId } });
   } else if (input.guestCapability && /^mg_[A-Za-z0-9_-]{43}$/.test(input.guestCapability)) {
    principal = await tx.measurementPrincipal.findUnique({ where: { capabilityHash: hash(input.guestCapability) } });
   }
   if (principal && (principal.epoch !== this.config.epoch || (principal.expiresAt && principal.expiresAt <= now))) principal = null;
   if (!principal) {
    guestCapability = input.authenticatedUserId ? undefined : `mg_${randomBytes(32).toString("base64url")}`;
    principal = await tx.measurementPrincipal.create({ data: { id: randomUUID(), pseudonym: randomBytes(32).toString("hex"), generation: randomUUID(), epoch: this.config.epoch,
     kind: input.authenticatedUserId ? "account" : "guest", userId: input.authenticatedUserId ?? null,
     capabilityHash: guestCapability ? hash(guestCapability) : null,
     expiresAt: input.authenticatedUserId ? null : new Date(now.getTime() + MeasurementSchemas.MEASUREMENT_LIMITS.guestContinuityMs),
    } });
   }
   await tx.$queryRaw`SELECT "id" FROM "measurement_principals" WHERE "id" = ${principal.id} FOR UPDATE`;
   const previous = input.visitId ? await tx.measurementVisit.findUnique({ where: { id: input.visitId } }) : null;
   const visit = MeasurementVisit.foreground(previous, principal.id, now, randomUUID());
   await tx.measurementVisit.upsert({ where: { id: visit.id }, create: visit, update: { foregroundAt: visit.foregroundAt } });
   // Only the supplied current guest visit can be associated with this account.
   if (input.authenticatedUserId && input.guestCapability && input.visitId && /^mg_[A-Za-z0-9_-]{43}$/.test(input.guestCapability)) {
    const guest = await tx.measurementPrincipal.findUnique({ where: { capabilityHash: hash(input.guestCapability) } });
    if (guest && guest.epoch === this.config.epoch && guest.expiresAt && guest.expiresAt > now && previous
     && previous.principalId === guest.id && !previous.linkedAccountId && !previous.endedAt
     && MeasurementVisit.permits(previous, guest.id, now)) {
     await tx.measurementVisit.updateMany({ where: { id: previous.id, linkedAccountId: null, endedAt: null }, data: { linkedAccountId: principal.id, endedAt: now } });
    }
   }
   return { visitId: visit.id, generation: principal.generation, ...(guestCapability ? { guestCapability } : {}) };
  }, { maxWait: 250, timeout: 1000 });
 }
 async appendIfEligible(record: Parameters<MeasurementLedgerPort["appendIfEligible"]>[0]): Promise<"accepted" | "duplicate" | "revoked"> {
  if (!this.admitted()) return "revoked";
  return this.prisma.$transaction(async (tx) => {
   const states = await tx.$queryRaw<{ epoch: string }[]>`SELECT "epoch" FROM "measurement_state" WHERE "key" = 'collector' FOR SHARE`;
   if (states[0]?.epoch !== this.config.epoch) return "revoked";
   const rows = await tx.$queryRaw<Principal[]>`SELECT * FROM "measurement_principals" WHERE "pseudonym" = ${record.authority.subject.pseudonym} FOR UPDATE`;
   const principal = rows[0];
   if (!principal || principal.epoch !== this.config.epoch || principal.generation !== record.authority.subject.generation
    || principal.kind !== record.authority.subject.kind || (principal.expiresAt && principal.expiresAt <= this.now())) return "revoked";
   if (record.authority.origin === "client" || record.event.visitId) {
    if (!record.event.visitId) return "revoked";
    const visit = await tx.measurementVisit.findUnique({ where: { id: record.event.visitId } });
    if (!visit || !MeasurementVisit.permits(visit, principal.id, new Date(record.event.occurredAt))) return "revoked";
   }
   const conversionEligible=this.conversion?await this.conversion.eligible(tx,{userId:principal.userId,event:record.event}):false;
   const inserted = await tx.measurementRecord.createMany({ data: [{ id: record.event.eventId, principalId: principal.id, visitId: record.event.visitId ?? null,
    event: JSON.parse(JSON.stringify(record.event)), origin: record.authority.origin, environment: record.authority.environment, population: record.authority.population, conversionEligible,
    occurredAt: new Date(record.event.occurredAt), receivedAt: record.receivedAt, expiresAt: record.expiresAt }], skipDuplicates: true });
   return inserted.count ? "accepted" : "duplicate";
  }, { maxWait: 250, timeout: 1000 });
 }
 /** Guest-safe erasure requires its scoped secret. No account or other app privileges. */
 async eraseGuest(capability: string): Promise<void> {
  if (!/^mg_[A-Za-z0-9_-]{43}$/.test(capability)) return;
  await this.prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT "epoch" FROM "measurement_state" WHERE "key"='collector' FOR UPDATE`;
   const guest=await tx.measurementPrincipal.findUnique({where:{capabilityHash:hash(capability)}});
   if(guest?.kind!=="guest") return;
   await tx.measurementInvestigationExport.deleteMany();
   await tx.measurementPrincipal.delete({where:{id:guest.id}});
  });
 }
 /** Operator supplies a NEW external epoch before restored data can be served. Deletes all old actor maps. */
 async rotateRestoreEpoch(nextEpoch: string): Promise<void> {
  if (!/^[a-f0-9-]{36}$/.test(nextEpoch)) throw new Error("Fresh collector epoch required");
  await this.prisma.$transaction(async (tx) => {
   const state = await tx.$queryRaw<{ epoch: string }[]>`SELECT "epoch" FROM "measurement_state" WHERE "key" = 'collector' FOR UPDATE`;
   if (state[0]?.epoch === nextEpoch) throw new Error("Fresh collector epoch required");
   await tx.measurementInvestigationExport.deleteMany();
   await tx.measurementPrincipal.deleteMany();
   await tx.measurementState.upsert({ where: { key: "collector" }, create: { key: "collector", epoch: nextEpoch }, update: { epoch: nextEpoch } });
  });
 }
}
