import { describe, expect, it } from "vitest";
import { CheckBusinessAuthority } from "./CheckBusinessAuthority";
import { InMemoryBusinessAuthority } from "./testing/InMemoryBusinessAuthority";
const subject = { userId: "user", sessionId: "session", businessId: "business" };
const now = new Date("2026-10-15T00:00:00Z");
function fixture() {
 const repository = new InMemoryBusinessAuthority();
 repository.snapshot = { userId: "user", expiresAt: new Date("2026-10-16T00:00:00Z"), suspended: false, deleting: false,
 membership: { id: "member", businessId: "business", role: "sales", active: true, status: "active" } };
 return { repository, authority: new CheckBusinessAuthority(repository, { now: () => now }) };
}
describe("explicit current personal/business principal", () => {
 it("keeps personal context explicit even when the User belongs to a business", async () => {
  const { authority } = fixture();
  expect(await authority.resolve({ userId: "user", sessionId: "session" })).toEqual({ kind: "personal", userId: "user" });
  expect(await authority.authorize(subject)).toEqual({ kind: "business", userId: "user", businessId: "business", membershipId: "member", role: "sales", status: "active" });
  await expect(authority.authorize({ ...subject, owner: true })).rejects.toMatchObject({ reason: "OWNER_REQUIRED" });
 });
 it("observes removed and suspended membership without refreshing a token", async () => {
  const { repository, authority } = fixture();
  repository.snapshot!.membership!.active = false;
  await expect(authority.authorize(subject)).rejects.toMatchObject({ reason: "MEMBERSHIP_REQUIRED" });
  repository.snapshot!.membership = null;
  await expect(authority.authorize(subject)).rejects.toMatchObject({ reason: "MEMBERSHIP_REQUIRED" });
 });
 it.each(["suspended", "recovery"] as const)("preserves authorized history while blocking writes for a %s business", async (status) => {
  const { repository, authority } = fixture(); repository.snapshot!.membership!.status = status;
  await expect(authority.authorize(subject)).rejects.toMatchObject({ reason: "BUSINESS_INACTIVE" });
  expect(await authority.authorize({ ...subject, history: true })).toMatchObject({ status });
 });
 it.each(["suspended", "deleting"] as const)("denies all contexts and history for a currently %s User", async (field) => {
  const { repository, authority } = fixture(); repository.snapshot![field] = true;
  await expect(authority.authorize({ ...subject, history: true })).rejects.toMatchObject({ reason: "USER_INACTIVE" });
  await expect(authority.resolve({ userId: "user", sessionId: "session" })).rejects.toMatchObject({ reason: "USER_INACTIVE" });
 });
 it("rejects another session holder, expired session, missing session and another business", async () => {
  const { repository, authority } = fixture();
  await expect(authority.authorize({ ...subject, businessId: "another" })).rejects.toMatchObject({ reason: "MEMBERSHIP_REQUIRED" });
  repository.snapshot!.userId = "another";
  await expect(authority.authorize(subject)).rejects.toMatchObject({ reason: "SESSION_REQUIRED" });
  repository.snapshot!.userId = "user"; repository.snapshot!.expiresAt = now;
  await expect(authority.authorize(subject)).rejects.toMatchObject({ reason: "SESSION_REQUIRED" });
  repository.snapshot = null;
  await expect(authority.authorize(subject)).rejects.toMatchObject({ reason: "SESSION_REQUIRED" });
 });
});
