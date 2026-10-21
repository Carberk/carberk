import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, type Prisma } from "@auto-tm/db";
import { DiagnosticSchemas } from "@auto-tm/contracts";
import { BUSINESS_AUTHORITY_PORT, type BusinessAuthorityPort } from "../../identity/identity.public";
import { InspectionOrder, DiagnosticRuleError, type InspectionOrderState } from "../domain/InspectionOrder";
import { DIAGNOSTIC_RUNTIME, type DiagnosticIntakePort, type DiagnosticRuntime, type DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";

import { DiagnosticAuthority } from "./DiagnosticAuthority";

type Tx = Prisma.TransactionClient;
type Order = Prisma.InspectionOrderGetPayload<object>;
const denial = () => new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function diagnosticListingDigest(listing: { id: string; sellerId: string; businessId: string | null; vin: string | null; brandId: string; modelId: string; year: number | null }): string {
  return createHash("sha256").update(JSON.stringify([listing.id, listing.sellerId, listing.businessId, listing.vin?.trim().toUpperCase() ?? null, listing.brandId, listing.modelId, listing.year])).digest("hex");
}

/** The intake owner serializes current identity, center assignments and order changes.
 * No Listing owner or global administrator becomes a private report reader. */
@Injectable()
export class PrismaDiagnosticIntake implements DiagnosticIntakePort {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(DiagnosticAuthority) private readonly authority: DiagnosticAuthority,
    @Inject(BUSINESS_AUTHORITY_PORT) private readonly business: BusinessAuthorityPort,
    @Inject(DIAGNOSTIC_RUNTIME) private readonly runtime: DiagnosticRuntime) {}

  private current(tx: Tx, subject: DiagnosticSubject): Promise<void> { return this.authority.current(tx, subject); }
  private centerAuthority(tx: Tx, subject: DiagnosticSubject, centerId: string, capability: DiagnosticSchemas.DiagnosticCapability): Promise<void> { return this.authority.center(tx, subject, centerId, capability); }
  private scope(tx: Tx, subject: DiagnosticSubject, id: string, capability?: DiagnosticSchemas.DiagnosticCapability): Promise<{ row: Order; staff: boolean }> { return this.authority.order(tx, subject, id, capability); }
  private version(row: Order, expected: number): void { if (row.version !== expected) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION"); }
  private async audit(tx: Tx, subject: DiagnosticSubject, row: Pick<Order, "id" | "centerId">, action: string, details: Prisma.InputJsonValue = {}): Promise<void> {
    await tx.diagnosticAudit.create({ data: { id: this.runtime.id(), centerId: row.centerId, orderId: row.id, actorId: subject.userId, action, details, createdAt: this.runtime.now() } });
  }
  private async dto(tx: Tx, row: Order, staff: boolean): Promise<DiagnosticSchemas.DiagnosticOrder> {
    const records = await tx.diagnosticAudit.findMany({ where: { orderId: row.id, action: "APPOINTMENT_CHANGED" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const events = records.flatMap(record => {
      const value = record.details as { state?: string };
      const state = DiagnosticSchemas.DiagnosticAppointmentStateSchema.safeParse(value.state);
      return state.success && record.actorId ? [{ state: state.data, actorId: record.actorId, occurredAt: record.createdAt.toISOString() }] : [];
    });
    return DiagnosticSchemas.DiagnosticOrderSchema.parse({ id: row.id, centerId: row.centerId, templateVersionId: row.templateVersionId, audience: row.audience,
      listingId: row.listingId, status: row.status, version: row.version, synthetic: row.synthetic, createdAt: row.createdAt.toISOString(),
      physicalAuthorized: !!row.physicalAuthorization, publicationAuthorized: !!row.publicationAuthorization, vehicleMatched: !!row.associationValidatedAt,
      physicalAuthorization: staff ? row.physicalAuthorization : null, publicationAuthorization: staff ? row.publicationAuthorization : null,
      observedVehicle: staff ? row.observedVehicle : null, events });
  }
  private template(row: Prisma.DiagnosticTemplateVersionGetPayload<object>): DiagnosticSchemas.DiagnosticTemplate {
    return DiagnosticSchemas.DiagnosticTemplateSchema.parse({ ...row, publishedAt: row.publishedAt.toISOString() });
  }
  async create(subject: DiagnosticSubject, input: DiagnosticSchemas.DiagnosticCreate): Promise<DiagnosticSchemas.DiagnosticOrder> {
    return this.db.$transaction(async tx => {
      const campaign = await this.authority.admitted(tx, subject, {}, "DIAGNOSTIC_SERVICE_UNAVAILABLE");
      const prior = await tx.inspectionOrder.findUnique({ where: { commissionerId_requestKey: { commissionerId: subject.userId, requestKey: input.requestKey } } });
      if (prior) {
        if (prior.centerId !== input.centerId || prior.templateVersionId !== input.templateVersionId || prior.audience !== input.audience || prior.listingId !== (input.listingId ?? null)) throw new DiagnosticRuleError("DIAGNOSTIC_IDEMPOTENCY_CONFLICT");
        if (prior.erasedAt) throw denial();
        // A reservation replay reads back only an order its own journal recorded.
        if (campaign && !await this.authority.owned(tx, campaign, subject, { orderId: prior.id })) throw denial();
        return this.dto(tx, prior, false);
      }
      // The first full-v3 slice admits buyer-private intake only; Listing-linked orders are a later slice.
      if (campaign && (input.audience !== "buyer_private" || input.listingId)) throw denial();
      await tx.$queryRaw`SELECT id FROM diagnostic_centers WHERE id=${input.centerId} FOR UPDATE`;
      const template = await tx.diagnosticTemplateVersion.findUnique({ where: { id: input.templateVersionId } });
      if (!template || template.centerId !== input.centerId || !template.synthetic) throw new DiagnosticRuleError("DIAGNOSTIC_TEMPLATE_UNAVAILABLE");
      if (campaign && !await this.authority.owned(tx, campaign, subject, { centerId: input.centerId, templateVersionId: input.templateVersionId })) throw denial();
      if (input.listingId) {
        const listing = await tx.listing.findUnique({ where: { id: input.listingId }, select: { businessId: true, sellerId: true, status: true, deletedAt: true } });
        if (!listing || listing.deletedAt || !["active", "sold", "paused"].includes(listing.status)) throw denial();
        if (input.audience === "listing_public") {
          if (listing.businessId) await this.business.authorize({ ...subject, businessId: listing.businessId }, tx);
          else if (listing.sellerId !== subject.userId) throw denial();
        }
      }
      const reception = await tx.diagnosticCenterAssignment.findMany({ where: { centerId: input.centerId, capability: "diagnostics.reception", revokedAt: null, qualifiedUntil: { gt: this.runtime.now() }, user: { suspendedAt: null, deletionScheduledAt: null, staffGrants: { some: { capability: "diagnostics.reception", revokedAt: null } } } } });
      // A reservation assigns only its own journaled, qualified reception peers; no Session is invented for them.
      const assigned: typeof reception = [];
      for (const item of reception) {
        if (campaign ? await this.authority.owned(tx, campaign, subject, { centerId: input.centerId, peerId: item.userId }) : this.runtime.syntheticAllowed({ userId: item.userId, sessionId: "" })) assigned.push(item);
      }
      if (!assigned.length) throw new DiagnosticRuleError("DIAGNOSTIC_SERVICE_UNAVAILABLE");
      const row = await tx.inspectionOrder.create({ data: { id: this.runtime.id(), centerId: input.centerId, templateVersionId: input.templateVersionId,
        commissionerId: subject.userId, requestKey: input.requestKey, audience: input.audience, listingId: input.listingId ?? null, synthetic: true,
        assignments: { create: assigned.map(item => ({ userId: item.userId, capability: item.capability })) } } });
      await this.audit(tx, subject, row, "INTAKE_CREATED", { audience: input.audience, templateVersionId: input.templateVersionId, synthetic: true });
      return this.dto(tx, row, false);
    });
  }
  private async staffScope(tx: Tx, subject: DiagnosticSubject, id: string) {
    for (const capability of DiagnosticSchemas.DiagnosticCapabilitySchema.options) {
      try { return await this.scope(tx, subject, id, capability); }
      catch (error) { if (!(error instanceof DiagnosticRuleError)) throw error; }
    }
    throw denial();
  }
  async assigned(subject: DiagnosticSubject): Promise<DiagnosticSchemas.DiagnosticOrder[]> {
    return this.db.$transaction(async tx => {
      await this.current(tx, subject);
      const rows = await tx.inspectionOrder.findMany({ where: { synthetic: true, erasedAt: null, assignments: { some: { userId: subject.userId, revokedAt: null } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50 });
      const result: DiagnosticSchemas.DiagnosticOrder[] = [];
      for (const row of rows) {
        try { const scope = await this.staffScope(tx, subject, row.id); if (scope.staff) result.push(await this.dto(tx, scope.row, true)); }
        catch (error) { if (!(error instanceof DiagnosticRuleError)) throw error; }
      }
      return result;
    });
  }
  async workspace(subject: DiagnosticSubject, id: string): Promise<DiagnosticSchemas.DiagnosticWorkspace> {
    return this.db.$transaction(async tx => {
      const scope = await this.staffScope(tx, subject, id);
      if (!scope.staff) throw denial();
      const assignments = await tx.diagnosticOrderAssignment.findMany({ where: { orderId: id, revokedAt: null }, orderBy: [{ userId: "asc" }, { capability: "asc" }] });
      const capabilities: DiagnosticSchemas.DiagnosticCapability[] = [];
      for (const assignment of assignments.filter(item => item.userId === subject.userId)) {
        const parsed = DiagnosticSchemas.DiagnosticCapabilitySchema.safeParse(assignment.capability);
        if (!parsed.success) continue;
        try { await this.centerAuthority(tx, subject, scope.row.centerId, parsed.data); capabilities.push(parsed.data); }
        catch (error) { if (!(error instanceof DiagnosticRuleError)) throw error; }
      }
      const template = await tx.diagnosticTemplateVersion.findUnique({ where: { id: scope.row.templateVersionId } });
      if (!template || template.centerId !== scope.row.centerId) throw denial();
      const staffChoices: DiagnosticSchemas.DiagnosticWorkspace["staffChoices"] = [];
      if (capabilities.includes("diagnostics.reception")) {
        const candidates = await tx.diagnosticCenterAssignment.findMany({ where: { centerId: scope.row.centerId, revokedAt: null, qualifiedUntil: { gt: this.runtime.now() }, user: { suspendedAt: null, deletionScheduledAt: null } }, include: { user: { select: { displayName: true, staffGrants: { where: { revokedAt: null } } } } }, orderBy: [{ userId: "asc" }, { capability: "asc" }], take: 100 });
        for (const candidate of candidates) {
          const parsed = DiagnosticSchemas.DiagnosticCapabilitySchema.safeParse(candidate.capability);
          if (parsed.success && candidate.user.staffGrants.some(grant => grant.capability === candidate.capability) && this.runtime.syntheticAllowed({ userId: candidate.userId, sessionId: "" })) staffChoices.push({ userId: candidate.userId, capability: parsed.data, label: candidate.user.displayName ?? candidate.userId });
        }
      }
      return DiagnosticSchemas.DiagnosticWorkspaceSchema.parse({ actorId: subject.userId, order: await this.dto(tx, scope.row, true), template: this.template(template), capabilities,
        assignments: assignments.flatMap(item => { const parsed = DiagnosticSchemas.DiagnosticCapabilitySchema.safeParse(item.capability); return parsed.success ? [{ userId: item.userId, capability: parsed.data }] : []; }), staffChoices });
    });
  }
  async read(subject: DiagnosticSubject, id: string): Promise<DiagnosticSchemas.DiagnosticOrder> {
    return this.db.$transaction(async tx => { const scope = await this.scope(tx, subject, id); return this.dto(tx, scope.row, scope.staff); });
  }
  async mine(subject: DiagnosticSubject): Promise<DiagnosticSchemas.DiagnosticOrder[]> {
    return this.db.$transaction(async tx => {
      await this.current(tx, subject);
      const rows = await tx.inspectionOrder.findMany({ where: { commissionerId: subject.userId, erasedAt: null, synthetic: true }, orderBy: { createdAt: "desc" }, take: 50 });
      return Promise.all(rows.map(row => this.dto(tx, row, false)));
    });
  }
  async queue(subject: DiagnosticSubject, centerId: string): Promise<DiagnosticSchemas.DiagnosticOrder[]> {
    return this.db.$transaction(async tx => {
      await this.authority.admitted(tx, subject, { centerId }); await this.centerAuthority(tx, subject, centerId, "diagnostics.reception");
      const rows = await tx.inspectionOrder.findMany({ where: { centerId, erasedAt: null, synthetic: true, assignments: { some: { userId: subject.userId, capability: "diagnostics.reception", revokedAt: null } } }, orderBy: { createdAt: "asc" }, take: 50 });
      return Promise.all(rows.map(row => this.dto(tx, row, true)));
    });
  }
  async templates(subject: DiagnosticSubject, centerId: string): Promise<DiagnosticSchemas.DiagnosticTemplate[]> {
    return this.db.$transaction(async tx => {
      await this.authority.admitted(tx, subject, { centerId });
      let allowed = false;
      for (const capability of DiagnosticSchemas.DiagnosticCapabilitySchema.options) {
        try { await this.centerAuthority(tx, subject, centerId, capability); allowed = true; break; }
        catch (error) { if (!(error instanceof DiagnosticRuleError)) throw error; }
      }
      if (!allowed) throw denial();
      return (await tx.diagnosticTemplateVersion.findMany({ where: { centerId }, orderBy: { version: "desc" }, take: 25 })).map(row => this.template(row));
    });
  }
  async publishTemplate(subject: DiagnosticSubject, centerId: string, input: DiagnosticSchemas.PublishDiagnosticTemplate): Promise<DiagnosticSchemas.DiagnosticTemplate> {
    return this.db.$transaction(async tx => {
      await this.authority.admitted(tx, subject, { centerId }); await this.centerAuthority(tx, subject, centerId, "diagnostics.templates");
      await tx.$queryRaw`SELECT id FROM diagnostic_centers WHERE id=${centerId} FOR UPDATE`;
      const latest = await tx.diagnosticTemplateVersion.findFirst({ where: { centerId }, orderBy: { version: "desc" } });
      if ((latest?.version ?? 0) !== input.expectedVersion) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
      const row = await tx.diagnosticTemplateVersion.create({ data: { id: this.runtime.id(), centerId, version: input.expectedVersion + 1, definition: json(input.definition), synthetic: true, publishedById: subject.userId, publishedAt: this.runtime.now() } });
      await tx.diagnosticAudit.create({ data: { centerId, actorId: subject.userId, action: "TEMPLATE_PUBLISHED", details: { templateVersionId: row.id, version: row.version, synthetic: true } } });
      return this.template(row);
    });
  }
  async authorize(subject: DiagnosticSubject, id: string, input: DiagnosticSchemas.DiagnosticAuthorization): Promise<DiagnosticSchemas.DiagnosticOrder> {
    return this.db.$transaction(async tx => {
      const { row } = await this.scope(tx, subject, id, "diagnostics.reception"); this.version(row, input.expectedVersion);
      const state = this.order(row).authorize(input.kind, { authorityReference: input.authorityReference, recordedBy: subject.userId, recordedAt: this.runtime.now().toISOString() }).state;
      const next = await tx.inspectionOrder.update({ where: { id }, data: { version: { increment: 1 }, ...(input.kind === "physical" ? { physicalAuthorization: json(state.physicalAuthorization) } : { publicationAuthorization: json(state.publicationAuthorization) }) } });
      await this.audit(tx, subject, row, input.kind === "physical" ? "PHYSICAL_AUTHORIZATION_RECORDED" : "PUBLICATION_CONSENT_RECORDED");
      return this.dto(tx, next, true);
    });
  }
  private order(row: Order): InspectionOrder {
    return new InspectionOrder({ id: row.id, centerId: row.centerId, templateVersionId: row.templateVersionId, commissionerId: row.commissionerId ?? "",
      audience: DiagnosticSchemas.DiagnosticAudienceSchema.parse(row.audience), listingId: row.listingId, status: DiagnosticSchemas.DiagnosticAppointmentStateSchema.parse(row.status),
      physicalAuthorization: row.physicalAuthorization as InspectionOrderState["physicalAuthorization"], publicationAuthorization: row.publicationAuthorization as InspectionOrderState["publicationAuthorization"], events: [] });
  }
  async appointment(subject: DiagnosticSubject, id: string, input: DiagnosticSchemas.DiagnosticAppointmentChange): Promise<DiagnosticSchemas.DiagnosticOrder> {
    return this.db.$transaction(async tx => {
      const scoped = await this.scope(tx, subject, id, input.state === "cancelled" ? undefined : "diagnostics.reception");
      this.version(scoped.row, input.expectedVersion);
      const nextState = this.order(scoped.row).transition(input.state, subject.userId, this.runtime.now()).state;
      if (nextState.status === scoped.row.status) return this.dto(tx, scoped.row, scoped.staff);
      const next = await tx.inspectionOrder.update({ where: { id }, data: { status: nextState.status, version: { increment: 1 } } });
      await this.audit(tx, subject, next, "APPOINTMENT_CHANGED", { state: nextState.status }); return this.dto(tx, next, scoped.staff);
    });
  }
  async assign(subject: DiagnosticSubject, id: string, input: DiagnosticSchemas.DiagnosticAssignmentChange): Promise<DiagnosticSchemas.DiagnosticOrder> {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id IN (${subject.userId},${input.userId}) ORDER BY id FOR UPDATE`;
      const { row } = await this.scope(tx, subject, id, "diagnostics.reception"); this.version(row, input.expectedVersion);
      const target = await tx.user.findUnique({ where: { id: input.userId }, select: { suspendedAt: true, deletionScheduledAt: true, staffGrants: { where: { capability: input.capability, revokedAt: null } } } });
      const assignment = await tx.diagnosticCenterAssignment.findUnique({ where: { centerId_userId_capability: { centerId: row.centerId, userId: input.userId, capability: input.capability } } });
      if (input.active && (!target || target.suspendedAt || target.deletionScheduledAt || !target.staffGrants.length || !assignment || assignment.revokedAt || !assignment.qualifiedUntil || assignment.qualifiedUntil <= this.runtime.now() || !this.runtime.syntheticAllowed({ userId: input.userId, sessionId: "" }))) throw denial();
      if (!input.active && input.userId === subject.userId && input.capability === "diagnostics.reception") throw new DiagnosticRuleError("DIAGNOSTIC_HANDOVER_REQUIRED");
      await tx.diagnosticOrderAssignment.upsert({ where: { orderId_userId_capability: { orderId: id, userId: input.userId, capability: input.capability } }, create: { orderId: id, userId: input.userId, capability: input.capability, revokedAt: input.active ? null : this.runtime.now() }, update: { revokedAt: input.active ? null : this.runtime.now() } });
      const next = await tx.inspectionOrder.update({ where: { id }, data: { version: { increment: 1 } } });
      await this.audit(tx, subject, row, "ORDER_ASSIGNMENT_CHANGED", { targetUserId: input.userId, capability: input.capability, active: input.active }); return this.dto(tx, next, true);
    });
  }
  async observeVehicle(subject: DiagnosticSubject, id: string, input: DiagnosticSchemas.DiagnosticObservedVehicle): Promise<DiagnosticSchemas.DiagnosticOrder> {
    return this.db.$transaction(async tx => {
      const { row } = await this.scope(tx, subject, id, "diagnostics.technician");
      const { expectedVersion, ...observed } = input;
      this.version(row, expectedVersion);
      if (row.status !== "arrived" || new Date(input.observedAt) > this.runtime.now()) throw new DiagnosticRuleError("DIAGNOSTIC_OBSERVATION_DENIED");
      let identityDigest: string | null = null;
      if (row.audience === "listing_public") {
        if (!row.listingId || !row.publicationAuthorization || !row.physicalAuthorization) throw new DiagnosticRuleError("PUBLICATION_AUTHORIZATION_REQUIRED");
        await tx.$queryRaw`SELECT id FROM listings WHERE id=${row.listingId} FOR SHARE`;
        const listing = await tx.listing.findUnique({ where: { id: row.listingId } });
        if (!listing || listing.deletedAt) throw denial();
        if (input.method === "vin" && (!listing.vin || listing.vin.trim().toUpperCase() !== input.vin?.trim().toUpperCase())) throw new DiagnosticRuleError("DIAGNOSTIC_VEHICLE_MISMATCH");
        identityDigest = diagnosticListingDigest(listing);
      }
      const next = await tx.inspectionOrder.update({ where: { id }, data: { observedVehicle: json(observed), listingIdentityDigest: identityDigest, associationValidatedAt: row.audience === "listing_public" ? this.runtime.now() : null, version: { increment: 1 } } });
      await this.audit(tx, subject, row, "VEHICLE_OBSERVED", { method: input.method }); return this.dto(tx, next, true);
    });
  }
}
