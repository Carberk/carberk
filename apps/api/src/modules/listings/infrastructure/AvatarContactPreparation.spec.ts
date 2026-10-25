import { describe, expect, it } from "vitest";
import { withCampaignPreparation, type Prisma } from "@auto-tm/db";
import { PrismaVerifiedContactPhoneRepository } from "./PrismaVerifiedContactPhoneRepository";
import { VerifiedContactPhone } from "../domain/VerifiedContactPhone";

// Database boundary only. The database rejects a write without the outer prefix.
// This proves caller integration, not PostgreSQL locking or trigger behavior.
describe("contact confirmation transaction admission", () => {
  it("stores the exact confirmation only after ordinary preparation and finish", async () => {
    const db = avatarDatabase();
    const repo = new PrismaVerifiedContactPhoneRepository(db.service);
    const confirmation = VerifiedContactPhone.create({ sellerId: "seller", phone: "+99361000000", confirmedAt: new Date("2026-10-25T00:00:00Z") });
    await expect(repo.record(confirmation)).resolves.toEqual(confirmation);
    expect(db.rows("verified_contact_phones")[0]).toMatchObject({ sellerId: "seller", phone: "+99361000000", confirmedAt: new Date("2026-10-25T00:00:00Z") });
    expect(await repo.find("seller", confirmation.phone)).toEqual(confirmation);
  });
});

import { PrismaProfilePhotoLink } from "./PrismaProfilePhotoLink";
import { PrismaUploadClaims } from "./PrismaUploadClaims";
import { PrismaBusinessContactPhoneRepository } from "./PrismaBusinessContactPhoneRepository";
import { avatarDatabase, clock, NOW, identityPorts } from "../application/testing/AvatarContactDatabase";

const bindInput = { userId: "seller", uploadId: "new", key: "new.webp", token: "token" };
const linkFor = (db: ReturnType<typeof avatarDatabase>) => new PrismaProfilePhotoLink(db.service, new PrismaUploadClaims(db.service, clock));

