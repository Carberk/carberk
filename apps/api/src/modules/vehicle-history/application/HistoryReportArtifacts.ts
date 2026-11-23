import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Inject, Injectable } from "@nestjs/common";
import { HistoryReportArtifactSchemas as R, type HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { IDENTITY_READ_PORT, IDENTITY_CHECK_PORT, type IdentityReadPort, type IdentityCheckPort } from "../../identity/identity.public";
import { fulfilmentAgreement } from "../domain/HistoryFulfilment";
import { historyAgreement } from "../domain/HistoryOrder";
import {
  HISTORY_REPORT_ORIGINALS, HISTORY_REPORT_STORAGE, historyReportDigest,
  type HistoryReportOriginals, type HistoryReportStorage, type HistoryReportStore, type StagedHistoryReport,
} from "../domain/HistoryReportArtifact";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HISTORY_CLOCK, type HistoryClock } from "../domain/HistoryWaiting";
import { HistoryMessageAccess, type HistoryMessageActor } from "./HistoryMessageAccess";

type Obtained = Extract<H.HistoryFulfilmentIntent, { status: "obtained" }>;
function view(row: StagedHistoryReport | null): R.HistoryReportView {
  if (!row?.validatedAt) return { status: row ? "staged" : "empty" };
  return { status: "validated", artifact: row.artifact, validatedAt: row.validatedAt.toISOString() };
}

@Injectable()
export class HistoryReportArtifacts {
  constructor(@Inject(HistoryMessageAccess) private readonly access: HistoryMessageAccess,
    @Inject(IDENTITY_READ_PORT) private readonly identity: IdentityReadPort,
    @Inject(IDENTITY_CHECK_PORT) private readonly checks: IdentityCheckPort,
    @Inject(HISTORY_CLOCK) private readonly clock: HistoryClock,
    @Inject(HISTORY_REPORT_STORAGE) private readonly storage: HistoryReportStorage,
    @Inject(HISTORY_REPORT_ORIGINALS) private readonly originals: HistoryReportOriginals) {}

  read(actor: HistoryMessageActor, id: string, target: R.HistoryReportTarget) {
    return this.current(actor, id, target, async (store) => view(await store.find(target.intentVersion)));
  }

  content(actor: HistoryMessageActor, id: string, target: R.HistoryReportTarget) {
    return this.current(actor, id, target, async (store) => {
      const row = await store.find(target.intentVersion);
      if (!row?.validatedAt || row.artifact.format === "link" || !row.sha256) throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
      return { dataBase64: (await this.storage.read(id, row.artifact, row.sha256)).toString("base64") };
    });
  }

  async validate(actor: HistoryMessageActor, id: string, input: R.ValidateHistoryReport) {
    const bytes = input.pdf ? Buffer.from(input.pdf.dataBase64, "base64") : null;
    const sha256 = bytes ? historyReportDigest(bytes) : null;
    const link = input.link ?? null;
    const staged = await this.current(actor, id, input, async (store, intent, sender) => {
      const existing = await store.find(intent.version);
      if (existing) {
        const filename = existing.artifact.format === "link" ? undefined : existing.artifact.pdf.filename;
        if (existing.sha256 !== sha256 || existing.link !== link || filename !== input.pdf?.filename) {
          throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
        }
        if (!existing.validatedAt && existing.link && !isDeepStrictEqual(await this.originals.verifyLink(existing.link), existing.artifact.report)) {
          throw new HistoryRequestError("HISTORY_REPORT_MISMATCH");
        }
        return existing;
      }
      const { format } = intent.accepted;
      const needsPdf = format !== "link", needsLink = format !== "pdf";
      if (needsPdf && !bytes || needsLink && !link) throw new HistoryRequestError("HISTORY_REPORT_MISSING");
      if (needsPdf !== Boolean(bytes) || needsLink !== Boolean(link)) throw new HistoryRequestError("HISTORY_REPORT_MISMATCH");
      const document = bytes ? await this.originals.readPdf(bytes) : null;
      const linked = link ? await this.originals.verifyLink(link) : null;
      const facts = document?.facts ?? linked;
      if (document?.facts.permittedUse === false || linked?.permittedUse === false) throw new HistoryRequestError("HISTORY_REPORT_RIGHTS");
      if (!facts || (linked && document && !isDeepStrictEqual(document.facts, linked))
        || facts.vin !== intent.accepted.vin || facts.provider !== intent.accepted.provider
        || facts.originalReportDate !== intent.report.originalReportDate) throw new HistoryRequestError("HISTORY_REPORT_MISMATCH");
      const artifact = R.HistoryReportArtifactSchema.parse({
        id: randomUUID(), source: intent.source, format, report: facts,
        ...(input.pdf && document && bytes ? { pdf: { filename: input.pdf.filename, pages: document.pages, sizeBytes: bytes.length } } : {}),
      });
      const row = { artifact, sha256, link, validatedAt: null };
      await store.stage(input, row, sender);
      return row;
    });
    if (staged.validatedAt) return view(staged);

    return this.current(actor, id, input, async (store, intent, sender) => {
      const row = await store.find(intent.version);
      if (row?.artifact.id !== staged.artifact.id) throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
      if (row.validatedAt) return view(row);
      if (row.artifact.format !== "link" && bytes && sha256) await this.storage.put(id, row.artifact, sha256, bytes);
      const validatedAt = this.clock.now();
      await store.validate(intent.version, sender, input.expectedAssignmentVersion, validatedAt);
      return view({ ...row, validatedAt });
    });
  }

  private current<T>(actor: HistoryMessageActor, id: string, target: R.HistoryReportTarget,
    work: (store: HistoryReportStore, intent: Obtained, actorId: string) => Promise<T>) {
    if (!actor.operator) throw new HistoryRequestError("HISTORY_OPERATOR_DENIED");
    return this.access.run(actor, id, async (ownerId, actorId, _object, _participant, _waiting, _offer, orders) => {
      const [owner, deleting, order, intent] = await Promise.all([
        this.identity.findUserById(ownerId), this.checks.isDeletionScheduled(ownerId), orders.read(), orders.fulfilment(),
      ]);
      if (!owner || owner.deleted || owner.suspendedAt || deleting) throw new HistoryRequestError("HISTORY_REQUEST_DENIED");
      const agreement = order && historyAgreement(order);
      if (!order || order.id !== target.orderId || !agreement || agreement.pending
        || agreement.acceptedRevision !== target.acceptedRevision || agreement.handoff?.revision !== target.acceptedRevision
        || intent?.status !== "obtained" || intent.id !== target.intentId || intent.version !== target.intentVersion
        || !isDeepStrictEqual(intent.accepted, fulfilmentAgreement(order, order.reservedProvider ?? intent.accepted.provider))) {
        throw new HistoryRequestError("HISTORY_REPORT_CONFLICT");
      }
      return work(orders.reportArtifacts, intent, actorId);
    });
  }
}
