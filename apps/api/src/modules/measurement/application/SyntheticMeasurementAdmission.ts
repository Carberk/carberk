import { createHash, timingSafeEqual } from "node:crypto";

/** Protected operator proof grants measurement bootstrap only, never ordinary app authority. */
export function syntheticMeasurementAdmission(config: { environment: string; hash?: string; expiresAt?: string }, credential: string | undefined, now: Date): boolean {
 if (config.environment === "test") return true;
 if (config.environment !== "staging" || !config.hash || !/^[a-f0-9]{64}$/.test(config.hash)
  || !credential || !/^ms_[A-Za-z0-9_-]{43}$/.test(credential) || !config.expiresAt) return false;
 const expiry = Date.parse(config.expiresAt);
 if (!Number.isFinite(expiry) || expiry <= now.getTime() || expiry > now.getTime() + 86400000) return false;
 return timingSafeEqual(Buffer.from(config.hash, "hex"), createHash("sha256").update(credential).digest());
}
