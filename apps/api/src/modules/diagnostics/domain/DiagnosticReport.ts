import { DiagnosticRuleError } from "./InspectionOrder";

export type ReportAudience = "buyer_private" | "listing_public";
export type FindingAssessment = "normal" | "note" | "fault" | "not_checked" | "not_applicable";
export type ReportStatus = "draft" | "submitted" | "returned" | "finalized" | "withdrawn";
export interface ReportFinding {
  id: string;
  checkId: string;
  assessment: FindingAssessment;
  explanation: string | null;
  evidenceIds: string[];
  kind?: "observed_damage" | "observed_repair" | "source_history" | null;
  source?: string | null;
  measurement?: { value: number; unit: string; method: string; uncertainty: string } | null;
  location?: { panelId: string; view: "front" | "rear" | "left" | "right" | "top"; x: number; y: number } | null;
}
export interface PinnedReportScope {
  checks: { id: string; required: boolean; evidenceRequired: boolean; measurement: { unit: string } | null }[];
  panels: { id: string; evidenceRequired: boolean; views?: string[] }[];
}
export interface DiagnosticReportState {
  id: string; orderId: string; audience: ReportAudience; status: ReportStatus; templateVersionId: string;
  observedAt: string; mileageKm: number; findings: ReportFinding[]; reviewerId: string | null; authorId: string;
  successorOf: string | null; correctionReason: string | null; returnReason: string | null;
  finalizedAt: string | null; withdrawnAt: string | null; withdrawalReason: string | null;
}
export interface ReportReview {
  now: Date;
  reason?: string;
  /** Supplied only after current reviewer capability, qualification and assignment checks. */
  privateSelfReviewAuthorized?: boolean;
}
export interface PublicReportAssociation {
  publicationAuthorized: boolean;
  identityMatches: boolean;
  listingVisible: boolean;
}

/** A correction preserves observed facts. A new physical inspection owns new observations. */
export class DiagnosticReport {
  private readonly value: DiagnosticReportState;
  private readonly scope: PinnedReportScope | undefined;
  constructor(state: DiagnosticReportState, scope?: PinnedReportScope) {
    this.value = structuredClone(state);
    this.scope = scope ? structuredClone(scope) : undefined;
  }
  get state(): DiagnosticReportState { return structuredClone(this.value); }
  private copy(patch: Partial<DiagnosticReportState>): DiagnosticReport {
    return new DiagnosticReport({ ...this.value, ...patch }, this.scope);
  }

  upsertFinding(actorId: string, finding: ReportFinding): DiagnosticReport {
    if (!["draft", "returned"].includes(this.value.status)) throw new DiagnosticRuleError("REPORT_IMMUTABLE");
    if (!actorId || actorId !== this.value.authorId) throw new DiagnosticRuleError("REPORT_AUTHOR_REQUIRED");
    if (!finding.explanation?.trim() && finding.assessment !== "normal") throw new DiagnosticRuleError("REPORT_EXPLANATION_REQUIRED");
    if ((finding.assessment === "note" || finding.assessment === "fault") && !finding.evidenceIds.length) throw new DiagnosticRuleError("REPORT_EVIDENCE_REQUIRED");
    this.validateFinding(finding);
    if (this.value.findings.some(item => item.checkId === finding.checkId && item.id !== finding.id)) throw new DiagnosticRuleError("REPORT_DUPLICATE_CHECK");
    const prior = this.value.findings.find(item => item.id === finding.id);
    if (prior && prior.checkId !== finding.checkId) throw new DiagnosticRuleError("REPORT_FINDING_IDENTITY_IMMUTABLE");
    const findings = this.value.findings.filter(item => item.id !== finding.id);
    return this.copy({ findings: [...findings, finding] });
  }

  private validateFinding(finding: ReportFinding): void {
    if (finding.kind === "source_history" && !finding.source?.trim()) throw new DiagnosticRuleError("REPORT_SOURCE_REQUIRED");
    if (new Set(finding.evidenceIds).size !== finding.evidenceIds.length) throw new DiagnosticRuleError("REPORT_EVIDENCE_INVALID");
    if (!this.scope) return;
    const check = this.scope.checks.find(item => item.id === finding.checkId);
    const panel = this.scope.panels.find(item => item.id === finding.checkId);
    if (!check && !panel) throw new DiagnosticRuleError("REPORT_UNKNOWN_CHECK");
    const assessed = !["not_checked", "not_applicable"].includes(finding.assessment);
    if ((check?.evidenceRequired || panel?.evidenceRequired) && assessed && !finding.evidenceIds.length) throw new DiagnosticRuleError("REPORT_EVIDENCE_REQUIRED");
    if (check?.measurement && assessed && !finding.measurement) throw new DiagnosticRuleError("REPORT_MEASUREMENT_REQUIRED");
    if (finding.measurement && (!check?.measurement || finding.measurement.unit !== check.measurement.unit ||
      !Number.isFinite(finding.measurement.value) || !finding.measurement.method.trim() || !finding.measurement.uncertainty.trim())) throw new DiagnosticRuleError("REPORT_MEASUREMENT_INVALID");
    if (finding.location && (!panel || panel.id !== finding.location.panelId ||
      (panel.views && !panel.views.includes(finding.location.view)) || !Number.isFinite(finding.location.x) || !Number.isFinite(finding.location.y) ||
      finding.location.x < 0 || finding.location.x > 1 || finding.location.y < 0 || finding.location.y > 1)) throw new DiagnosticRuleError("REPORT_LOCATION_INVALID");
  }

