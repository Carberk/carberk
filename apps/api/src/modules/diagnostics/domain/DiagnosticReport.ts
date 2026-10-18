import { DiagnosticRuleError } from "./InspectionOrder";

export type ReportAudience = "buyer_private" | "listing_public";
export type FindingAssessment = "normal" | "note" | "fault" | "not_checked" | "not_applicable";
export type ReportStatus = "draft" | "submitted" | "returned" | "finalized" | "withdrawn";
export interface ReportFinding { id: string; checkId: string; assessment: FindingAssessment; explanation: string | null; evidenceIds: string[]; }
export interface DiagnosticReportState {
  id: string; orderId: string; audience: ReportAudience; status: ReportStatus; templateVersionId: string;
  observedAt: string; mileageKm: number; findings: ReportFinding[]; reviewerId: string | null; authorId: string;
  successorOf: string | null; correctionReason: string | null; finalizedAt: string | null; withdrawnAt: string | null;
}

/** Immutable report workflow. A finalized snapshot can only be followed by a linked successor. */
export class DiagnosticReport {
  constructor(private readonly value: DiagnosticReportState) {}
  get state(): DiagnosticReportState { return structuredClone(this.value); }
  private copy(patch: Partial<DiagnosticReportState>): DiagnosticReport { return new DiagnosticReport({ ...this.value, ...patch, findings: patch.findings ?? this.value.findings.map(f => ({ ...f, evidenceIds: [...f.evidenceIds] })) }); }
  upsertFinding(actorId: string, finding: ReportFinding): DiagnosticReport {
    if (this.value.status !== "draft" && this.value.status !== "returned") throw new DiagnosticRuleError("REPORT_IMMUTABLE");
    if (!actorId || actorId !== this.value.authorId) throw new DiagnosticRuleError("REPORT_AUTHOR_REQUIRED");
    if (!finding.explanation?.trim() && (finding.assessment === "note" || finding.assessment === "fault" || finding.assessment === "not_checked")) throw new DiagnosticRuleError("REPORT_EXPLANATION_REQUIRED");
    if ((finding.assessment === "note" || finding.assessment === "fault") && finding.evidenceIds.length === 0) throw new DiagnosticRuleError("REPORT_EVIDENCE_REQUIRED");
    const findings = this.value.findings.filter(item => item.id !== finding.id);
    return this.copy({ findings: [...findings, { ...finding, evidenceIds: [...finding.evidenceIds] }] });
  }
  submit(actorId: string, requiredCheckIds: string[]): DiagnosticReport {
    if (this.value.status !== "draft" && this.value.status !== "returned") throw new DiagnosticRuleError("REPORT_SUBMIT_DENIED");
    if (actorId !== this.value.authorId) throw new DiagnosticRuleError("REPORT_AUTHOR_REQUIRED");
    const byCheck = new Map(this.value.findings.map(f => [f.checkId, f]));
    if (requiredCheckIds.some(id => !byCheck.has(id))) throw new DiagnosticRuleError("REPORT_UNASSESSED_REQUIRED");
    return this.copy({ status: "submitted" });
  }
  review(actorId: string, decision: "return" | "finalize", reason?: string): DiagnosticReport {
    if (this.value.status !== "submitted") throw new DiagnosticRuleError("REPORT_REVIEW_DENIED");
    if (!actorId || actorId === this.value.authorId) {
      if (!(this.value.audience === "buyer_private" && actorId === this.value.reviewerId)) throw new DiagnosticRuleError("REPORT_REVIEWER_SEPARATION_REQUIRED");
    }
    if (decision === "return") return this.copy({ status: "returned", reviewerId: actorId, correctionReason: reason?.trim() || null });
    if (this.value.findings.some(f => f.assessment === "not_checked")) throw new DiagnosticRuleError("REPORT_INCOMPLETE");
    return this.copy({ status: "finalized", reviewerId: actorId, finalizedAt: new Date().toISOString() });
  }
  correct(successorId: string, authorId: string, reason: string, observedAt: string, mileageKm: number): DiagnosticReport {
    if (this.value.status !== "finalized" || !reason.trim()) throw new DiagnosticRuleError("REPORT_CORRECTION_DENIED");
    return new DiagnosticReport({ id: successorId, orderId: this.value.orderId, audience: this.value.audience, status: "draft", templateVersionId: this.value.templateVersionId, observedAt, mileageKm, findings: [], reviewerId: null, authorId, successorOf: this.value.id, correctionReason: reason.trim(), finalizedAt: null, withdrawnAt: null });
  }
  withdraw(actorId: string): DiagnosticReport {
    if (this.value.status !== "finalized" || actorId !== this.value.reviewerId) throw new DiagnosticRuleError("REPORT_WITHDRAW_DENIED");
    return this.copy({ status: "withdrawn", withdrawnAt: new Date().toISOString() });
  }
  publicBadgeAvailable(): boolean { return this.value.audience === "listing_public" && this.value.status === "finalized" && !this.value.withdrawnAt; }
}
