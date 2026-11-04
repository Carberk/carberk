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
    enrollment: { encryptedSecret: encrypt(RFC_SECRET), verifiedAt: new Date(0) },
    ...overrides,
  };
}

function run(user: LocalAdminTotpUser | null, options: { databaseUrl?: string; keyBase64?: string; now?: Date } = {}) {
  const findUserByPhone = vi.fn().mockResolvedValue(user);
  const result = runLocalAdminTotp(
    { findUserByPhone },
    {
      databaseUrl: "databaseUrl" in options ? options.databaseUrl : LOCAL_DB,
      keyBase64: "keyBase64" in options ? options.keyBase64 : KEY,
      phone: "+99365000001",
      now: options.now ?? new Date(59_000),
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
    await expect(result).resolves.toMatchObject({ exitCode: 1, message: expect.stringContaining("admin:promote") });
  });

  it("tells the caller to reach the QR step when the admin has no authenticator yet", async () => {
    const { result } = run(admin({ enrollment: null }));
    await expect(result).resolves.toMatchObject({ exitCode: 1, message: expect.stringContaining("QR code") });
  });
});