describe("real profile link and upload claim integration at the database boundary", () => {
  it("replaces the avatar, adopts the new claim and copies the exact old manifest to cleanup", async () => {
    const db = avatarDatabase();
    const foreign = structuredClone(db.row("media_uploads", "foreign-upload"));
    await linkFor(db).bind(bindInput);
    expect(db.row("users", "seller")).toMatchObject({ avatarUploadId: "new", avatarKey: "new.webp" });
    expect(db.row("media_uploads", "new")).toMatchObject({ state: "ADOPTED", claimToken: null });
    expect(db.row("media_uploads", "old")).toMatchObject({ state: "RETIRED", retiredAt: NOW });
    expect(db.rows("media_upload_cleanups")).toEqual([{ uploadId: "old", key: "old.webp", objectKeys: ["old.webp", "old-thumb.webp"], writeProtocol: "conditional-v1", status: "PENDING" }]);
    expect(db.row("media_uploads", "foreign-upload")).toEqual(foreign);
  });
  it("keeps a same-target adopted retry unchanged", async () => {
    const db = avatarDatabase();
    await linkFor(db).bind(bindInput);
    const before = structuredClone(db.tables);
    await linkFor(db).bind(bindInput);
    expect(db.tables).toEqual(before);
  });
  it.each(["prepare", "adopt", "retire", "cleanup", "users", "finish"])("rolls back all avatar and claim effects on %s refusal", async failAt => {
    const db = avatarDatabase();
    const before = structuredClone(db.tables);
    db.failAt = failAt;
    await expect(linkFor(db).bind(bindInput)).rejects.toThrow(`refused:${failAt}`);
    expect(db.tables).toEqual(before);
  });
  it.each(["suspendedAt", "deletionScheduledAt"])("preserves the public refusal for %s", async field => {
    const db = avatarDatabase(); db.row("users", "seller")![field] = NOW;
    const before = structuredClone(db.tables);
    await expect(linkFor(db).bind(bindInput)).rejects.toMatchObject({ status: 403 });
    expect(db.tables).toEqual(before);
  });
  it("refuses a different claim token without retiring the previous photo", async () => {
    const db = avatarDatabase(); const before = structuredClone(db.tables);
    await expect(linkFor(db).bind({ ...bindInput, token: "foreign-token" })).rejects.toMatchObject({ code: "UPLOAD_ALREADY_ATTACHED" });
    expect(db.tables).toEqual(before);
  });
  it("refuses an existing Listing adopter without any residue", async () => {
    const db = avatarDatabase(); db.seed("listing_media", { id: "media", listingId: "listing", uploadId: "new" });
    db.seed("listings", { id: "listing", sellerId: "foreign" });
    const before = structuredClone(db.tables);
    await expect(linkFor(db).bind(bindInput)).rejects.toMatchObject({ code: "UPLOAD_ALREADY_ATTACHED" });
    expect(db.tables).toEqual(before);
  });
  it("returns the removed key, keeps legacy cleanup pending and makes a second removal a no-op", async () => {
    const db = avatarDatabase(); db.row("media_uploads", "old")!["writeProtocol"] = "legacy";
    const link = linkFor(db);
    expect(await link.unbind("seller")).toBe("old.webp");
    expect(db.row("users", "seller")).toMatchObject({ avatarUploadId: null, avatarKey: null });
    expect(db.rows("media_upload_cleanups")[0]).toMatchObject({ status: "LEGACY_PENDING" });
    expect(await link.unbind("seller")).toBeNull();
    expect(await link.unbind("missing")).toBeNull();
    expect(db.rows("media_upload_cleanups")).toHaveLength(1);
  });
  it("keeps existing cleanup bytes on conflict", async () => {
    const db = avatarDatabase(); db.seed("media_upload_cleanups", { uploadId: "old", key: "retained", objectKeys: ["retained"], status: "LEGACY_PENDING" });
    await linkFor(db).unbind("seller");
    expect(db.rows("media_upload_cleanups")).toEqual([{ uploadId: "old", key: "retained", objectKeys: ["retained"], status: "LEGACY_PENDING" }]);
  });
  it("refuses caller-owned work without current preparation before locking", async () => {
    const db = avatarDatabase(); const before = structuredClone(db.tables);
    await expect(linkFor(db).unbind("seller", db)).rejects.toThrow("avatar_release_preparation_missing");
    expect(db.tables).toEqual(before);
  });
  it("preserves missing User refusal without touching claims", async () => {
    const db = avatarDatabase(); const before = structuredClone(db.tables);
    await expect(linkFor(db).bind({ ...bindInput, userId: "missing" })).rejects.toMatchObject({ response: { code: "USER_NOT_FOUND" }, status: 404 });
    expect(db.tables).toEqual(before);
  });
  it("refuses a live receipt that omits the upload and cleanup union", async () => {
    const db = avatarDatabase(); const before = structuredClone(db.tables);
    await expect(db.$transaction(tx => withCampaignPreparation(tx as unknown as Prisma.TransactionClient,
      [{ table: "users", key: { id: "seller" }, verb: "update", next: { avatarUploadId: null, avatarKey: null } }],
      () => linkFor(db).unbind("seller", tx)))).rejects.toThrow("avatar_release_preparation_uncovered");
    expect(db.tables).toEqual(before);
  });
  it("refuses a finished receipt before any supplied release write", async () => {
    const db = avatarDatabase(); const before = structuredClone(db.tables);
    await expect(db.$transaction(async tx => {
      await tx.$queryRaw`SELECT public.campaign_prepare(${JSON.stringify([{ table: "users", key: { id: "seller" }, verb: "update", next: { avatarUploadId: null, avatarKey: null } }])}::jsonb)::text AS receipt`;
      await tx.$queryRaw`SELECT public.campaign_finish(${'receipt'}::uuid)`;
      return linkFor(db).unbind("seller", tx);
    })).rejects.toThrow("avatar_release_preparation_missing");
    expect(db.tables).toEqual(before);
  });
  it("refuses changed discovery after preparation without adopting any upload", async () => {
    const db = avatarDatabase(); const before = structuredClone(db.tables);
    db.afterPreparation = () => { db.row("users", "seller")!["avatarUploadId"] = null; };
    await expect(linkFor(db).bind(bindInput)).rejects.toThrow("avatar_contact_scope_changed");
    expect(db.tables).toEqual(before);
  });
});

