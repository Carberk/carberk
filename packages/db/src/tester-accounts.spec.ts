import { describe, expect, it } from "vitest";

import { runTesterAccounts, type TesterAccountStore, type TesterTransaction, type TesterUser } from "./tester-accounts";

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected fixture value");
  return value;
}

const NOW = new Date("2026-10-07T00:00:00.000Z");
const account = (index = 1) => ({ phone: `+99370${String(index).padStart(6, "0")}`, email: `tester${index}@example.invalid`, code: "765432" });
const OWNED_IDS = ['de300712-0000-4000-8000-ba0da55a0d17', 'de300712-0000-4000-8000-e8f71e923960'];
const ownedUser = (index = 1): TesterUser => ({ id: must(OWNED_IDS[index - 1]), phone: account(index).phone, email: account(index).email, role: "buyer", phoneVerifiedAt: NOW, emailVerifiedAt: NOW, deletionScheduledAt: null });
const options = (mode: "seed" | "remove" = "seed", entries = [account()]) => ({ mode, testerAccountsJson: JSON.stringify(entries), reviewerAccountsJson: "[]", now: NOW });

class FakeStore implements TesterAccountStore {
  users: TesterUser[] = [];
  sessionUsers: string[] = [];
  activeListingUsers: string[] = [];

  async transaction<T>(run: (tx: TesterTransaction) => Promise<T>): Promise<T> {
    const users = structuredClone(this.users);
    const sessions = [...this.sessionUsers];
    const listings = [...this.activeListingUsers];
    try { return await run(this); }
    catch (error) { this.users = users; this.sessionUsers = sessions; this.activeListingUsers = listings; throw error; }
  }
  async findUsers(): Promise<TesterUser[]> { return structuredClone(this.users); }
  async createUser(user: { id: string; phone: string; email: string }, now: Date): Promise<void> {
    this.users.push({ ...user, role: "buyer", phoneVerifiedAt: now, emailVerifiedAt: now, deletionScheduledAt: null });
  }
  async removePersonalAccounts(users: TesterUser[], now: Date) {
    const ids = users.map(user => user.id);
    const changed = users.filter(user => user.deletionScheduledAt === null || user.deletionScheduledAt > now).map(user => user.id);
    const scheduled = await this.scheduleDeletion(changed, now);
    const sessionsDeleted = await this.deleteSessions(ids);
    const listingsArchived = await this.archiveListings(ids);
    return { created: 0, scheduled, sessionsDeleted, listingsArchived };
  }

  async scheduleDeletion(ids: string[], now: Date): Promise<number> {
    let count = 0;
    for (const user of this.users) {
      if (ids.includes(user.id) && (user.deletionScheduledAt === null || user.deletionScheduledAt > now)) {
        user.deletionScheduledAt = now; count++;
      }
    }
    return count;
  }
  async deleteSessions(ids: string[]): Promise<number> {
    const before = this.sessionUsers.length;
    this.sessionUsers = this.sessionUsers.filter((id) => !ids.includes(id));
    return before - this.sessionUsers.length;
  }
  async archiveListings(ids: string[]): Promise<number> {
    const before = this.activeListingUsers.length;
    this.activeListingUsers = this.activeListingUsers.filter((id) => !ids.includes(id));
    return before - this.activeListingUsers.length;
  }
}

