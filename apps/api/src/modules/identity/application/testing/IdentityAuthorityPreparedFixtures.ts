/** Complete declarations shared by SQL setup and its case lookup. No database or E2E imports. */
export const identityAuthorityRefusals = ["missing", "foreign", "expired", "inactive"] as const;
export type IdentityAuthorityRefusal = typeof identityAuthorityRefusals[number];
export const refusalFixtureKey = (kind: IdentityAuthorityRefusal): string => `refusal-${kind}`;

export async function identityAuthorityPreparedFixtures(
  suiteId: (label: string) => string,
  at: Date,
  end: Date,
  hash: (plaintext: string) => Promise<string>,
) {
  const families = ["refresh", "first", "backup", "revoke", "delete", "destination", "otp", "cascade", "noop", "expired"];
  const keys = [...families.flatMap(family => ["left", "right"].map(order => `${family}-${order}`)), ...identityAuthorityRefusals.map(refusalFixtureKey)];
  const fixtures = new Map<string, Awaited<ReturnType<typeof declaration>>>();
  async function declaration(key: string) {
    const id = (who: string) => suiteId(`${key}-${who}`);
    const users = ["staff", "manager", "other"].map(who => ({ id: id(who), email: `${id(who)}@identity.invalid`, emailVerifiedAt: at }));
    const staffSession = { id: id("session"), userId: id("staff"), refreshTokenHash: await hash(`old-refresh-${key}-staff`), expiresAt: end };
    const managerSession = { id: id("manager-session"), userId: id("manager"), refreshTokenHash: await hash(`old-refresh-${key}-manager`), expiresAt: end, adminTotpExpiresAt: end };
    const pending = key.startsWith("first-");
    return {
      key, users, staffSession, managerSession,
      grants: [
        { userId: id("staff"), capability: "diagnostics.technician" },
        { userId: id("manager"), capability: "staff.manage" },
        { userId: id("manager"), capability: "founder.control" },
      ],
      enrollment: { id: id("enrollment"), userId: id("staff"), encryptedSecret: "synthetic-encrypted", verifiedAt: pending ? null : at },
      backup: pending ? null : { id: id("backup"), totpEnrollmentId: id("enrollment"), codeHash: "one-use" },
      refresh: { id: staffSession.id, oldHash: staffSession.refreshTokenHash, winner: id("refresh-winner"), loser: id("refresh-loser") },
      tokens: { incoming: id("incoming-hash"), expired: id("expired-hash"), live: id("live-hash"), unused: id("unused-hash") },
    };
  }
  for (const key of keys) fixtures.set(key, await declaration(key));
  return fixtures;
}
