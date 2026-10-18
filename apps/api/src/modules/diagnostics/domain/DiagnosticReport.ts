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
  constructor(state: DiagnosticReportState) { this.value = structuredClone(state); }
  get state(): DiagnosticReportState { return structuredClone(this.value); }
  private copy(patch: Partial<DiagnosticReportState>): DiagnosticReport {
    return new DiagnosticReport({ ...this.value, ...patch });
  }

  upsertFinding(actorId: string, finding: ReportFinding): DiagnosticReport {
    if (!["draft", "returned"].includes(this.value.status)) throw new DiagnosticRuleError("REPORT_IMMUTABLE");
    if (!actorId || actorId !== this.value.authorId) throw new DiagnosticRuleError("REPORT_AUTHOR_REQUIRED");
    if (!finding.explanation?.trim() && finding.assessment !== "normal") throw new DiagnosticRuleError("REPORT_EXPLANATION_REQUIRED");
    if ((finding.assessment === "note" || finding.assessment === "fault") && !finding.evidenceIds.length) throw new DiagnosticRuleError("REPORT_EVIDENCE_REQUIRED");
    const prior = this.value.findings.find(item => item.id === finding.id);
    if (prior && prior.checkId !== finding.checkId) throw new DiagnosticRuleError("REPORT_FINDING_IDENTITY_IMMUTABLE");
    const findings = this.value.findings.filter(item => item.id !== finding.id);
    return this.copy({ findings: [...findings, finding] });
  }

  submit(actorId: string, requiredCheckIds: string[]): DiagnosticReport {
    if (!["draft", "returned"].includes(this.value.status)) throw new DiagnosticRuleError("REPORT_SUBMIT_DENIED");
    if (actorId !== this.value.authorId) throw new DiagnosticRuleError("REPORT_AUTHOR_REQUIRED");
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