describe("temporary tester operator behavior", () => {
  it("seeds 30 ordinary Users with both verified methods and repeats without changing them", async () => {
    const store = new FakeStore();
    const input = options("seed", Array.from({ length: 30 }, (_, i) => account(i + 1)));
    expect(await runTesterAccounts(store, input)).toMatchObject({ created: 30 });
    expect(store.users).toHaveLength(30);
    expect(store.users[0]).toMatchObject({ phone: account().phone, email: account().email, role: "buyer", phoneVerifiedAt: NOW, emailVerifiedAt: NOW, deletionScheduledAt: null });
    const seeded = structuredClone(store.users);
    expect(await runTesterAccounts(store, input)).toMatchObject({ created: 0 });
    expect(store.users).toEqual(seeded);
  });

  it("accepts an empty list for both modes without changing an unrelated User", async () => {
    const store = new FakeStore();
    store.users.push({ id: "unrelated", phone: "+99371000000", email: "other@example.invalid", role: "buyer", phoneVerifiedAt: NOW, emailVerifiedAt: NOW, deletionScheduledAt: null });
    const before = structuredClone(store.users);
    expect(await runTesterAccounts(store, options("seed", []))).toEqual({ created: 0, scheduled: 0, sessionsDeleted: 0, listingsArchived: 0 });
    expect(await runTesterAccounts(store, options("remove", []))).toEqual({ created: 0, scheduled: 0, sessionsDeleted: 0, listingsArchived: 0 });
    expect(store.users).toEqual(before);
  });

  for (const mode of ["seed", "remove"] as const) {
    for (const role of ["buyer", "seller", "admin", "moderator"]) {
      for (const conflict of ["phone", "email"] as const) {
        it(`${mode} refuses a ${role} User's ${conflict} before changing any tester`, async () => {
          const store = new FakeStore();
          store.users.push(ownedUser());
          const first = must(store.users[0]);
          store.sessionUsers.push(first.id);
          store.users.push({ id: "unrelated", phone: conflict === "phone" ? account(2).phone : "+99371000000", email: conflict === "email" ? account(2).email : "other@example.invalid", role, phoneVerifiedAt: NOW, emailVerifiedAt: NOW, deletionScheduledAt: null });
          const before = structuredClone(store.users);
          await expect(runTesterAccounts(store, options(mode, [account(), account(2)]))).rejects.toThrow(/refused/);
          expect(store.users).toEqual(before);
          expect(store.sessionUsers).toEqual([first.id]);
        });
      }
    }
  }

  it("removes owned buyer/seller testers now, revokes their Sessions, archives active Listings, and repeats as a no-op", async () => {
    const store = new FakeStore();
    store.users.push(ownedUser(), ownedUser(2));
    must(store.users[1]).role = "seller";
    must(store.users[1]).deletionScheduledAt = new Date("2026-10-20T00:00:00.000Z");
    store.sessionUsers = store.users.map((u) => u.id);
    store.activeListingUsers = [must(store.users[1]).id];
    expect(await runTesterAccounts(store, options("remove", [account(), account(2)]))).toEqual({ created: 0, scheduled: 2, sessionsDeleted: 2, listingsArchived: 1 });
    expect(store.users.map((u) => u.deletionScheduledAt)).toEqual([NOW, NOW]);
    expect(store.sessionUsers).toEqual([]);
    expect(await runTesterAccounts(store, options("remove", [account(), account(2)]))).toEqual({ created: 0, scheduled: 0, sessionsDeleted: 0, listingsArchived: 0 });
    expect(await runTesterAccounts(store, options("remove", [account(3)]))).toMatchObject({ scheduled: 0 });
  });

  for (const role of ["admin", "moderator"]) {
    it(`refuses an owned tester elevated to ${role}`, async () => {
      const store = new FakeStore();
      store.users.push(ownedUser());
      must(store.users[0]).role = role;
      await expect(runTesterAccounts(store, options("remove"))).rejects.toThrow(/refused/);
      await expect(runTesterAccounts(store, options("seed"))).rejects.toThrow(/refused/);
      expect(must(store.users[0]).deletionScheduledAt).toBeNull();
    });
  }

  it("never reseeds a scheduled or purged tester and removes a purged tester as a no-op", async () => {
    const store = new FakeStore();
    store.users.push({ ...ownedUser(), deletionScheduledAt: NOW });
    await expect(runTesterAccounts(store, options())).rejects.toThrow(/refused/);
    const user = must(store.users[0]);
    user.phone = null; user.email = null; user.deletionScheduledAt = null;
    await expect(runTesterAccounts(store, options())).rejects.toThrow(/refused/);
    expect(await runTesterAccounts(store, options("remove"))).toMatchObject({ scheduled: 0 });
  });

  it("refuses invalid, over-limit, duplicate and reviewer-overlapping input without exposing entries", async () => {
    const badLists = ["not-json", "{}", JSON.stringify([null]), JSON.stringify([{ ...account(), phone: "+15551234567" }]), JSON.stringify([{ ...account(), email: "UPPER@example.invalid" }]), JSON.stringify([{ ...account(), code: "12345" }]), JSON.stringify([account(), account()]), JSON.stringify(Array.from({ length: 31 }, (_, i) => account(i + 1)))];
    for (const testerAccountsJson of badLists) {
      await expect(runTesterAccounts(new FakeStore(), { ...options(), testerAccountsJson })).rejects.toThrow(/refused/);
    }
    for (const conflict of ["phone", "email"] as const) {
      const reviewerAccountsJson = JSON.stringify([{ ...account(2), [conflict]: account()[conflict] }]);
      await expect(runTesterAccounts(new FakeStore(), { ...options(), reviewerAccountsJson })).rejects.toThrow(/refused/);
    }
  });
});

