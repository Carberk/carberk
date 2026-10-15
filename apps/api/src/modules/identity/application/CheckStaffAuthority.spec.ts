import { describe, expect, it } from "vitest";
import { CheckStaffAuthority } from "./CheckStaffAuthority";
import { InMemoryStaffAuthority } from "./testing/InMemoryStaffAuthority";
const now = new Date("2026-10-15T00:00:00Z");
const subject = { userId: "person", sessionId: "session" };
function fixture() {
 const repo = new InMemoryStaffAuthority();
 repo.snapshot = { userId: "person", sessionUserId: "person", role: "buyer", suspended: false, deleting: false, expiresAt: new Date("2026-10-16T00:00:00Z"), elevatedUntil: new Date("2026-10-15T12:00:00Z"), capabilities: ["support.operations"] };
 return { repo, authority: new CheckStaffAuthority(repo, { now: () => now }) };
}
describe("current purpose-scoped staff authority", () => {
 it("admits an explicitly granted non-admin without adding moderation or another purpose", async () => {
  const { authority } = fixture();
  await expect(authority.authorize({ ...subject, capability: "support.operations" })).resolves.toBeUndefined();
  await expect(authority.authorize({ ...subject, capability: "analytics.investigate" })).rejects.toMatchObject({ reason: "CAPABILITY_REQUIRED" });
 });
 it("observes grant and session revocation on the next stale-token request", async () => {
  const { repo, authority } = fixture();
  await expect(authority.authorize({ ...subject, capability: "support.operations" })).resolves.toBeUndefined();
  repo.snapshot!.capabilities = [];
  await expect(authority.authorize({ ...subject, capability: "support.operations" })).rejects.toMatchObject({ reason: "CAPABILITY_REQUIRED" });
  repo.snapshot = null;
  await expect(authority.authorize({ ...subject, capability: "support.operations" })).rejects.toMatchObject({ reason: "SESSION_REQUIRED" });
 });
 it.each(["suspended", "deleting"] as const)("rejects a currently %s User", async (field) => {
  const { repo, authority } = fixture();repo.snapshot![field] = true;
  await expect(authority.authorize({ ...subject, capability: "support.operations" })).rejects.toMatchObject({ reason: "USER_INACTIVE" });
 });
 it("rejects another User's Session, expiry and elevation deadline", async () => {
  const { repo, authority } = fixture();repo.snapshot!.sessionUserId = "someone";
  await expect(authority.authorize({ ...subject, capability: "support.operations" })).rejects.toMatchObject({ reason: "SESSION_REQUIRED" });
  repo.snapshot!.sessionUserId = "person";repo.snapshot!.expiresAt = now;
  await expect(authority.authorize({ ...subject, capability: "support.operations" })).rejects.toMatchObject({ reason: "SESSION_REQUIRED" });
  repo.snapshot!.expiresAt = new Date("2026-10-16T00:00:00Z");repo.snapshot!.elevatedUntil = now;
  await expect(authority.authorize({ ...subject, capability: "support.operations" })).rejects.toMatchObject({ reason: "ELEVATION_REQUIRED" });
 });
 it("keeps ordinary admins and dealership membership out of private staff purposes", async () => {
  const { repo, authority } = fixture();repo.snapshot!.role = "admin";repo.snapshot!.capabilities = [];
  await expect(authority.authorize({ ...subject, capability: "support.operations" })).rejects.toMatchObject({ reason: "CAPABILITY_REQUIRED" });
 });
 it("returns only current capabilities and elevation deadline for shell setup", async () => {
  const { authority } = fixture();
  expect(await authority.summary(subject)).toEqual({ capabilities: ["support.operations"], elevated: true, adminTotpExpiresAt: "2026-10-15T12:00:00.000Z" });
 });
});