  submit(actorId: string, requiredCheckIds: string[]): DiagnosticReport {
    if (!["draft", "returned"].includes(this.value.status)) throw new DiagnosticRuleError("REPORT_SUBMIT_DENIED");
    if (actorId !== this.value.authorId) throw new DiagnosticRuleError("REPORT_AUTHOR_REQUIRED");
    if (this.scope) {
      this.value.findings.forEach(finding => this.validateFinding(finding));
      requiredCheckIds = [...this.scope.checks.filter(check => check.required).map(check => check.id), ...this.scope.panels.map(panel => panel.id)];
    }
    if (requiredCheckIds.some(id => !this.value.findings.some(finding => finding.checkId === id))) throw new DiagnosticRuleError("REPORT_UNASSESSED_REQUIRED");
    if (this.value.findings.some(finding => requiredCheckIds.includes(finding.checkId) && finding.assessment === "not_checked")) throw new DiagnosticRuleError("REPORT_INCOMPLETE");
    return this.copy({ status: "submitted", returnReason: null });
  }

  review(actorId: string, decision: "return" | "finalize", review: ReportReview): DiagnosticReport {
    if (this.value.status !== "submitted") throw new DiagnosticRuleError("REPORT_REVIEW_DENIED");
    if (!actorId || (actorId === this.value.authorId &&
        !(this.value.audience === "buyer_private" && review.privateSelfReviewAuthorized))) {
      throw new DiagnosticRuleError("REPORT_REVIEWER_SEPARATION_REQUIRED");
    }
    if (decision === "return") {
      if (!review.reason?.trim()) throw new DiagnosticRuleError("REPORT_RETURN_REASON_REQUIRED");
      return this.copy({ status: "returned", reviewerId: actorId, returnReason: review.reason.trim() });
    }
    return this.copy({ status: "finalized", reviewerId: actorId, finalizedAt: review.now.toISOString() });
  }

  correct(successorId: string, authorId: string, reason: string): DiagnosticReport {
    if (this.value.status !== "finalized" || !reason.trim() || !successorId || successorId === this.value.id || !authorId) throw new DiagnosticRuleError("REPORT_CORRECTION_DENIED");
    return this.copy({ id: successorId, status: "draft", authorId, reviewerId: null, successorOf: this.value.id,
      correctionReason: reason.trim(), returnReason: null, finalizedAt: null, withdrawnAt: null, withdrawalReason: null });
  }

  reinspect(input: { reportId: string; orderId: string; templateVersionId: string; authorId: string; observedAt: string; mileageKm: number; reason: string }): DiagnosticReport {
    if (!["finalized", "withdrawn"].includes(this.value.status) || input.orderId === this.value.orderId || !input.orderId ||
        !input.reportId || input.reportId === this.value.id || !input.authorId || !input.reason.trim() ||
        !Number.isFinite(Date.parse(input.observedAt)) || Date.parse(input.observedAt) < Date.parse(this.value.observedAt) ||
        !Number.isSafeInteger(input.mileageKm) || input.mileageKm < 0) throw new DiagnosticRuleError("REPORT_REINSPECTION_REQUIRED");
    return this.copy({ id: input.reportId, orderId: input.orderId, templateVersionId: input.templateVersionId,
      authorId: input.authorId, status: "draft", observedAt: input.observedAt, mileageKm: input.mileageKm,
      findings: [], reviewerId: null, successorOf: this.value.id, correctionReason: input.reason.trim(),
      returnReason: null, finalizedAt: null, withdrawnAt: null, withdrawalReason: null });
  }

  withdraw(actorId: string, reason: string, now: Date): DiagnosticReport {
    if (this.value.status !== "finalized" || !actorId || !reason.trim()) throw new DiagnosticRuleError("REPORT_WITHDRAW_DENIED");
    return this.copy({ status: "withdrawn", reviewerId: actorId, withdrawalReason: reason.trim(), withdrawnAt: now.toISOString() });
  }

  publicBadgeAvailable(association: PublicReportAssociation | null = null): boolean {
    return this.value.audience === "listing_public" && this.value.status === "finalized" && !this.value.withdrawnAt &&
      !!association?.publicationAuthorized && association.identityMatches && association.listingVisible;
  }
}
