import { createCipheriv, randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runLocalAdminTotp, type LocalAdminTotpUser } from "./local-admin-totp";

const KEY = Buffer.alloc(32, 7).toString("base64");
const LOCAL_DB = "postgresql://auto_tm:auto_tm_pass@localhost:5432/auto_tm_dev";
// RFC 6238 appendix B: the ASCII secret "12345678901234567890", base32-encoded.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

/** Encrypts like the API's AesGcmTotpSecretCipher, so the helper reads a real stored row. */
function encrypt(secret: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(KEY, "base64"), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf-8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

function admin(overrides: Partial<LocalAdminTotpUser> = {}): LocalAdminTotpUser {
  return {
    id: "u1",
    role: "admin",
    phone: "+99365000001", email: null, suspendedAt: null, deletionScheduledAt: null, staffGrants: [],
    enrollment: { encryptedSecret: encrypt(RFC_SECRET), verifiedAt: new Date(0) },
    ...overrides,
  };
}

function run(user: LocalAdminTotpUser | null, options: { databaseUrl?: string; keyBase64?: string; now?: Date; purpose?: string } = {}) {
  const findUserByPhone = vi.fn().mockResolvedValue(user);
  const result = runLocalAdminTotp(
    { findUserByPhone },
    {
      databaseUrl: "databaseUrl" in options ? options.databaseUrl : LOCAL_DB,
      keyBase64: "keyBase64" in options ? options.keyBase64 : KEY,
      phone: "+99365000001",
      now: options.now ?? new Date(59_000),
      purpose: options.purpose,
    },
  );
  return { result, findUserByPhone };
}

describe("local admin authenticator code", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses a socket URL before reading a database selected by PGHOST", async () => {
    vi.stubEnv("PGHOST", "db.railway.internal");
    const result = await runLocalAdminTotp(
      { findUserByPhone: async () => { throw new Error("Database must not be read"); } },
      { databaseUrl: "socket://localhost", keyBase64: KEY, phone: "+99365000001", now: new Date(59_000) },
    );
    expect(result).toMatchObject({ exitCode: 1, message: expect.stringContaining("localhost") });
  });

  it.each([
    [59, "287082"],
    [1_111_111_109, "081804"],
    [1_234_567_890, "005924"],
    [2_000_000_000, "279037"],
  ])("gives an enrolled admin the RFC 6238 code at %i seconds", async (seconds, code) => {
    const { result } = run(admin(), { now: new Date(seconds * 1000) });
    await expect(result).resolves.toMatchObject({ exitCode: 0, code });
  });

  it.each([null, new Date(0)])("gives a buyer with the exact current History grant a code (verifiedAt=%s)", async (verifiedAt) => {
    const { result } = run(admin({ role: "buyer", staffGrants: [{ purpose: "vehicle_history", grantedAt: new Date(0), revokedAt: null }],
      enrollment: { encryptedSecret: encrypt(RFC_SECRET), verifiedAt } }), { purpose: "vehicle-history" });
    await expect(result).resolves.toMatchObject({ exitCode: 0, code: "287082" });
  });

  it.each([
    ["vehicle-history-payment-evidence", "vehicle_history_payment_evidence"],
    ["vehicle-history-staff-management", "vehicle_history_staff_management"],
    ["vehicle-history-refund-decision", "vehicle_history_refund_decision"],
    ["vehicle-history-refund-execution", "vehicle_history_refund_execution"],
  ])("reads only the selected %s grant", async (purpose, storedPurpose) => {
    await expect(run(admin({ role: "buyer", staffGrants: [{ purpose: storedPurpose, grantedAt: new Date(59_000), revokedAt: null }] }), { purpose }).result)
      .resolves.toMatchObject({ exitCode: 0, code: "287082" });
  });

  it.each([
    { role: "admin", staffGrants: [] },
    { role: "buyer", staffGrants: [] },
    { staffGrants: [{ purpose: "vehicle_history_payment_evidence", grantedAt: new Date(0), revokedAt: null }] },
    { staffGrants: [{ purpose: "vehicle_history_staff_management", grantedAt: new Date(0), revokedAt: null }] },
    { staffGrants: [{ purpose: "vehicle_history", grantedAt: new Date(0), revokedAt: new Date(1) }] },
    { staffGrants: [{ purpose: "vehicle_history", grantedAt: new Date(59_001), revokedAt: null }] },
    { suspendedAt: new Date(0) },
    { deletionScheduledAt: new Date(0) },
    { phone: null, email: null },
  ])("refuses unauthorized History actors before decrypting (%j)", async (overrides) => {
    const user = admin({ role: "buyer", staffGrants: [{ purpose: "vehicle_history", grantedAt: new Date(0), revokedAt: null }],
      ...overrides, enrollment: { encryptedSecret: "invalid ciphertext must not be decrypted", verifiedAt: null } });
    await expect(run(user, { purpose: "vehicle-history" }).result).resolves.toMatchObject({ exitCode: 1, message: expect.stringContaining("exact current grant") });
  });

  it.each(["", "admin", "vehicle_history", " vehicle-history", "__proto__", "toString"]) ("refuses unknown purpose %s before reading enrollment", async (purpose) => {
    const { result, findUserByPhone } = run(admin(), { purpose });
    await expect(result).resolves.toMatchObject({ exitCode: 1, message: expect.stringContaining("unknown TOTP purpose") });
    expect(findUserByPhone).not.toHaveBeenCalled();
  });

  it("says how long the code stays valid and when it finishes setup", async () => {
    const { result } = run(admin({ enrollment: { encryptedSecret: encrypt(RFC_SECRET), verifiedAt: null } }), {
      now: new Date(50_000),
    });
    await expect(result).resolves.toMatchObject({
      exitCode: 0,
      message: "Valid for 10s more; this code also finishes authenticator setup.",
    });
  });

  it.each([
    "postgresql://u:p@db.railway.internal:5432/railway",
    "postgresql://u:p@monorail.proxy.rlwy.net:41234/railway",
    "postgresql://u:p@localhost:5432/db?host=db.railway.internal",
    "postgresql://u:p@localhost:5432/db?hostaddr=10.0.0.5",
    "postgresql://u:p@localhost,db.railway.internal:5432/db",
    " postgresql://u:p@localhost/db",
    "postgresql://u:p@localhost/db\n",
    "postgresql://u:p@local\thost/db",
    "not a url",
    undefined,
  ])("refuses a database that is not on localhost (%s) without reading it", async (databaseUrl) => {
    const { result, findUserByPhone } = run(admin(), { databaseUrl });
    await expect(result).resolves.toMatchObject({ exitCode: 1, message: expect.stringContaining("localhost") });
    expect(findUserByPhone).not.toHaveBeenCalled();
  });

  it("asks for the API encryption key when it is missing", async () => {
    const { result } = run(admin(), { keyBase64: undefined });
    await expect(result).resolves.toMatchObject({ exitCode: 1, message: expect.stringContaining("TOTP_SECRET_ENCRYPTION_KEY") });
  });

  it("tells the caller to sign in first when no user has the phone", async () => {
    const { result } = run(null);
    await expect(result).resolves.toMatchObject({ exitCode: 1, message: expect.stringContaining("Sign in once") });
  });

  it("refuses a user who is not an admin", async () => {
    const { result } = run(admin({ role: "seller" }));
    await expect(result).resolves.toMatchObject({ exitCode: 1, message: expect.stringContaining("admin role") });
  });

  it("tells the caller to reach the QR step when the admin has no authenticator yet", async () => {
    const { result } = run(admin({ enrollment: null }));
    await expect(result).resolves.toMatchObject({ exitCode: 1, message: expect.stringContaining("QR code") });
  });
});
