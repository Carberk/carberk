import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { identityAuthorityPreparedFixtures, identityAuthorityRefusals, refusalFixtureKey } from "../application/testing/IdentityAuthorityPreparedFixtures";
import { BcryptHasherAdapter } from "./BcryptHasherAdapter";

const id = (label: string) => {
  const hex = createHash("sha256").update(label).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const at = new Date("2026-10-25T12:00:00Z"), end = new Date("2026-10-25T13:00:00Z");
const hasher = new BcryptHasherAdapter();
let fixtures: Awaited<ReturnType<typeof identityAuthorityPreparedFixtures>>;
const unique = (values: string[]) => expect(new Set(values).size).toBe(values.length);

beforeAll(async () => { fixtures = await identityAuthorityPreparedFixtures(id, at, end, value => hasher.hash(value)); });
describe("identity opposition fixture database-boundary allocation", () => {
  it("can insert every Session under the global refresh hash unique constraint", () => {
    const sessions = [...fixtures.values()].flatMap(row => [row.staffSession, row.managerSession]);
    unique(sessions.map(row => row.id));
    unique(sessions.map(row => row.refreshTokenHash));
  });
  it("can retain both delete-case incoming Sessions and every expiry/refusal output together", () => {
    const keys = ["delete-left", "delete-right", "expired-left", ...identityAuthorityRefusals.map(refusalFixtureKey)];
    const outputs = keys.flatMap(key => {
      const row = fixtures.get(key)!;
      return key.startsWith("delete-") ? [row.tokens.incoming] : key === "expired-left" ? [row.tokens.expired, row.tokens.live] :
        [row.tokens.unused, ...(key === refusalFixtureKey("expired") ? [row.tokens.expired] : [])];
    });
    const refreshOutputs = ["refresh-left", "refresh-right"].flatMap(key => {
      const row = fixtures.get(key)!; return [row.refresh.winner, row.refresh.loser];
    });
    unique([...outputs, ...refreshOutputs, ...[...fixtures.values()].flatMap(row => [row.staffSession.refreshTokenHash, row.managerSession.refreshTokenHash])]);
  });
  it("gives each independent refusal its own legitimate pending enrollment owner and Session space", () => {
    const rows = identityAuthorityRefusals.map(kind => fixtures.get(refusalFixtureKey(kind))!);
    unique(rows.map(row => row.key));
    unique(rows.map(row => row.users[2]!.id));
    // createPending(other) cannot collide with the setup enrollment's unique userId.
    for (const row of rows) expect(row.enrollment.userId).not.toBe(row.users[2]!.id);
    expect(rows.map(row => row.key)).toEqual(["refusal-missing", "refusal-foreign", "refusal-expired", "refusal-inactive"]);
  });
  it("has complete User/enrollment/code/grant references, lawful initial states and exact CAS old values", async () => {
    const rows = [...fixtures.values()], users = rows.flatMap(row => row.users), userIds = new Set(users.map(row => row.id));
    unique(users.map(row => row.id)); unique(users.map(row => row.email));
    unique(rows.map(row => row.enrollment.id)); unique(rows.map(row => row.enrollment.userId));
    unique(rows.flatMap(row => row.backup ? [row.backup.id] : []));
    unique(rows.flatMap(row => row.grants.map(grant => `${grant.userId}:${grant.capability}`)));
    for (const row of rows) {
      for (const session of [row.staffSession, row.managerSession]) { expect(userIds.has(session.userId)).toBe(true); expect(session.expiresAt).toBe(end); }
      for (const grant of row.grants) expect(userIds.has(grant.userId)).toBe(true);
      expect(userIds.has(row.enrollment.userId)).toBe(true);
      expect(row.enrollment.verifiedAt).toBe(row.key.startsWith("first-") ? null : at);
      if (row.backup) { expect(row.backup.totpEnrollmentId).toBe(row.enrollment.id); expect(row.backup.codeHash).toBe("one-use"); }
      expect(row.refresh.id).toBe(row.staffSession.id); expect(row.refresh.oldHash).toBe(row.staffSession.refreshTokenHash);
    }
    const refresh = fixtures.get("refresh-left")!;
    expect(await hasher.compare("old-refresh-refresh-left-staff", refresh.refresh.oldHash)).toBe(true);
    expect(await hasher.compare("old-refresh-refresh-left-manager", refresh.refresh.oldHash)).toBe(false);
  });
});
