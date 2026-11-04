import { isIP } from "node:net";

/** The ingress rule used to forward an admin operator's address (ADR-0078). */
export interface VisitorIpPolicy {
  /** `null` trusts no incoming header, so no address is forwarded. */
  header: string | null;
  trustedHops: number;
  apiHeader: string;
}

const FORWARDED_FOR = "x-forwarded-for";
const HEADER_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TRUST_NOTHING: VisitorIpPolicy = { header: null, trustedHops: 1, apiHeader: "x-real-ip" };

function headerName(value: string | undefined, fallback: string): string | null {
  const name = (value ?? fallback).trim().toLowerCase();
  return HEADER_NAME.test(name) ? name : null;
}

export function readVisitorIpPolicy(
  env: Record<string, string | undefined> = process.env,
): VisitorIpPolicy {
  const header = headerName(env["CLIENT_IP_HEADER"], "x-real-ip");
  const apiHeader = headerName(env["API_CLIENT_IP_HEADER"], "x-real-ip");
  const hopsText = (env["CLIENT_IP_TRUSTED_HOPS"] ?? "1").trim();
  const trustedHops = /^\d+$/.test(hopsText) ? Number(hopsText) : Number.NaN;
  if (header === null || apiHeader === null || apiHeader === "none" || !(trustedHops >= 1 && trustedHops <= 10)) return TRUST_NOTHING;
  return { header: header === "none" ? null : header, trustedHops, apiHeader };
}

function singleIp(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.includes("%") || isIP(candidate) === 0) return null;
  return candidate;
}

/** Reads only the configured ingress header. Invalid input returns null. */
export function visitorIp(
  headers: { get(name: string): string | null },
  policy: VisitorIpPolicy = readVisitorIpPolicy(),
): string | null {
  if (policy.header === null) return null;
  const raw = headers.get(policy.header);
  if (policy.header !== FORWARDED_FOR) return singleIp(raw ?? undefined);
  const entries = (raw ?? "").split(",").map((entry) => entry.trim());
  return singleIp(entries[entries.length - policy.trustedHops]);
}

/** Replace the API's trusted header with only the sanitized incoming value. */
export function forwardVisitorIp(
  outgoing: Headers,
  incoming: { get(name: string): string | null },
  policy: VisitorIpPolicy = readVisitorIpPolicy(),
): void {
  const address = visitorIp(incoming, policy);
  outgoing.delete(policy.apiHeader);
  if (address) outgoing.set(policy.apiHeader, address);
}