describe("real contact repositories at the database boundary", () => {
  const confirmation = VerifiedContactPhone.create({ sellerId: "seller", phone: "+99361000000", confirmedAt: NOW });
  it("reconfirms the existing compound slot without changing its identity and preserves read ordering", async () => {
    const db = avatarDatabase();
    db.seed("verified_contact_phones", { id: "existing", sellerId: "seller", phone: confirmation.phone, confirmedAt: new Date("2026-01-01Z") });
    db.seed("verified_contact_phones", { id: "other", sellerId: "seller", phone: "+99361000001", confirmedAt: new Date("2026-02-01Z") });
    const repo = new PrismaVerifiedContactPhoneRepository(db.service);
    expect(await repo.record(confirmation)).toEqual(confirmation);
    expect(db.rows("verified_contact_phones")).toHaveLength(2);
    expect(db.row("verified_contact_phones", "existing")).toMatchObject({ confirmedAt: NOW });
    expect(await repo.find("seller", confirmation.phone)).toEqual(confirmation);
    expect(await repo.find("seller", "absent")).toBeNull();
    expect((await repo.listBySeller("seller")).map(r => r.phone)).toEqual(["+99361000000", "+99361000001"]);
  });
  it.each(["prepare", "verified_contact_phones", "finish"])("leaves no confirmation on %s refusal", async failAt => {
    const db = avatarDatabase(); const before = structuredClone(db.tables); db.failAt = failAt;
    await expect(new PrismaVerifiedContactPhoneRepository(db.service).record(confirmation)).rejects.toThrow(`refused:${failAt}`);
    expect(db.tables).toEqual(before);
  });
  const business = () => {
    const db = avatarDatabase();
    db.seed("sessions", { id: "session", userId: "seller", expiresAt: new Date("2027-01-01Z") });
    db.seed("dealerships", { id: "business", status: "active", contactPhone: null, contactConfirmedAt: null });
    db.seed("dealership_members", { id: "member", userId: "seller", dealershipId: "business", role: "owner", status: "active" });
    const authority = identityPorts(db.service).authority;
    return { db, repo: new PrismaBusinessContactPhoneRepository(db.service, authority) };
  };
  const businessConfirmation = VerifiedContactPhone.create({ sellerId: "business", phone: "+99361000000", confirmedAt: NOW });
  const actor = { userId: "seller", sessionId: "session", businessId: "business" };
  it("allows only the freshly reloaded active OWNER and preserves the confirmed instant", async () => {
    const { db, repo } = business();
    expect(await repo.record(businessConfirmation, actor)).toEqual(businessConfirmation);
    expect(db.row("dealerships", "business")).toMatchObject({ contactPhone: "+99361000000", contactConfirmedAt: NOW });
    expect(await repo.find("business")).toEqual(businessConfirmation);
  });
  it.each([
    ["SESSION_REQUIRED", "sessions", "session", "expiresAt", new Date("2020-01-01Z")],
    ["USER_INACTIVE", "users", "seller", "suspendedAt", NOW],
    ["MEMBERSHIP_REQUIRED", "dealership_members", "member", "status", "suspended"],
    ["OWNER_REQUIRED", "dealership_members", "member", "role", "sales"],
    ["BUSINESS_INACTIVE", "dealerships", "business", "status", "recovery"],
  ])("preserves %s and writes no contact", async (reason, table, id, field, value) => {
    const { db, repo } = business(); db.row(String(table), String(id))![String(field)] = value;
    const before = structuredClone(db.tables);
    await expect(repo.record(businessConfirmation, actor)).rejects.toMatchObject({ reason });
    expect(db.tables).toEqual(before);
  });
  it("refuses an omitted Session before any transaction", async () => {
    const { db, repo } = business(); const before = structuredClone(db.tables);
    await expect(repo.record(businessConfirmation, { userId: "seller", businessId: "business" })).rejects.toThrow("Business contact requires explicit current actor");
    expect(db.tables).toEqual(before);
  });
  it.each(["prepare", "dealerships", "finish"])("rolls back Business contact on %s refusal", async failAt => {
    const { db, repo } = business(); const before = structuredClone(db.tables); db.failAt = failAt;
    await expect(repo.record(businessConfirmation, actor)).rejects.toThrow(`refused:${failAt}`);
    expect(db.tables).toEqual(before);
  });
});
