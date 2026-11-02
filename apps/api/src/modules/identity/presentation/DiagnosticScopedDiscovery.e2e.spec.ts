import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPreparedReaderFixture, type PreparedReaderFixture } from "../../../../test/helpers/diagnosticPreparedReaderFixture";

function feasibilityStop(caseName: string): never {
  throw new Error(`ISSUE938_FEASIBILITY_STOP case=${caseName} dependency=lawful production transition not yet representable without immutable-row mutation`);
}

describe("B-scoped discovery through production HTTP, authority and prepared PostgreSQL", { concurrent: false }, () => {
  let f: PreparedReaderFixture;

  beforeAll(async () => {
    f = await openPreparedReaderFixture("scoped-discovery");
  });

  afterAll(async () => {
    try {
      await f?.cleanup();
    } finally {
      await f?.close();
    }
  });

  it("traverses more than 50 with stable tie ordering and an anchored scan, without protected fields", async () => feasibilityStop("scoped-discovery-pagination"));

  it("returns only named currently eligible distinct B technicians to a non-reception reviewer", async () => {
    const order = await f.visit({ name: "scoped-technicians" });
    const response = await f.get("reviewer", `orders/${order.id}/linking-technicians`).expect(200);
    expect(response.body).toEqual({ technicians: [{ userId: f.id("technician"), name: "technician" }] });
    expect((await f.get("foreign", `orders/${order.id}/linking-technicians`)).status).toBe(403);
  });

  it("uses scoped empty semantics and omits inaccessible or incomplete retained material", async () => feasibilityStop("scoped-discovery-empty-semantics"));
  it("binds continuation to B, actor, Session and strict query scope", async () => feasibilityStop("scoped-discovery-cursor-binding"));
  it.each(["assignment", "qualification", "erasure", "session"] as const)("normalizes current B %s loss and unknown B", async loss => feasibilityStop(`scoped-discovery-current-b-${loss}`));
  it("replays a stable page, excludes later arrivals, and rechecks unseen A rights and assignments", async () => feasibilityStop("scoped-discovery-stable-page"));
  it("keeps many unassigned visits out of continuation and exhaustion semantics", async () => feasibilityStop("scoped-discovery-unassigned-visits"));
  it.each(["grant", "inactive", "assignment", "unnamed"] as const)("omits a B technician after current Identity or assignment %s loss", async loss => feasibilityStop(`scoped-discovery-technician-${loss}`));
  it("rejects a second current Session, cursor tampering without retaining pair data", async () => feasibilityStop("scoped-discovery-session-cursor"));
  it("omits disconnected retained identity claims, expired B material and inconsistent raw history", async () => feasibilityStop("scoped-discovery-retained-state"));
  it("allows an empty bounded page to continue without claiming absence", async () => feasibilityStop("scoped-discovery-empty-page"));
  it("omits malformed required retained evidence without a partial candidate or protected error", async () => feasibilityStop("scoped-discovery-malformed-retained-evidence"));
});
