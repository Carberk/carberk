import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { CampaignDiagnosticAdmission } from "./campaignDiagnosticAdmission";

// Refusal outcomes only, at the database boundary. Locking, SQL and namespace authority are proven by the
// hosted CampaignFullV3Diagnostics journey, not here.
const reservation = "d901".repeat(8), candidate = "a".repeat(40);
const subject = { userId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222" };
const roster = `reception-steward.${reservation}.${candidate.slice(0, 12)}@campaign897.invalid`;
const scope = { namespace: `cf_${reservation}`, candidate };

function database(email: string | null, contract: boolean, authorityRows: unknown[] = []) {
  return {
    user: { findUnique: async () => email === null ? null : { email } },
    $executeRawUnsafe: async () => 0,
    $queryRawUnsafe: async (sql: string) => sql.includes("to_regprocedure") ? [{ present: contract }] : sql.includes("campaign_diagnostic_authority($1") ? authorityRows : [{ locked: 1 }],
  };
}
const admission = (env: Record<string, unknown> = { AUTOTM_COMMIT_SHA: candidate }) => new CampaignDiagnosticAdmission(new ConfigService(env));

describe("campaign diagnostics first-slice admission refusals", () => {
  it("gives ordinary and non-roster principals no campaign scope", async () => {
    for (const email of [null, "buyer@example.com", `${roster}.example`, `unknown.${reservation}.${candidate.slice(0, 12)}@campaign897.invalid`, `reception-steward.${"D901".repeat(8)}.${candidate.slice(0, 12)}@campaign897.invalid`])
      expect(await admission().begin(database(email, true) as never, subject)).toBeNull();
  });
  it("gives a roster principal no scope outside its serving candidate or in production", async () => {
    for (const env of [{}, { AUTOTM_COMMIT_SHA: "b".repeat(40) }, { AUTOTM_COMMIT_SHA: "A".repeat(40) }, { AUTOTM_COMMIT_SHA: candidate, APP_ENV: "production" }])
      expect(await admission(env).begin(database(roster, true) as never, subject)).toBeNull();
  });
  it("closes a namespace without the diagnostics authority contract", async () => {
    expect(await admission().begin(database(roster, false) as never, subject)).toBeNull();
  });
  it("refuses unless the authority returns exactly one true row", async () => {
    for (const rows of [[], [{ admitted: false }], [{ admitted: true }, { admitted: true }], [{ admitted: "true" }]])
      expect(await admission().admit(database(roster, true, rows) as never, scope, subject)).toBe(false);
    expect(await admission().admit(database(roster, true, [{ admitted: true }]) as never, scope, subject)).toBe(true);
  });
});
