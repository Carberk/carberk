import type { HistoryOrderSchemas as H } from "@auto-tm/contracts";
import { HistoryRequestError } from "./HistoryRequestError";
import { historyAgreement, type StoredHistoryOrder } from "./HistoryOrder";

export type FulfilmentAgreement = H.HistoryFulfilmentView["accepted"];
type Format = FulfilmentAgreement["format"];
type Intent = H.HistoryFulfilmentIntent;
type Outcome = Extract<H.HistoryFulfilmentMutation, { kind: "record" | "reconcile" }>["outcome"];

export function fulfilmentAgreement(order: StoredHistoryOrder, reservedProvider = order.reservedProvider, format?: Format): FulfilmentAgreement | null {
  const { vin, preflight, proposal } = order.acceptedOffer;
  const provider = preflight.providers.find(({ name }) => name === reservedProvider);
  return provider ? { acceptedRevision: historyAgreement(order).acceptedRevision, vin, provider: provider.name,
    format: format ?? proposal.format, originalReportDate: provider.originalReportDate } : null;
}

export function coversHistoryFormat(format: Format, available: Format) {
  return format === available || available === "both";
}

export function fulfilmentSources(accepted: FulfilmentAgreement): Intent["source"][] {
  const archive = accepted.vin === "DEMA0000000000001" &&
    (accepted.provider === "Carfax" ? accepted.originalReportDate === "2026-10-14"
      : accepted.originalReportDate === "2026-10-15" && coversHistoryFormat(accepted.format, "link"));
  return archive ? ["archive", "new_source"] : ["new_source"];
}

export function checkFulfilmentVersion(intent: Intent | null, expectedVersion: number) {
  if ((intent?.version ?? 0) !== expectedVersion || expectedVersion === 2147483647) {
    throw new HistoryRequestError("HISTORY_FULFILMENT_CONFLICT");
  }
}

export function applyFulfilmentOutcome(intent: Intent, outcome: Outcome, recordedAt: string): Intent {
  const { id, version, attempt, source, funding, accepted } = intent;
  const next = { id, version: version + 1, attempt, source, funding, accepted, recordedAt };
  switch (outcome.kind) {
    case "uncertain": return { ...next, status: "uncertain" };
    case "not_started": return { ...next, status: "retry_ready" };
    case "obtained": {
      if (!outcome.permittedUse) return { ...next, status: "recovery", reason: "rights_unavailable" };
      if (accepted.originalReportDate && accepted.originalReportDate !== outcome.originalReportDate) {
        return { ...next, status: "recovery", reason: "original_date_mismatch" };
      }
      const report = { format: outcome.format, originalReportDate: outcome.originalReportDate, permittedUse: true as const };
      if (!coversHistoryFormat(accepted.format, outcome.format)) return { ...next, status: "recovery", reason: "format_unavailable", report };
      return { ...next, status: "obtained", report };
    }
    default: return { ...next, status: "recovery", reason: outcome.kind };
  }
}
