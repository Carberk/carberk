import { createDecipheriv, createHmac } from "node:crypto";

// Local development only: prints a local admin's current authenticator code
// so an agent can finish admin sign-in without scanning the setup QR code.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const STEP_SECONDS = 30;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export interface LocalAdminTotpUser {
  id: string;
  role: string;
  /** The `totp_enrollments` row, or null before the admin reaches the QR step. */
  enrollment: { encryptedSecret: string; verifiedAt: Date | null } | null;
}

export interface LocalAdminTotpDeps {
  findUserByPhone(phone: string): Promise<LocalAdminTotpUser | null>;
}

export interface LocalAdminTotpOptions {
  databaseUrl: string | undefined;
  keyBase64: string | undefined;
  phone: string;
  now: Date;
}

export type LocalAdminTotpResult =
  | { exitCode: 0; code: string; message: string }
  | { exitCode: 1; message: string };

export async function runLocalAdminTotp(
  deps: LocalAdminTotpDeps,
  options: LocalAdminTotpOptions,
): Promise<LocalAdminTotpResult> {
  if (!isLocalDatabase(options.databaseUrl)) {
    return { exitCode: 1, message: "Refusing: DATABASE_URL must point at localhost. This helper is for the local Docker stack only." };
  }
  if (!options.keyBase64) {
    return { exitCode: 1, message: "TOTP_SECRET_ENCRYPTION_KEY is missing. Copy apps/api/.env.template to apps/api/.env." };
  }

  const user = await deps.findUserByPhone(options.phone);
  if (!user) {
    return { exitCode: 1, message: `No user has phone ${options.phone}. Sign in once with it, then run admin:promote.` };
  }
  if (user.role !== "admin") {
    return { exitCode: 1, message: `User ${user.id} is ${user.role}, not admin. Run admin:promote first.` };
  }
  if (!user.enrollment) {
    return { exitCode: 1, message: "No authenticator yet. Sign in to admin until it shows the QR code, then run this again." };
  }

  const secret = decryptTotpSecret(user.enrollment.encryptedSecret, options.keyBase64);
  const seconds = Math.floor(options.now.getTime() / 1000);
  const secondsLeft = STEP_SECONDS - (seconds % STEP_SECONDS);
  const setup = user.enrollment.verifiedAt ? "" : "; this code also finishes authenticator setup";
  return {
    exitCode: 0,
    code: totpCode(secret, Math.floor(seconds / STEP_SECONDS)),
    message: `Valid for ${secondsLeft}s more${setup}.`,
  };
}

function isLocalDatabase(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false;
  try {
    const url = new URL(databaseUrl);
    // Require the exact canonical URL that pg receives: URL silently strips
    // whitespace that pg can interpret as a different host. Query parameters
    // and non-Postgres schemes can also override or omit the local host.
    return (
      url.href === databaseUrl &&
      (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
      url.search === "" &&
      LOCAL_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

/** Same layout as the API's `AesGcmTotpSecretCipher`: base64 of IV (16) | auth tag (16) | ciphertext. */
function decryptTotpSecret(ciphertext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const payload = Buffer.from(ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, payload.subarray(0, 16));
  decipher.setAuthTag(payload.subarray(16, 32));
  return Buffer.concat([decipher.update(payload.subarray(32)), decipher.final()]).toString("utf-8");
}

/** RFC 6238 TOTP with the API's otplib defaults: SHA-1, 6 digits, 30-second steps. */
function totpCode(base32Secret: string, counter: number): string {
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(base32Secret)).update(counterBytes).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const value = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, "0");
}

function base32Decode(input: string): Buffer {
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of input.toUpperCase().replace(/=+$/, "")) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error("TOTP secret is not base32");
    buffer = ((buffer << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}
