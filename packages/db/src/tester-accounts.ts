import { createHash } from "node:crypto";

export interface TesterUser {
  id: string; phone: string | null; email: string | null; role: string;
  phoneVerifiedAt: Date | null; emailVerifiedAt: Date | null; deletionScheduledAt: Date | null; suspendedAt?: Date | null;
}
export interface TesterTransaction {
  findUsers(accounts: { id: string; phone: string; email: string }[]): Promise<TesterUser[]>;
  createUser(account: { id: string; phone: string; email: string }, now: Date): Promise<void>;
  removePersonalAccounts(users: TesterUser[], now: Date): Promise<TesterResult>;
  scheduleDeletion(ids: string[], now: Date): Promise<number>;
  deleteSessions(ids: string[]): Promise<number>;
  archiveListings(ids: string[]): Promise<number>;
}
export interface TesterAccountStore { transaction<T>(run: (tx: TesterTransaction) => Promise<T>, mode?: "seed" | "remove"): Promise<T>; }
export interface TesterOptions { mode: "seed" | "remove"; testerAccountsJson: string; reviewerAccountsJson: string; now: Date; }

interface TesterAccount { id: string; phone: string; email: string; }
export interface TesterResult { created: number; scheduled: number; sessionsDeleted: number; listingsArchived: number; }

/** Script ownership is independent of list order; no code is stored in User rows. */
export const TESTER_USER_ID_PREFIX = "de300712-0000-4000-8000-";

export class TesterAccountsRefused extends Error {
  constructor(reason: string) { super(`Tester accounts refused: ${reason}`); }
}

function arrayFromJson(raw: string): unknown[] {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new TesterAccountsRefused("invalid list"); }
  if (!Array.isArray(value)) throw new TesterAccountsRefused("invalid list");
  return value;
}

export function parseTesterAccounts(raw: string, reviewerRaw: string): TesterAccount[] {
  const entries = arrayFromJson(raw);
  if (entries.length > 30) throw new TesterAccountsRefused("list exceeds 30 entries");
  const phones = new Set<string>();
  const emails = new Set<string>();
  const accounts = entries.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null || !("phone" in entry) || !("email" in entry) || !("code" in entry)) {
      throw new TesterAccountsRefused("invalid entry");
    }
    const { phone, email, code } = entry;
    if (typeof phone !== "string" || !/^\+993\d{8}$/.test(phone) ||
        typeof email !== "string" || email !== email.trim().toLowerCase() || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        typeof code !== "string" || !/^\d{6}$/.test(code)) {
      throw new TesterAccountsRefused("invalid entry");
    }
    if (phones.has(phone) || emails.has(email)) throw new TesterAccountsRefused("duplicate entry");
    phones.add(phone); emails.add(email);
    const suffix = createHash("sha256").update(`autotm-tester:${phone}`).digest("hex").slice(0, 12);
    return { id: `${TESTER_USER_ID_PREFIX}${suffix}`, phone, email };
  });
  for (const reviewer of arrayFromJson(reviewerRaw)) {
    if (typeof reviewer !== "object" || reviewer === null || !("phone" in reviewer) || !("email" in reviewer) || typeof reviewer.phone !== "string" || typeof reviewer.email !== "string") {
      throw new TesterAccountsRefused("invalid reviewer list");
    }
    if (phones.has(reviewer.phone) || emails.has(reviewer.email)) throw new TesterAccountsRefused("reviewer overlap");
  }
  return accounts;
}

export async function runTesterAccounts(store: TesterAccountStore, input: TesterOptions): Promise<TesterResult> {
  const accounts = parseTesterAccounts(input.testerAccountsJson, input.reviewerAccountsJson);
  if (accounts.length === 0) return { created: 0, scheduled: 0, sessionsDeleted: 0, listingsArchived: 0 };
  return store.transaction(async (tx) => {
    const users = await tx.findUsers(accounts);
    const matched = new Map<string, TesterUser>();
    for (const account of accounts) {
      const candidates = users.filter((user) => user.id === account.id || user.phone === account.phone || user.email === account.email);
      if (candidates.length === 0) continue;
      const user = candidates[0];
      if (!user || candidates.length !== 1 || user.id !== account.id || (user.role !== "buyer" && user.role !== "seller")) {
        throw new TesterAccountsRefused("unrelated or privileged User");
      }
      if (user.suspendedAt != null) throw new TesterAccountsRefused("tester suspended");
      // Purge keeps the marker User but erases both methods. Removal remains retryable.
      if (input.mode === "remove" && user.phone === null && user.email === null && user.deletionScheduledAt === null) continue;
      if (user.phone !== account.phone || user.email !== account.email || user.phoneVerifiedAt === null || user.emailVerifiedAt === null) {
        throw new TesterAccountsRefused("tester methods changed");
      }
      if (input.mode === "seed" && user.deletionScheduledAt !== null) throw new TesterAccountsRefused("tester deletion scheduled");
      matched.set(account.id, user);
    }
    // Entire-list preflight above precedes every write. Seed retains Serializable
    // conflicts; removal uses prepared source revalidation at its database boundary.
    if (input.mode === "seed") {
      let created = 0;
      for (const account of accounts) {
        if (matched.has(account.id)) continue;
        await tx.createUser(account, input.now); created++;
      }
      return { created, scheduled: 0, sessionsDeleted: 0, listingsArchived: 0 };
    }
    if (matched.size === 0) return { created: 0, scheduled: 0, sessionsDeleted: 0, listingsArchived: 0 };
    // The database boundary discovers the whole effect graph, prepares once and
    // revalidates this exact ownership before any schedule or archive DML.
    return tx.removePersonalAccounts([...matched.values()], input.now);
  }, input.mode);
}
