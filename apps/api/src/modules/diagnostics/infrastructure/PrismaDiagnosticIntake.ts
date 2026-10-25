import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PrismaService, sealDiagnosticFirstObservation, type DiagnosticSourceCommand, type DiagnosticSourceRow, Prisma } from "@auto-tm/db";
import { DiagnosticSchemas } from "@auto-tm/contracts";
import { BUSINESS_AUTHORITY_PORT, type BusinessAuthorityPort } from "../../identity/identity.public";
import { InspectionOrder, DiagnosticRuleError, type InspectionOrderState } from "../domain/InspectionOrder";
import { DIAGNOSTIC_RUNTIME, type DiagnosticIntakePort, type DiagnosticRuntime, type DiagnosticSubject } from "../domain/ports/DiagnosticIntakePort";

import { diagnosticMutation, diagnosticPlannedRow, diagnosticReadPrefix, diagnosticRoots } from "./DiagnosticPreparedIntake";

import { DiagnosticAuthority } from "./DiagnosticAuthority";

type Tx = Prisma.TransactionClient;
type Order = Prisma.InspectionOrderGetPayload<object>;
const denial = () => new DiagnosticRuleError("DIAGNOSTIC_NO_ACCESS");
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export { diagnosticListingDigest } from "./diagnosticListingDigest";
import { diagnosticListingDigest } from "./diagnosticListingDigest";
import { DiagnosticPublicBindings } from "./DiagnosticPublicBindings";
import { DiagnosticOwnershipGrants } from "./DiagnosticOwnershipGrants";
import { DiagnosticOwnershipCapture } from "./DiagnosticOwnershipCapture";

/** Stable binding of one recorded observation to its visit and resulting order version. */
export function diagnosticObservationHash(orderId: string, orderVersion: number, observed: Omit<DiagnosticSchemas.DiagnosticObservedVehicle, "expectedVersion">): string {
  return createHash("sha256").update(JSON.stringify(["diagnostic-identity-record/v1", orderId, orderVersion, observed.observedAt, observed.mileageKm, observed.method, observed.vin, observed.manualReference])).digest("hex");
}

/** The intake owner serializes current identity, center assignments and order changes.
 * No Listing owner or global administrator becomes a private report reader. */