it("refuses a privileged final tester before scheduling, Session deletion or Listing archive", async () => {
  const store = new FakeStore();
  store.users.push(ownedUser(), ownedUser(2));
  store.sessionUsers = store.users.map((user) => user.id);
  store.activeListingUsers = [...store.sessionUsers];
  must(store.users[1]).role = "admin";
  const before = structuredClone({ users: store.users, sessions: store.sessionUsers, listings: store.activeListingUsers });
  await expect(runTesterAccounts(store, options("remove", [account(), account(2)])))
    .rejects.toThrow("unrelated or privileged User");
  expect({ users: store.users, sessions: store.sessionUsers, listings: store.activeListingUsers }).toEqual(before);
});

it("keeps already-purged tester removal write-free", async () => {
  const store = new FakeStore();
  store.users.push({ ...ownedUser(), phone: null, email: null, phoneVerifiedAt: null, emailVerifiedAt: null });
  const before = structuredClone(store.users);
  expect(await runTesterAccounts(store, options("remove")))
    .toEqual({ created: 0, scheduled: 0, sessionsDeleted: 0, listingsArchived: 0 });
  expect(store.users).toEqual(before);
});


it("schedules no-Session personal testers atomically without postponing an earlier date", async () => {
  const store = new FakeStore();
  const earlier = new Date("2026-10-06T00:00:00Z");
  store.users.push(ownedUser(), { ...ownedUser(2), deletionScheduledAt: earlier });
  store.activeListingUsers = [must(store.users[0]).id];
  expect(await runTesterAccounts(store, options("remove", [account(), account(2)])))
    .toEqual({ created: 0, scheduled: 1, sessionsDeleted: 0, listingsArchived: 1 });
  expect(store.users.map(user => user.deletionScheduledAt)).toEqual([NOW, earlier]);
  expect(store.activeListingUsers).toEqual([]);
  const before = structuredClone(store.users);
  expect(await runTesterAccounts(store, options("remove", [account(), account(2)])))
    .toEqual({ created: 0, scheduled: 0, sessionsDeleted: 0, listingsArchived: 0 });
  expect(store.users).toEqual(before);
});


it("cleans Sessions and active personal inventory without postponing an earlier tester schedule", async () => {
  const store = new FakeStore();
  const earlier = new Date("2026-10-06T00:00:00Z");
  store.users.push({ ...ownedUser(), deletionScheduledAt: earlier });
  store.sessionUsers = [must(store.users[0]).id];
  store.activeListingUsers = [...store.sessionUsers];
  expect(await runTesterAccounts(store, options("remove")))
    .toEqual({ created: 0, scheduled: 0, sessionsDeleted: 1, listingsArchived: 1 });
  expect(must(store.users[0]).deletionScheduledAt).toEqual(earlier);
  expect(await runTesterAccounts(store, options("remove")))
    .toEqual({ created: 0, scheduled: 0, sessionsDeleted: 0, listingsArchived: 0 });
});
