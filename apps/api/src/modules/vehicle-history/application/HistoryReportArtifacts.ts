import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Inject, Injectable } from "@nestjs/common";
import { HistoryReportArtifactSchemas as R, type HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { IDENTITY_READ_PORT, IDENTITY_CHECK_PORT, type IdentityReadPort, type IdentityCheckPort } from "../../identity/identity.public";
import { coversHistoryFormat, fulfilmentAgreement } from "../domain/HistoryFulfilment";
import { bookedPayment, historyAgreement, type HistoryOrderStore, type StoredHistoryOrder } from "../domain/HistoryOrder";
import { historyDeliveryDeadline, settleHistoryRecovery } from "../domain/HistoryRecovery";
import { normalizeHistoryVin } from "../domain/HistoryOffer";
import {
  HISTORY_REPORT_ORIGINALS, HISTORY_REPORT_STORAGE, historyReportDigest,
  type ArchivedHistoryReport, type HistoryReportOriginals, type HistoryReportStorage, type HistoryReportStore, type StagedHistoryReport,
} from "../domain/HistoryReportArtifact";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";

type Obtained = Extract<H.HistoryFulfilmentIntent, { status: "obtained" }>;
function view(row: StagedHistoryReport | null, operator = true): R.HistoryReportView {
  const restore = operator && row?.artifact.source === "archive" && !row.archiveSourceId && row.artifact.format !== "link" && row.sha256
    ? { canRestorePdf: true as const } : {};
  if (row?.deliveredAt) return { status: "delivered", artifact: row.artifact, deliveredAt: row.deliveredAt.toISOString(), ...restore };
  if (!row?.validatedAt) return { status: row ? "staged" : "empty" };
  return { status: "validated", artifact: row.artifact, validatedAt: row.validatedAt.toISOString(), ...restore };
}

@Injectable()
export class HistoryReportArtifacts {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly checks: IdentityCheckPort,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock,
    @Inject(HISTORY_REPORT_STORAGE) private readonly storage: HistoryReportStorage,
    @Inject(HISTORY_REPORT_ORIGINALS) private readonly originals: HistoryReportOriginals) {}

  archive(actor: HistoryMessageActor, id: string, input: string) {
    if (!actor.operator) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    const vin = normalizeHistoryVin(input);
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) throw new HistoryRequestError("HISTORY_REPORT_INVALID");
    return this.access.run(actor, id, async (_owner, _sender, _object, _participant, _waiting, offer, orders) => {
      const order = await orders.read();
      const current = order ? order.acceptedOffer.vin : (await offer.read()).vin;
      if (current !== vin) return { items: [] };
      const pinned = order?.acceptedOffer.preflight.archiveFormat;
      const selected = pinned ? await orders.reportArtifacts.selectedArchiveId() : null;
      return { items: pinned && !selected ? [] : await orders.reportArtifacts.archive(vin, selected ?? undefined) };
    });
  }

  previous(claims: HistoryMessageActor["claims"], id: string, input: string) {
    const vin = normalizeHistoryVin(input);
    return this.access.run({ claims, operator: false }, id, (owner, _sender, _object, _participant, _waiting, _offer, orders) =>
      /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? orders.reportArtifacts.previousPurchase(owner, vin) : Promise.resolve({ previous: null }));
  }

  read(actor: HistoryMessageActor, id: string, target: R.HistoryReportTarget) {
    return this.current(actor, id, target, async (store) => view(await store.find(target.intentVersion)));
  }

  content(actor: HistoryMessageActor, id: string, target: R.HistoryReportTarget) {
    return this.current(actor, id, target, async (store) => {
      const row = await store.find(target.intentVersion);
      if (!row) throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
      return this.pdf(id, row, await this.requireArchiveSource(store, row));
    });
  }

  deliver(actor: HistoryMessageActor, id: string, target: R.DeliverHistoryReport) {
    return this.current(actor, id, target, async (store, intent, sender, order, orders) => {
      const row = await store.find(target.intentVersion);
      if (!row?.validatedAt || row.artifact.id !== target.artifactId || row.orderId !== order.id
        || row.intentId !== intent.id || row.acceptedRevision !== target.acceptedRevision
        || row.artifact.format !== intent.accepted.format || row.artifact.source !== intent.source
        || row.artifact.report.vin !== intent.accepted.vin || row.artifact.report.provider !== intent.accepted.provider
        || row.artifact.report.originalReportDate !== intent.report.originalReportDate) {
        throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
      }
      if (row.deliveredAt) return view(row);
      const confirmedAt = bookedPayment(order, await orders.paymentChecks())?.confirmedAt;
      if (!confirmedAt) throw new HistoryRequestError("HISTORY_ORDER_STALE");
      const deadline = await this.requireDeliveryWindow(orders, order, intent, this.clock.now());
      const source = await this.requireArchiveSource(store, row);
      if (row.artifact.format !== "link") await this.pdf(id, row, source);
      let linkEvidenceSha256 = null;
      if (row.artifact.format !== "pdf") {
        if (!row.link) throw new HistoryRequestError("HISTORY_REPORT_MISMATCH");
        linkEvidenceSha256 = await this.verifyLink(row.link, row.artifact.report, source?.archiveLinkEvidenceSha256);
      }
      return orders.serialize(async () => {
        const earlier = await orders.hasEarlierPaidWork(confirmedAt, this.clock.now(), "delivery");
        const deliveredAt = this.clock.now();
        if (deliveredAt >= deadline) {
          await settleHistoryRecovery(orders, order, deliveredAt, false, intent);
          throw new HistoryRequestError("HISTORY_ORDER_STALE");
        }
        if (earlier) throw new HistoryRequestError("HISTORY_FULFILMENT_FIFO");
        await store.deliver(target, sender, deliveredAt, linkEvidenceSha256);
        return view({ ...row, deliveredAt });
      });
    }, "deliver");
  }

  purchaser(claims: HistoryMessageActor["claims"], id: string, asset?: { id: string; kind: "pdf" | "link" }) {
    return this.access.run({ claims, operator: false }, id, async (_owner, _sender, _object, _participant, _waiting, _offer, orders) => {
      const order = await orders.read();
      const row = order && await orders.reportArtifacts.delivered(order.id);
      if (!asset) return view(row, false);
      if (!row?.deliveredAt || row.artifact.id !== asset.id || !coversHistoryFormat(asset.kind, row.artifact.format)) {
        throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
      }
      const source = await this.requireArchiveSource(orders.reportArtifacts, row, asset.kind);
      if (asset.kind === "pdf") return this.pdf(id, row, source);
      if (!row.link) throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
      if (source) await this.verifyLink(row.link, row.artifact.report, source.archiveLinkEvidenceSha256);
      return R.HistoryReportLinkSchema.parse({ address: row.link });
    });
  }

  private async pdf(id: string, row: StagedHistoryReport, source: ArchivedHistoryReport | null) {
    if (!row.validatedAt || row.artifact.format === "link" || !row.sha256) {
      throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
    }
    const artifact = source?.artifact ?? row.artifact;
    if (artifact.format === "link") throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
    return { dataBase64: (await this.storage.read(source?.requestId ?? id, artifact, row.sha256)).toString("base64") };
  }

  async validate(actor: HistoryMessageActor, id: string, input: R.ValidateHistoryReport) {
    if (input.archiveId) return this.associate(actor, id, input, input.archiveId);
    const bytes = input.pdf ? Buffer.from(input.pdf.dataBase64, "base64") : null;
    const sha256 = bytes ? historyReportDigest(bytes) : null;
    const link = input.link ?? null;
    const staged = await this.current(actor, id, input, async (store, intent, sender, order, orders) => {
      const existing = await store.find(intent.version);
      if (intent.source === "archive") {
        if (!bytes && !link) throw new HistoryRequestError("HISTORY_REPORT_MISSING");
        if (!existing || existing.archiveSourceId || existing.artifact.source !== "archive") {
          throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
        }
      }
      if (existing) {
        const filename = existing.artifact.format === "link" ? undefined : existing.artifact.pdf.filename;
        const restoringPdf = existing.validatedAt && bytes && existing.artifact.format !== "link" && link === null;
        if (existing.sha256 !== sha256 || filename !== input.pdf?.filename || (!restoringPdf && existing.link !== link)) {
          throw new HistoryRequestError(restoringPdf ? "HISTORY_REPORT_MISMATCH" : "HISTORY_REPORT_CONFLICT");
        }
        if (!existing.validatedAt && existing.link) await this.verifyLink(existing.link, existing.artifact.report);
        return existing;
      }
      const { format } = intent.accepted;
      const needsPdf = format !== "link", needsLink = format !== "pdf";
      if (needsPdf && !bytes || needsLink && !link) throw new HistoryRequestError("HISTORY_REPORT_MISSING");
      if (needsPdf !== Boolean(bytes) || needsLink !== Boolean(link)) throw new HistoryRequestError("HISTORY_REPORT_MISMATCH");
      const document = bytes ? await this.originals.readPdf(bytes) : null;
      const linked = link ? (await this.originals.verifyLink(link)).facts : null;
      const facts = document?.facts ?? linked;
      if (document?.facts.permittedUse === false || linked?.permittedUse === false) throw new HistoryRequestError("HISTORY_REPORT_RIGHTS");
      if (!facts || (linked && document && !isDeepStrictEqual(document.facts, linked))
        || facts.vin !== intent.accepted.vin || facts.provider !== intent.accepted.provider
        || facts.originalReportDate !== intent.report.originalReportDate) throw new HistoryRequestError("HISTORY_REPORT_MISMATCH");
      const artifact = R.HistoryReportArtifactSchema.parse({
        id: randomUUID(), source: intent.source, format, report: facts,
        ...(input.pdf && document && bytes ? { pdf: { filename: input.pdf.filename, pages: document.pages, sizeBytes: bytes.length } } : {}),
      });
      const original = { artifact, sha256, link };
      await this.requireDeliveryWindow(orders, order, intent, this.clock.now());
      await store.stage(input, original, sender);
      return { ...original, orderId: input.orderId, intentId: input.intentId, acceptedRevision: input.acceptedRevision,
        validatedAt: null, deliveredAt: null };
    }, "validate");
    if (staged.validatedAt && !bytes) return view(staged);

    return this.current(actor, id, input, async (store, intent, sender, order, orders) => {
      const row = await store.find(intent.version);
      if (row?.artifact.id !== staged.artifact.id) throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
      if (row.artifact.format !== "link" && bytes && sha256) await this.storage.put(id, row.artifact, sha256, bytes);
      if (row.validatedAt) return view(row);
      const validatedAt = this.clock.now();
      await this.requireDeliveryWindow(orders, order, intent, validatedAt);
      await store.validate(intent.version, sender, input.expectedAssignmentVersion, validatedAt);
      return view({ ...row, validatedAt });
    }, "validate");
  }

  private async verifyLink(address: string, facts: R.HistoryReportFacts, expectedEvidenceSha256?: string | null) {
    const linked = await this.originals.verifyLink(address);
    if (!isDeepStrictEqual(linked.facts, facts) ||
      expectedEvidenceSha256 !== undefined && linked.evidenceSha256 !== expectedEvidenceSha256) {
      throw new HistoryRequestError("HISTORY_REPORT_MISMATCH");
    }
    return linked.evidenceSha256;
  }

  private async requireArchiveSource(store: HistoryReportStore, row: StagedHistoryReport, purchasedAsset?: "pdf" | "link") {
    if (!row.archiveSourceId) return null;
    const source = await store.archiveOriginal(row.archiveSourceId, row.artifact.report.vin, purchasedAsset);
    if (!source) throw new HistoryRequestError("HISTORY_REPORT_RIGHTS");
    if (!isDeepStrictEqual(source.artifact.report, row.artifact.report)
      || !coversHistoryFormat(row.artifact.format, source.artifact.format)
      || row.sha256 !== null && row.sha256 !== source.sha256
      || row.link !== null && row.link !== source.link) throw new HistoryRequestError("HISTORY_REPORT_MISMATCH");
    return source;
  }

  private associate(actor: HistoryMessageActor, id: string, input: R.HistoryReportTarget, archiveId: string) {
    return this.current(actor, id, input, async (store, intent, sender, order, orders) => {
      if (intent.source !== "archive") throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
      if (!bookedPayment(order, await orders.paymentChecks())?.confirmedAt) throw new HistoryRequestError("HISTORY_ORDER_STALE");
      const { vin, provider, format, originalReportDate } = intent.accepted;
      if (order.acceptedOffer.preflight.archiveFormat && await store.selectedArchiveId() !== archiveId) {
        throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
      }
      const source = await store.archiveOriginal(archiveId, vin);
      if (!source) throw new HistoryRequestError("HISTORY_REPORT_RIGHTS");
      const { artifact: original } = source;
      if (original.report.provider !== provider || !originalReportDate
        || original.report.originalReportDate !== originalReportDate
        || original.report.originalReportDate !== intent.report.originalReportDate) throw new HistoryRequestError("HISTORY_REPORT_MISMATCH");
      if (!coversHistoryFormat(format, original.format)) throw new HistoryRequestError("HISTORY_REPORT_MISSING");
      const existing = await store.find(intent.version);
      if (existing && existing.archiveSourceId !== archiveId) throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
      const sha256 = format === "link" ? null : source.sha256;
      const link = format === "pdf" ? null : source.link;
      if (format !== "link") {
        if (original.format === "link" || !sha256) throw new HistoryRequestError("HISTORY_REPORT_MISSING");
        try { await this.storage.read(source.requestId, original, sha256); }
        catch { throw new HistoryRequestError("HISTORY_REPORT_UNAVAILABLE"); }
      }
      if (format !== "pdf") {
        if (!link) throw new HistoryRequestError("HISTORY_REPORT_MISSING");
        await this.verifyLink(link, original.report, source.archiveLinkEvidenceSha256);
      }
      if (existing) return view(existing);
      const validatedAt = this.clock.now();
      await this.requireDeliveryWindow(orders, order, intent, validatedAt);
      const artifact = R.HistoryReportArtifactSchema.parse({
        id: randomUUID(), source: "archive", format, report: original.report,
        ...(format !== "link" && original.format !== "link"
          ? { pdf: { filename: "vehicle-history.pdf", pages: original.pdf.pages, sizeBytes: original.pdf.sizeBytes } } : {}),
      });
      const report = { artifact, sha256, link, archiveSourceId: archiveId };
      await store.stage(input, report, sender);
      await store.validate(intent.version, sender, input.expectedAssignmentVersion, validatedAt);
      return view({ ...report, orderId: order.id, intentId: intent.id, acceptedRevision: input.acceptedRevision, validatedAt, deliveredAt: null });
    }, "validate");
  }

  private async requireDeliveryWindow(orders: HistoryOrderStore, order: StoredHistoryOrder, intent: Obtained, now: Date) {
    const recovery = await settleHistoryRecovery(orders, order, now, false, intent);
    const deadline = historyDeliveryDeadline(order, recovery);
    if (!deadline || now >= deadline) throw new HistoryRequestError("HISTORY_ORDER_STALE");
    return deadline;
  }

  private async current<T>(actor: HistoryMessageActor, id: string, target: R.HistoryReportTarget,
    work: (store: HistoryReportStore, intent: Obtained, actorId: string, order: StoredHistoryOrder, orders: HistoryOrderStore) => Promise<T>,
    mutation?: "validate" | "deliver") {
    if (!actor.operator) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    const result = await this.access.run(actor, id, async (ownerId, actorId, _object, _participant, _waiting, _offer, orders) => {
      const [owner, deleting, order, intent] = await Promise.all([
        this.identity.findUserById(ownerId), this.checks.isDeletionScheduled(ownerId), orders.read(), orders.fulfilment(),
      ]);
      if (!owner || owner.deleted || owner.suspendedAt || deleting) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
      const agreement = order && historyAgreement(order);
      const recovery = await orders.recovery();
      if (!order || order.id !== target.orderId || !agreement || agreement.pending
        || agreement.acceptedRevision !== target.acceptedRevision || agreement.handoff?.revision !== target.acceptedRevision
        || intent?.status !== "obtained" || intent.id !== target.intentId || intent.version !== target.intentVersion
        || !isDeepStrictEqual(intent.accepted, fulfilmentAgreement(order,
          recovery?.agreedDeadline ? intent.accepted.provider : order.reservedProvider ?? intent.accepted.provider,
          recovery?.agreedFormat ?? undefined))) {
        throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
      }
      if (!mutation) return work(orders.reportArtifacts, intent, actorId, order, orders);
      const delivered = !!await orders.reportArtifacts.delivered(order.id);
      try {
        if (mutation === "validate" && !delivered) await this.requireDeliveryWindow(orders, order, intent, this.clock.now());
        return await work(orders.reportArtifacts, intent, actorId, order, orders);
      } catch (error) {
        if (!(error instanceof HistoryRequestError)) throw error;
        if (!delivered && ["HISTORY_REPORT_MISSING", "HISTORY_REPORT_MISMATCH", "HISTORY_REPORT_PDF",
          "HISTORY_REPORT_LINK", "HISTORY_REPORT_RIGHTS", "HISTORY_REPORT_UNAVAILABLE"].includes(error.code)) {
          await settleHistoryRecovery(orders, order, this.clock.now(), false, intent, "file_delivery");
        }
        return error;
      }
    });
    if (result instanceof HistoryRequestError) throw result;
    return result;
  }
}
