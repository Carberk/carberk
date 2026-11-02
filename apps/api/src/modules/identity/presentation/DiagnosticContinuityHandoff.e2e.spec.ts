import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  openPreparedReaderFixture,
  type PreparedReaderFixture,
} from "../../../../test/helpers/diagnosticPreparedReaderFixture";

function feasibilityStop(caseName: string): never {
  throw new Error(`ISSUE938_FEASIBILITY_STOP case=${caseName} dependency=lawful production transition not yet representable without immutable-row mutation`);
}

describe("B-owned continuity handoff through production HTTP, authority and prepared PostgreSQL", { concurrent: false }, () => {
  let f: PreparedReaderFixture;

  beforeAll(async () => {
    f = await openPreparedReaderFixture("continuity-handoff");
  });

  afterAll(async () => {
    try {
      await f?.cleanup();
    } finally {
      await f?.close();
    }
  });

  it("lets only the selected current B technician reload a minimal usable handle without A access", async () => {
    const pair = await f.continuityPair();
    const response = await f.get("technician", `orders/${pair.b.id}/continuity-handoffs`).expect(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body).toEqual({
      handoffs: [{ proofId: pair.proofId, status: "usable", expectedOrderVersion: pair.b.version }],
      result: null,
      nextCursor: null,
      scope: "current_b_owned_handoffs",
    });
    expect((await f.get("reviewer", `orders/${pair.b.id}/continuity-proofs/${pair.proofId}`)).status).toBe(403);
    expect((await f.get("reviewer", `orders/${pair.b.id}/continuity-handoffs`)).status).toBe(403);
    expect((await f.get("foreign", `orders/${pair.b.id}/continuity-handoffs`)).status).toBe(403);
  });

  it("uses only B command fields and recovers B after proof payload loss and later A erasure", async () => feasibilityStop("continuity-handoff-proof-payload-loss"));

  it.each([
    ["issuer Session expiry", "session"],
    ["issuer grant loss", "staffGrant"],
    ["issuer qualification loss", "diagnosticCenterAssignment"],
    ["issuer A assignment loss", "diagnosticOrderAssignment"],
    ["issuer B assignment loss", "diagnosticOrderAssignment"],
    ["A erasure", "inspectionOrder"],
    ["A raw erasure", "diagnosticIdentityRecord"],
    ["A rights expiry", "diagnosticIdentityProvenance"],
    ["B rights expiry", "diagnosticIdentityEvidence"],
    ["changed B version", "inspectionOrder"],
    ["changed A version", "diagnosticReportRecord"],
    ["proof rights expiry", "diagnosticContinuityProof"],
    ["permanent invalidation", "diagnosticContinuityProof"],
  ] as const)("uniformly omits and refuses %s at read and again at action", async (...args) => feasibilityStop(`continuity-handoff-${String(args[0])}`));

  it.each([
    "Session",
    "grant",
    "qualification",
    "B assignment",
  ] as const)("fences B %s changes even on empty pages and consumed result recovery", async name => feasibilityStop(`continuity-handoff-b-${name}`));

  it("keeps readable historical proofs separate from current usability and traverses beyond 50", async () => feasibilityStop("continuity-handoff-history-pagination"));
  it("binds continuation to the query, actor, Session, B and expiry, without inherited authority", async () => feasibilityStop("continuity-handoff-cursor-binding"));
  it("rejects A bindings, protected fields and unrecognized query/command fields", async () => feasibilityStop("continuity-handoff-input-boundary"));
  it("recovers lost preparation and issuance replies without storing pending text or duplicating issuance", async () => feasibilityStop("continuity-handoff-prepared-request-issuance"));
  it("recovers a B-only committed request after proof disposal and A erasure without its command", async () => feasibilityStop("continuity-handoff-prepared-request-consumption"));
  it("refuses unknown identities, new Sessions, wrong actors/kinds and pending command fields", async () => feasibilityStop("continuity-handoff-identity-binding"));
  it("keeps an invalidated issued request historical and refuses first consumption after authority loss", async () => feasibilityStop("continuity-handoff-proof-invalidation"));
  it("bounds request discovery, binds continuations to Session/B/query and stages linkage only", async () => feasibilityStop("continuity-handoff-request-discovery"));
});
