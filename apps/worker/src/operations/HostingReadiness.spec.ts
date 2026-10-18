import { describe, expect, it } from "vitest";

import { hostingReadiness, type HostingReadinessPacket } from "./HostingReadiness";

const now = new Date("2026-10-19T04:00:00Z");
const candidateSha = "a".repeat(40);
const receipt = { evidenceRef: "synthetic/drill-920", verifiedAt: now.toISOString() };
function packet(): HostingReadinessPacket {
  return { version: 1, phase: "railway-reviewer", candidateSha,
    runtime: { ...receipt, candidateSha, currentConfigurationReconciled: true, diagnosticsEnabled: false, scorecardEnabled: false, tmServingEnabled: false },
    billing: { ...receipt, currency: "USD", projectedMonthly: 80, includesMonitoringStorageBackups: true },
    recovery: { ...receipt, isolatedTarget: true, declaredAt: "2026-10-16T11:00:00.000Z", restoredAt: "2026-10-19T02:00:00.000Z",
      databaseSnapshotAt: "2026-10-16T10:00:00.000Z", mediaSnapshotAt: "2026-10-16T10:00:00.000Z", databaseCheckpoint: "consistent-1", mediaCheckpoint: "consistent-1",
      checksumsVerified: true, schemaVerified: true, coreJourneysVerified: true, telemetryExcludedFromCoreBackups: true,
      replayedThrough: "2026-10-19T02:30:00.000Z", trafficResumedAt: "2026-10-19T03:00:00.000Z", liveDeletionFence: true,
      erasedRecordsDenied: true, retiredObjectsDenied: true, collectorEpochRotated: false },
  };
}
describe("phase-specific hosting evidence assessment", () => {
  it("keeps missing evidence closed and distinguishes the reviewer phase from diagnostics/TM launch", () => {
    const missing = hostingReadiness({ version: 1, phase: "railway-diagnostics", candidateSha }, now);
    expect(missing.evidenceComplete).toBe(false);
    expect(missing.activationAuthorized).toBe(false);
    expect(missing.criteria.find(item => item.id === "monitoring")?.state).toBe("missing");
    const reviewer = hostingReadiness(packet(), now);
    expect(reviewer.evidenceComplete).toBe(true);
    expect(reviewer.activationAuthorized).toBe(false);
    expect(reviewer.budget?.warning).toBe(true);
    expect(reviewer.criteria.find(item => item.id === "monitoring")?.state).toBe("not_applicable");
  });
  it("rejects stale historical drills and inconsistent database/media checkpoints", () => {
    const input = packet();
    if (!input.recovery) throw new Error("Missing fixture");
    input.recovery.verifiedAt = "2026-09-05T20:12:16.000Z";
    input.recovery.mediaCheckpoint = "another-backup";
    const result = hostingReadiness(input, now);
    expect(result.criteria.find(item => item.id === "recovery")?.reasons).toEqual(expect.arrayContaining(["STALE_RESTORE_DRILL", "INCONSISTENT_RESTORE_CHECKPOINT"]));
    expect(result.evidenceComplete).toBe(false);
  });
  it("measures staffed recovery through safe reopening and rejects late deletion replay or telemetry backup", () => {
    const input = packet();
    if (!input.recovery) throw new Error("Missing fixture");
    input.recovery.trafficResumedAt = "2026-10-19T03:00:00.001Z";
    input.recovery.replayedThrough = "2026-10-19T03:01:00.000Z";
    input.recovery.telemetryExcludedFromCoreBackups = false;
    const result = hostingReadiness(input, now);
    expect(result.criteria.find(item => item.id === "recovery")?.reasons).toEqual(expect.arrayContaining(["STAFFED_RECOVERY_TARGET_EXCEEDED", "TELEMETRY_IN_CORE_BACKUPS"]));
    expect(result.criteria.find(item => item.id === "deletion")?.reasons).toContain("DELETION_REPLAY_ORDER_INVALID");
  });
  it("rejects reviewer activation leakage, unverified billing and cross-candidate receipts", () => {
    const input = packet();
    if (!input.runtime || !input.billing) throw new Error("Missing fixture");
    input.runtime.candidateSha = "b".repeat(40); input.runtime.diagnosticsEnabled = true;
    input.billing.includesMonitoringStorageBackups = false; input.billing.currency = "TMT";
    const result = hostingReadiness(input, now);
    expect(result.criteria.find(item => item.id === "runtime")?.reasons).toEqual(["CANDIDATE_MISMATCH", "REVIEWER_PHASE_ACTIVATION_VIOLATION"]);
    expect(result.criteria.find(item => item.id === "budget")?.reasons).toEqual(["BUDGET_CURRENCY_MISMATCH", "INCOMPLETE_BUDGET_SCOPE"]);
  });
});
