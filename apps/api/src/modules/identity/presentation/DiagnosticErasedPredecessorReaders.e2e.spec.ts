import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPreparedReaderFixture, type PreparedReaderFixture } from "../../../../test/helpers/diagnosticPreparedReaderFixture";

describe("erased predecessor readers through production HTTP, worker purge and prepared PostgreSQL", { concurrent: false }, () => {
  let f: PreparedReaderFixture;

  beforeAll(async () => {
    f = await openPreparedReaderFixture("erased-predecessor-readers");
  });

  afterAll(async () => {
    try {
      await f?.cleanup();
    } finally {
      await f?.close();
    }
  });

  it("projects commissioner and currently assigned staff reads, preserving the exact technician mutation receipt and B source", async () => {
    const pair = await f.continuityPair();
    const reportId = f.id("reinspection-report");
    const retry = await f.post("technician", `orders/${pair.b.id}/reinspections`, {
      reportId,
      predecessorId: String(pair.reportA["id"]),
      reason: "Independent visit",
      proofId: pair.proofId,
      expectedOrderVersion: pair.b.version,
    }).expect(201);
    const before = await f.db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } });
    await f.eraseSubject("commissioner");
    const current = await f.get("technician", `reports/${reportId}`).expect(200);
    expect(current.body).toMatchObject({ id: reportId, successorOf: null });
    expect(JSON.stringify(current.body)).not.toContain(String(pair.reportA["id"]));
    expect((await f.get("technician", `orders/${pair.b.id}/reports`)).body[0]).toEqual(current.body);
    expect((await f.post("technician", `orders/${pair.b.id}/reinspections`, {
      reportId,
      predecessorId: String(pair.reportA["id"]),
      reason: "Independent visit",
      proofId: pair.proofId,
      expectedOrderVersion: pair.b.version,
    })).body).toEqual(retry.body);
    expect(await f.db.diagnosticReportRecord.findUniqueOrThrow({ where: { id: reportId } })).toEqual(before);
    expect((await f.get("outsider", `reports/${reportId}`)).status).toBe(403);
  });
});