@Injectable()
export class PrismaDiagnosticIntake implements DiagnosticIntakePort {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(DiagnosticAuthority) private readonly authority: DiagnosticAuthority,
    @Inject(BUSINESS_AUTHORITY_PORT) private readonly business: BusinessAuthorityPort,
    @Inject(DiagnosticPublicBindings) private readonly publicBindings: DiagnosticPublicBindings,
    @Inject(DIAGNOSTIC_RUNTIME) private readonly runtime: DiagnosticRuntime) {}

  private command(subject: DiagnosticSubject, operation: Exclude<DiagnosticSourceCommand["operation"], "user_eligibility">, rows: DiagnosticSourceRow[], ids: string[], cutoff: Date | null = null): Exclude<DiagnosticSourceCommand, { operation: "user_eligibility" }> {
    return { operation, roots: diagnosticRoots(subject, ids), rows, actorUserId: subject.userId, sessionId: subject.sessionId, cutoff, campaign: null };
  }
  private async plannedAudit(tx: Tx, subject: DiagnosticSubject, row: Pick<Order, "id" | "centerId">, action: string, details: Prisma.InputJsonValue = {}) {
    const data = { id: this.runtime.id(), centerId: row.centerId, orderId: row.id, actorId: subject.userId, action, details, createdAt: this.runtime.now() };
    const plan = await diagnosticPlannedRow(tx, { table: "diagnostic_audits", key: { id: data.id } }, data, true);
    return { data, plan };
  }
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
      const prior = await tx.inspectionOrder.findUnique({ where: { commissionerId_requestKey: { commissionerId: subject.userId, requestKey: input.requestKey } } });
      if (prior) {
        await this.authority.admitted(tx, subject, { centerId: input.centerId, orderId: prior.id });
        if (prior.centerId !== input.centerId || prior.templateVersionId !== input.templateVersionId || prior.audience !== input.audience || prior.listingId !== (input.listingId ?? null)) throw new DiagnosticRuleError("DIAGNOSTIC_IDEMPOTENCY_CONFLICT");
        const current = await tx.inspectionOrder.findUnique({ where: { id: prior.id } });
        if (!current || current.erasedAt || current.commissionerId !== subject.userId || current.requestKey !== input.requestKey) throw denial();
        if (current.centerId !== input.centerId || current.templateVersionId !== input.templateVersionId || current.audience !== input.audience || current.listingId !== (input.listingId ?? null)) throw new DiagnosticRuleError("DIAGNOSTIC_IDEMPOTENCY_CONFLICT");
        const campaign = await this.authority.admissionScope(tx, subject);
        if (campaign && !await this.authority.owned(tx, campaign, subject, { orderId: current.id })) throw denial();
        return this.dto(tx, current, false);
      }
      const campaign = await this.authority.admissionScope(tx, subject);
      if (!campaign && !this.runtime.syntheticAllowed(subject)) throw new DiagnosticRuleError("DIAGNOSTIC_SERVICE_UNAVAILABLE");
      if (campaign && (input.audience !== "buyer_private" || input.listingId)) throw denial();
      const reception = await tx.diagnosticCenterAssignment.findMany({ where: { centerId: input.centerId, capability: "diagnostics.reception", revokedAt: null, qualifiedUntil: { gt: this.runtime.now() }, user: { suspendedAt: null, deletionScheduledAt: null, staffGrants: { some: { capability: "diagnostics.reception", revokedAt: null } } } } });
      let selected: { id: string; userId: string; capability: string }[] = reception.filter(item => this.runtime.syntheticAllowed({ userId: item.userId, sessionId: "" }));
      if (campaign) {
        const admission = { operation: "campaign_admit", roots: [{ table: "diagnostic_centers", key: { id: input.centerId } }], rows: [], actorUserId: subject.userId, sessionId: subject.sessionId, cutoff: null, campaign: null, intent: {} };
        const [discovery] = await tx.$queryRaw<{ contract: { reception: string; effects: { table: string; next: { id: string; userId: string; capability: string } }[] } }[]>`
          SELECT public.diagnostic_campaign_intake(${JSON.stringify(admission)}::jsonb) AS contract
        `;
        if (!discovery) throw denial();
        selected = reception.filter(item => item.userId === discovery.contract.reception);
        selected.push(...discovery.contract.effects.filter(effect => effect.table === "diagnostic_center_assignments" && effect.next.capability === "diagnostics.reception").map(effect => effect.next));
      }
      if (!selected.length) throw new DiagnosticRuleError("DIAGNOSTIC_SERVICE_UNAVAILABLE");
      const id = this.runtime.id();
      const [companions] = await tx.$queryRaw<{ auditId: string; at: Date; assignments: { id: string; userId: string; capability: string }[] }[]>`
        SELECT public.diagnostic_intake_uuid(${'diagnostic-source:intake_create:' + id}) AS "auditId",transaction_timestamp()::timestamp(3) AS at,
          (SELECT jsonb_agg(jsonb_build_object('id',public.diagnostic_intake_uuid(${'diagnostic-source:intake-assignment:' + id + ':'}||(q->>'id')),'userId',q->>'userId','capability',q->>'capability')) FROM jsonb_array_elements(${JSON.stringify(selected)}::jsonb) q) AS assignments
      `;
      if (!companions) throw denial();
      const data = { id, centerId: input.centerId, templateVersionId: input.templateVersionId, commissionerId: subject.userId, requestKey: input.requestKey,
        audience: input.audience, listingId: input.listingId ?? null, synthetic: true, status: "requested", version: 0, epoch: this.runtime.id(),
        physicalAuthorization: null, publicationAuthorization: null, observedVehicle: null, listingIdentityDigest: null, associationValidatedAt: null,
        identityEvidenceGeneration: 0, createdAt: companions.at, updatedAt: companions.at, erasedAt: null };
      const plan = await diagnosticPlannedRow(tx, { table: "inspection_orders", key: { id } }, data, true);
      return diagnosticMutation(tx, { ...this.command(subject, "intake_create", [plan], []),
        intent: { receptionQualificationIds: selected.map(item => item.id), ...(campaign ? { campaignAdmission: true as const } : {}) } }, async () => {
        const scope = await this.authority.admitted(tx, subject, { centerId: input.centerId }, "DIAGNOSTIC_SERVICE_UNAVAILABLE");
        const template = await tx.diagnosticTemplateVersion.findUnique({ where: { id: input.templateVersionId } });
        if (!template || template.centerId !== input.centerId || !template.synthetic) throw new DiagnosticRuleError("DIAGNOSTIC_TEMPLATE_UNAVAILABLE");
        if (scope && !await this.authority.owned(tx, scope, subject, { centerId: input.centerId, templateVersionId: input.templateVersionId })) throw denial();
        const replay = await tx.inspectionOrder.findUnique({ where: { commissionerId_requestKey: { commissionerId: subject.userId, requestKey: input.requestKey } } });
        if (replay) throw new DiagnosticRuleError("DIAGNOSTIC_IDEMPOTENCY_CONFLICT");
        if (input.listingId) {
          const listing = await tx.listing.findUnique({ where: { id: input.listingId } });
          if (!listing || listing.deletedAt || !["active", "sold", "paused"].includes(listing.status)) throw denial();
          if (input.audience === "listing_public") {
            if (listing.businessId) await this.business.authorize({ ...subject, businessId: listing.businessId }, tx);
            else if (listing.sellerId !== subject.userId) throw denial();
          }
        }
        for (const peer of selected) {
          const qualification = await tx.diagnosticCenterAssignment.findUnique({ where: { id: peer.id } });
          const user = await tx.user.findUnique({ where: { id: peer.userId }, include: { staffGrants: { where: { capability: "diagnostics.reception", revokedAt: null } } } });
          if (!qualification || qualification.centerId !== input.centerId || qualification.userId !== peer.userId || qualification.capability !== "diagnostics.reception" || qualification.revokedAt || !qualification.qualifiedUntil || qualification.qualifiedUntil <= this.runtime.now() || !user || user.suspendedAt || user.deletionScheduledAt || !user.staffGrants.length) throw denial();
          if (scope ? !await this.authority.owned(tx, scope, subject, { centerId: input.centerId, peerId: peer.userId }) : !this.runtime.syntheticAllowed({ userId: peer.userId, sessionId: "" })) throw denial();
        }
        const row = await tx.inspectionOrder.create({ data: { ...data, physicalAuthorization: Prisma.DbNull, publicationAuthorization: Prisma.DbNull, observedVehicle: Prisma.DbNull,
          assignments: { create: companions.assignments.map(item => ({ ...item, assignedAt: companions.at })) } } });
        await tx.diagnosticAudit.create({ data: { id: companions.auditId, centerId: input.centerId, orderId: id, actorId: subject.userId, action: "INTAKE_CREATED", details: { audience: input.audience, templateVersionId: input.templateVersionId, synthetic: true }, createdAt: companions.at } });
        return this.dto(tx, row, false);
      });
    });
  }
  private staffScope(tx: Tx, subject: DiagnosticSubject, id: string) { return this.authority.staffed(tx, subject, id); }
  async assigned(subject: DiagnosticSubject): Promise<DiagnosticSchemas.DiagnosticOrder[]> {
    return this.db.$transaction(async tx => {
      const rows = await tx.inspectionOrder.findMany({ where: { synthetic: true, erasedAt: null, assignments: { some: { userId: subject.userId, revokedAt: null } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50 });
      await diagnosticReadPrefix(tx, diagnosticRoots(subject, rows.map(row => row.id)));
      await this.current(tx, subject);
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
      const campaign = await this.authority.admissionScope(tx, subject);
      const id = this.runtime.id();
      const [companion] = await tx.$queryRaw<{ auditId: string; at: Date }[]>`SELECT public.diagnostic_intake_uuid(${'diagnostic-source:template_publish:' + id}) AS "auditId",transaction_timestamp()::timestamp(3) AS at`;
      if (!companion) throw denial();
      const data = { id, centerId, version: input.expectedVersion + 1, definition: json(input.definition), synthetic: true, publishedById: subject.userId, publishedAt: companion.at };
      const plan = await diagnosticPlannedRow(tx, { table: "diagnostic_template_versions", key: { id } }, data, true);
      return diagnosticMutation(tx, { ...this.command(subject, "template_publish", [plan], []), ...(campaign ? { intent: { campaignAdmission: true as const } } : {}) }, async () => {
        await this.authority.admitted(tx, subject, { centerId }); await this.centerAuthority(tx, subject, centerId, "diagnostics.templates");
        const latest = await tx.diagnosticTemplateVersion.findFirst({ where: { centerId }, orderBy: { version: "desc" } });
        if ((latest?.version ?? 0) !== input.expectedVersion) throw new DiagnosticRuleError("DIAGNOSTIC_STALE_VERSION");
        const row = await tx.diagnosticTemplateVersion.create({ data });
        await tx.diagnosticAudit.create({ data: { id: companion.auditId, centerId, actorId: subject.userId, action: "TEMPLATE_PUBLISHED", details: { templateVersionId: id, version: data.version, synthetic: true }, createdAt: companion.at } });
        return this.template(row);
      });
    });
  }
  async authorize(subject: DiagnosticSubject, id: string, input: DiagnosticSchemas.DiagnosticAuthorization): Promise<DiagnosticSchemas.DiagnosticOrder> {
    return this.db.$transaction(async tx => {
      const discovered = await tx.inspectionOrder.findUnique({ where: { id } }); if (!discovered) throw denial();
      this.version(discovered, input.expectedVersion);
      const state = this.order(discovered).authorize(input.kind, { authorityReference: input.authorityReference, recordedBy: subject.userId, recordedAt: this.runtime.now().toISOString() }).state;
      const data = { version: input.expectedVersion + 1, updatedAt: this.runtime.now(), ...(input.kind === "physical" ? { physicalAuthorization: json(state.physicalAuthorization) } : { publicationAuthorization: json(state.publicationAuthorization) }) };
      const plan = await diagnosticPlannedRow(tx, { table: "inspection_orders", key: { id } }, data);
      const audit = await this.plannedAudit(tx, subject, discovered, input.kind === "physical" ? "PHYSICAL_AUTHORIZATION_RECORDED" : "PUBLICATION_CONSENT_RECORDED");
      return diagnosticMutation(tx, this.command(subject, "order_change", [plan, audit.plan], [id]), async () => {
        const { row } = await this.scope(tx, subject, id, "diagnostics.reception"); this.version(row, input.expectedVersion);
        const next = await tx.inspectionOrder.update({ where: { id }, data });
        await tx.diagnosticAudit.create({ data: audit.data }); return this.dto(tx, next, true);
      });
    });
  }
  private order(row: Order): InspectionOrder {
    return new InspectionOrder({ id: row.id, centerId: row.centerId, templateVersionId: row.templateVersionId, commissionerId: row.commissionerId ?? "",
      audience: DiagnosticSchemas.DiagnosticAudienceSchema.parse(row.audience), listingId: row.listingId, status: DiagnosticSchemas.DiagnosticAppointmentStateSchema.parse(row.status),
      physicalAuthorization: row.physicalAuthorization as InspectionOrderState["physicalAuthorization"], publicationAuthorization: row.publicationAuthorization as InspectionOrderState["publicationAuthorization"], events: [] });
  }
  async appointment(subject: DiagnosticSubject, id: string, input: DiagnosticSchemas.DiagnosticAppointmentChange): Promise<DiagnosticSchemas.DiagnosticOrder> {
    return this.db.$transaction(async tx => {
      const row = await tx.inspectionOrder.findUnique({ where: { id } }); if (!row) throw denial();
      this.version(row, input.expectedVersion);
      const state = this.order(row).transition(input.state, subject.userId, this.runtime.now()).state;
      // A real no-op remains a read and still proves the current caller's authority.
      if (state.status === row.status) {
        const scoped = await this.scope(tx, subject, id, input.state === "cancelled" ? undefined : "diagnostics.reception");
        this.version(scoped.row, input.expectedVersion); return this.dto(tx, scoped.row, scoped.staff);
      }
      const data = { status: state.status, version: input.expectedVersion + 1, updatedAt: this.runtime.now() };
      const plan = await diagnosticPlannedRow(tx, { table: "inspection_orders", key: { id } }, data);
      const audit = await this.plannedAudit(tx, subject, row, "APPOINTMENT_CHANGED", { state: state.status });
      return diagnosticMutation(tx, this.command(subject, "order_change", [plan, audit.plan], [id]), async () => {
        const scoped = await this.scope(tx, subject, id, input.state === "cancelled" ? undefined : "diagnostics.reception");
        this.version(scoped.row, input.expectedVersion);
        const next = await tx.inspectionOrder.update({ where: { id }, data });
        await tx.diagnosticAudit.create({ data: audit.data }); return this.dto(tx, next, scoped.staff);
      });
    });
  }
  async assign(subject: DiagnosticSubject, id: string, input: DiagnosticSchemas.DiagnosticAssignmentChange): Promise<DiagnosticSchemas.DiagnosticOrder> {
    return this.db.$transaction(async tx => {
      const discovered = await tx.inspectionOrder.findUnique({ where: { id } }); if (!discovered) throw denial();
      this.version(discovered, input.expectedVersion);
      const existing = await tx.diagnosticOrderAssignment.findUnique({ where: { orderId_userId_capability: { orderId: id, userId: input.userId, capability: input.capability } } });
      const data = { id: existing?.id ?? this.runtime.id(), orderId: id, userId: input.userId, capability: input.capability, assignedAt: existing?.assignedAt ?? this.runtime.now(), revokedAt: input.active ? null : this.runtime.now() };
      const assignmentPlan = await diagnosticPlannedRow(tx, { table: "diagnostic_order_assignments", key: { id: data.id } }, data, !existing);
      const orderData = { version: input.expectedVersion + 1, updatedAt: this.runtime.now() };
      const plan = await diagnosticPlannedRow(tx, { table: "inspection_orders", key: { id } }, orderData);
      const audit = await this.plannedAudit(tx, subject, discovered, "ORDER_ASSIGNMENT_CHANGED", { targetUserId: input.userId, capability: input.capability, active: input.active });
      return diagnosticMutation(tx, this.command(subject, "order_change", [plan, assignmentPlan, audit.plan], [id]), async () => {
      const { row } = await this.scope(tx, subject, id, "diagnostics.reception"); this.version(row, input.expectedVersion);
      const target = await tx.user.findUnique({ where: { id: input.userId }, select: { suspendedAt: true, deletionScheduledAt: true, staffGrants: { where: { capability: input.capability, revokedAt: null } } } });
      const assignment = await tx.diagnosticCenterAssignment.findUnique({ where: { centerId_userId_capability: { centerId: row.centerId, userId: input.userId, capability: input.capability } } });
      if (input.active && (!target || target.suspendedAt || target.deletionScheduledAt || !target.staffGrants.length || !assignment || assignment.revokedAt || !assignment.qualifiedUntil || assignment.qualifiedUntil <= this.runtime.now() || !this.runtime.syntheticAllowed({ userId: input.userId, sessionId: "" }))) throw denial();
      if (!input.active && input.userId === subject.userId && input.capability === "diagnostics.reception") throw new DiagnosticRuleError("DIAGNOSTIC_HANDOVER_REQUIRED");
      await tx.diagnosticOrderAssignment.upsert({ where: { orderId_userId_capability: { orderId: id, userId: input.userId, capability: input.capability } }, create: data, update: { revokedAt: data.revokedAt } });
      const next = await tx.inspectionOrder.update({ where: { id }, data: orderData });
      await tx.diagnosticAudit.create({ data: audit.data }); return this.dto(tx, next, true);
      });
    });
  }
  async grantOwnership(subject: DiagnosticSubject, id: string, input: DiagnosticSchemas.DiagnosticOwnershipGrant): Promise<{ id: string }> {
    return this.db.$transaction(async tx => {
      const row = await tx.inspectionOrder.findUnique({ where: { id } }); if (!row) throw denial();
      const now = this.runtime.now(), grantId = this.runtime.id();
      const data = await DiagnosticOwnershipGrants.data(tx, row, subject, input, now, grantId);
      const plan = await diagnosticPlannedRow(tx, { table: "diagnostic_ownership_grants", key: { id: grantId } }, data, true);
      return diagnosticMutation(tx, this.command(subject, "ownership_grant", [plan], [id]), async () => {
        await this.publicBindings.lock(tx, [id], [subject.userId]); await this.current(tx, subject);
        const current = await tx.inspectionOrder.findUnique({ where: { id } }); if (!current) throw denial();
        return DiagnosticOwnershipGrants.create(tx, current, subject, input, now, grantId);
      });
    }).catch(DiagnosticOwnershipGrants.refuse);
  }
  async revokeOwnership(subject: DiagnosticSubject, id: string, grantId: string): Promise<{ id: string }> {
    return this.db.$transaction(async tx => {
      const now = this.runtime.now();
      const grant = await tx.diagnosticOwnershipGrant.findUnique({ where: { id: grantId } });
      if (!grant || grant.orderId !== id || grant.state !== "available" || grant.grantorId !== subject.userId) throw denial();
      const plan = await diagnosticPlannedRow(tx, { table: "diagnostic_ownership_grants", key: { id: grantId } }, {
        state: "erased", listingId: null, identityDigest: null, sellerId: null, commissionerId: null, businessId: null, membershipId: null,
        grantorId: null, grantorMembershipId: null, sessionId: null, rights: null, rightsUntil: null, declaredAt: null, erasedAt: now,
      });
      return diagnosticMutation(tx, this.command(subject, "ownership_revoke", [plan], [id], now), async () => {
        await this.current(tx, subject);
        const current = await tx.diagnosticOwnershipGrant.findUnique({ where: { id: grantId } });
        if (!current || current.orderId !== id || current.state !== "available" || current.grantorId !== subject.userId) throw denial();
        await tx.$queryRaw`SELECT diagnostic_dispose_ownership_scope(NULL::text,${now}::timestamp,${grantId}::text)`;
        return { id: grantId };
      });
    }).catch(DiagnosticOwnershipGrants.refuse);
  }
  async observeVehicle(subject: DiagnosticSubject, id: string, input: DiagnosticSchemas.DiagnosticVehicleObservationRequest): Promise<DiagnosticSchemas.DiagnosticOrder> {
    const classification = DiagnosticOwnershipCapture.classification(input.ownershipClassification, this.runtime.now());
    return this.db.$transaction(async tx => {
      const row = await tx.inspectionOrder.findUnique({ where: { id } }); if (!row) throw denial();
      if (input.ownershipGrantId) await DiagnosticOwnershipGrants.compatible(tx, row, input.ownershipGrantId, this.runtime.now());
      const { expectedVersion } = input;
      const observed = DiagnosticSchemas.DiagnosticObservedVehicleSchema.innerType().omit({ expectedVersion: true }).parse({
        observedAt: input.observedAt, mileageKm: input.mileageKm, method: input.method, vin: input.vin, manualReference: input.manualReference,
      });
      this.version(row, expectedVersion);
      if (row.status !== "arrived" || new Date(input.observedAt) > this.runtime.now()) throw new DiagnosticRuleError("DIAGNOSTIC_OBSERVATION_DENIED");
      let identityDigest: string | null = null;
      if (row.audience === "listing_public") {
        if (!row.listingId || !row.publicationAuthorization || !row.physicalAuthorization) throw new DiagnosticRuleError("PUBLICATION_AUTHORIZATION_REQUIRED");
        const listing = await tx.listing.findUnique({ where: { id: row.listingId } });
        if (!listing || listing.deletedAt) throw denial();
        if (input.method === "vin" && (!listing.vin || listing.vin.trim().toUpperCase() !== input.vin?.trim().toUpperCase())) throw new DiagnosticRuleError("DIAGNOSTIC_VEHICLE_MISMATCH");
        identityDigest = diagnosticListingDigest(listing);
      }
      const recordedAt = this.runtime.now(), rawId = this.runtime.id();
      const data = { observedVehicle: json(observed), listingIdentityDigest: identityDigest, associationValidatedAt: row.audience === "listing_public" ? recordedAt : null, version: expectedVersion + 1, updatedAt: recordedAt };
      const raw = { id: rawId, orderId: id, orderVersion: data.version, observation: json(observed),
        observationHash: diagnosticObservationHash(id, data.version, observed), recordedById: subject.userId, recordedAt };
      const component = await DiagnosticOwnershipCapture.data(tx, row, rawId, data.version, subject.userId, recordedAt, classification, input.ownershipGrantId);
      const plans = [
        await diagnosticPlannedRow(tx, { table: "inspection_orders", key: { id } }, data),
        await diagnosticPlannedRow(tx, { table: "diagnostic_identity_records", key: { id: rawId } }, raw, true),
        await diagnosticPlannedRow(tx, { table: "diagnostic_ownership_components", key: { identityRecordId: rawId } }, component, true),
      ];
      const audit = await this.plannedAudit(tx, subject, row, "VEHICLE_OBSERVED", { method: input.method });
      return diagnosticMutation(tx, this.command(subject, "observation_append", [...plans, audit.plan], [id]), async receipt => {
        await this.publicBindings.lock(tx, [id], [subject.userId]);
        const current = (await this.scope(tx, subject, id, "diagnostics.technician")).row;
        this.version(current, expectedVersion);
        if (current.status !== "arrived") throw new DiagnosticRuleError("DIAGNOSTIC_OBSERVATION_DENIED");
        if (input.ownershipGrantId) await DiagnosticOwnershipGrants.compatible(tx, current, input.ownershipGrantId, this.runtime.now());
        const next = await tx.inspectionOrder.update({ where: { id }, data });
        await tx.diagnosticIdentityRecord.create({ data: raw });
        await DiagnosticOwnershipCapture.append(tx, current, rawId, data.version, subject.userId, recordedAt, classification, input.ownershipGrantId);
        await sealDiagnosticFirstObservation(tx, receipt, id, rawId);
        await tx.diagnosticAudit.create({ data: audit.data }); return this.dto(tx, next, true);
      });
    }).catch(DiagnosticOwnershipGrants.refuse);
  }
  /** Single-visit history. Commissioner, marketplace admin and center staff not assigned here receive the uniform denial. */
  async identityRecords(subject: DiagnosticSubject, id: string): Promise<DiagnosticSchemas.DiagnosticIdentityRecord[]> {
    return this.db.$transaction(async tx => {
      const scope = await this.staffScope(tx, subject, id);
      if (!scope.staff) throw denial();
      const rows = await tx.diagnosticIdentityRecord.findMany({ where: { orderId: id, erasedAt: null }, orderBy: { orderVersion: "asc" } });
      return rows.map(row => DiagnosticSchemas.DiagnosticIdentityRecordSchema.parse({ id: row.id, orderId: row.orderId, orderVersion: row.orderVersion,
        observationHash: row.observationHash, observation: row.observation, recordedBy: row.recordedById, recordedAt: row.recordedAt.toISOString() }));
    });
  }
}
