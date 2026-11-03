import type { DiagnosticSchemas as D } from "@auto-tm/contracts";
import { describe, expect, it } from "vitest";
import { withPreparedReaderFixture, type PreparedReaderCleanup } from "../../../../test/helpers/diagnosticPreparedReaderFixture";

const ownershipRights = {
  category: "vehicle_observation", purpose: "SYNTHETIC restricted ownership continuity comparison",
  basis: "SYNTHETIC fixture owner permits retaining seller, commissioner and Business membership linkage until the stated end",
  provenance: "SYNTHETIC source Listing 8 and its server-resolved seller/commissioner/member subjects at observation",
  identifiability: "personal", use: ["service"],
  schedule: { kind: "until", until: "2026-11-23T00:00:00.000Z", reason: "SYNTHETIC source authorization ends; erase component and derived proof payloads" },
  supplierRestrictions: "SYNTHETIC service-only; subject erasure ends authorization earlier", hold: null,
};

describe("issue938 recovery stage1", () => {
  it("projects commissioner and currently assigned staff reads, preserving the exact technician mutation receipt and B source", async () => {
    await withPreparedReaderFixture("readers", "erased-predecessor", async f => {
      const { a, b, report } = await f.pair(true, ownershipRights);
      expect(f.actors.commissionerA.userId).not.toBe(f.actors.commissionerB.userId);
      expect(f.actors.technicianA.userId).not.toBe(f.actors.technicianB.userId);
      const proofId = await f.issue(a, b, report, 8);
      const input = { reportId: f.id("B-reinspection"), predecessorId: report.id, reason: "Independent visit", proofId, expectedOrderVersion: 8 };
      const retry = () => f.send<D.DiagnosticReportRecord>("technicianB", "POST", `orders/${b.order.id}/reinspections`, input);
      const created = await retry(); expect(created.status).toBe(201);
      await f.release(b, input.reportId, true);
      const receipt = await retry(); expect(receipt.status).toBe(201);
      const before = await f.db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: input.reportId } });
      expect(before.reinspectionOrderVersion).toBe(8);
      expect(before.continuityProofId).toBe(proofId);
      await f.purgeA(a);
      expect((await f.db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: report.id } })).erasedAt).not.toBeNull();
      for (const person of ["commissionerB", "technicianB"] as const) {
        const response = await f.send<D.DiagnosticReportRecord>(person, "GET", `reports/${input.reportId}`);
        expect(response.status).toBe(200);
        const current = response.body;
        expect(current).toMatchObject({ id: input.reportId, successorOf: null, findings: [{ id: f.id(`finding-${b.order.id}`) }], mileageKm: 124100 });
        expect(JSON.stringify(current)).not.toContain(report.id);
        const list = await f.send<D.DiagnosticReportRecord[]>(person, "GET", `orders/${b.order.id}/reports`);
        expect(list.status).toBe(200); expect(list.body[0]).toEqual(current);
        const documents = await f.send<D.DiagnosticDocument[]>(person, "GET", `reports/${input.reportId}/documents`);
        expect(documents.status).toBe(200); expect(documents.body).toHaveLength(3);
        expect(documents.body.every(document => document.state === "unavailable")).toBe(true);
      }
      const retried = await retry(); expect(retried.status).toBe(201); expect(retried.body).toEqual(receipt.body);
      expect(await f.db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: input.reportId } })).toEqual(before);
      const foreign = await f.send("foreign", "GET", `reports/${input.reportId}`);
      expect(foreign.status).toBe(403); expect(foreign.body).toMatchObject({ code: "DIAGNOSTIC_NO_ACCESS" });
      await f.assign(b, "technicianB", false);
      const revoked = await f.send("technicianB", "GET", `reports/${input.reportId}`);
      expect(revoked.status).toBe(403); expect(revoked.body).toMatchObject({ code: "DIAGNOSTIC_NO_ACCESS" });
      const retryDenied = await retry(); expect(retryDenied.status).toBe(403); expect(retryDenied.body).toMatchObject({ code: "DIAGNOSTIC_NO_ACCESS" });
    });
  });

  it("[938 control] cleans partial fixture initialization before returning failure", async () => {
    let cleanup: PreparedReaderCleanup | undefined;
    await expect(withPreparedReaderFixture("readers", "partial-initialization", async () => { throw new Error("938_partial_control_work_must_not_run"); },
      { partialFailure: true, cleanup: receipt => { cleanup = receipt; } })).rejects.toThrow("938_partial_initialization_sentinel");
    expect(cleanup).toMatchObject({ role: "r938_s1_readers", callers: 0, sourceReceipts: 0, campaignReceipts: 0,
      roleBackends: 0, roleAbsent: true, objectsEmpty: true, controlPreserved: true, guardModesRestored: true, failures: [] });
  });
});
