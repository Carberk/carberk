import { describe, expect, it } from "vitest";
import { PrismaUploadClaims } from "./PrismaUploadClaims";
import { ClaimDatabase } from "../application/testing/UploadClaimsDatabase";

const now = new Date("2026-10-25T12:00:00Z");
const target = { type: "listing" as const, id: "new-listing" };
const held = { state: "PREPARING", claimToken: "token", claimTargetType: "listing", claimTargetId: "new-listing", claimDeadline: "2026-10-25T12:10:00Z" };
function setup() { const db = new ClaimDatabase(); return { db, claims: new PrismaUploadClaims(db.prisma, { now: () => now }) }; }

describe("upload claim transaction preparation", () => {
  it("reserves the complete batch before any managed lock and keeps the clock deadline", async () => {
    const { db, claims } = setup(); db.upload(); db.upload("upload-2");
    const result = await claims.reserve({ userId: "owner", uploadIds: ["upload-2", "upload-1"], target });
    expect(result).toMatchObject({ joined: false });
    expect(db.tables["media_uploads"]!.map(r => [r["state"], r["claimDeadline"]])).toEqual([["PREPARING", new Date("2026-10-25T12:10:00Z")], ["PREPARING", new Date("2026-10-25T12:10:00Z")]]);
    expect(db.finished).toBe(1);
  });
  it("prepares recursive target User endpoints before reserving", async () => {
    const { db, claims } = setup(); db.upload();
    db.tables["users"]?.push({ id: "target", avatarUploadId: null, suspendedById: "suspender" },
      { id: "suspender", avatarUploadId: null });
    await claims.reserve({ userId: "owner", uploadIds: ["upload-1"], target: { type: "profile", id: "target" } });
    expect(db.prepared).toContainEqual({ table: "users", key: { id: "suspender" }, verb: "update", next: {} });
    expect(db.finished).toBe(1);
  });
  it("abandons all token rows with their exact independent manifests", async () => {
    const { db, claims } = setup(); db.upload("upload-1", held); db.upload("upload-2", { ...held, writeProtocol: "legacy", objectKeys: ["legacy/exact"] }); db.upload("foreign", { ...held, claimToken: "foreign" });
    await claims.abandon("token");
    expect(db.tables["media_upload_cleanups"]).toEqual([
      { uploadId: "upload-1", key: "pending/upload-1/original.webp", objectKeys: ["pending/upload-1/original.webp"], writeProtocol: "conditional-v1", status: "PENDING" },
      { uploadId: "upload-2", key: "pending/upload-2/original.webp", objectKeys: ["legacy/exact"], writeProtocol: "legacy", status: "LEGACY_PENDING" },
    ]);
    expect(db.tables["media_uploads"]![2]).toMatchObject({ id: "foreign", state: "PREPARING", claimToken: "foreign" });
  });
  it("refuses changed stored owners after a preparation wait without replay", async () => {
    const { db, claims } = setup(); db.upload(); db.afterWait = () => { db.tables["media_uploads"]![0]!["userId"] = "foreign"; };
    await expect(claims.reserve({ userId: "owner", uploadIds: ["upload-1"], target })).rejects.toThrow("upload_claim_scope_changed");
    expect(db.tables["media_uploads"]![0]).toMatchObject({ state: "AVAILABLE", claimToken: null });
  });
  it.each(["finalize", "retire"] as const)("refuses an unprepared supplied %s before locks", async method => {
    const { db, claims } = setup(); db.upload("upload-1", held);
    const action = method === "retire" ? claims.retire(db.tx, "upload-1") : claims.finalize(db.tx, { token: "token", uploadIds: ["upload-1"], target });
    await expect(action).rejects.toThrow("upload_claim_preparation_missing");
    expect(db.tables["media_uploads"]![0]!["state"]).toBe("PREPARING");
  });
  it.each([
    ["missing", undefined, "UPLOAD_NOT_AVAILABLE"],
    ["foreign", { userId: "stranger" }, "UPLOAD_NOT_AVAILABLE"],
    ["business stock", { businessId: "business" }, "UPLOAD_NOT_AVAILABLE"],
    ["retired", { state: "RETIRED" }, "UPLOAD_NOT_AVAILABLE"],
    ["deleted", { state: "DELETED" }, "UPLOAD_NOT_AVAILABLE"],
    ["other target", { ...held, claimTargetId: "other" }, "UPLOAD_ALREADY_ATTACHED"],
    ["adopted elsewhere", { ...held, state: "ADOPTED", claimTargetId: "other" }, "UPLOAD_ALREADY_ATTACHED"],
  ] as const)("reserve refuses %s and preserves the batch", async (_reason, patch, code) => {
    const { db, claims } = setup(); db.upload("good");
    if (patch) db.upload("upload-1", patch);
    const before = structuredClone(db.tables);
    await expect(claims.reserve({ userId: "owner", uploadIds: ["good", "upload-1"], target })).rejects.toMatchObject({ code });
    expect(db.tables).toEqual(before);
  });
  it.each(["users", "listing_media"] as const)("reserve refuses a legacy %s adopter", async table => {
    const { db, claims } = setup(); db.upload();
    db.tables[table]?.push({ id: "adopter", ...(table === "users" ? { avatarUploadId: "upload-1" } : { uploadId: "upload-1", listingId: "other" }) });
    await expect(claims.reserve({ userId: "owner", uploadIds: ["upload-1"], target })).rejects.toMatchObject({ code: "UPLOAD_ALREADY_ATTACHED" });
    expect(db.tables["media_uploads"]?.[0]).toMatchObject({ state: "AVAILABLE" });
  });
  it("joins a same-target retry without replacing its token or deadline", async () => {
    const { db, claims } = setup(); db.upload("upload-1", held);
    expect(await claims.reserve({ userId: "owner", uploadIds: ["upload-1", "upload-1"], target })).toEqual({ token: "token", joined: true });
    expect(db.tables["media_uploads"]?.[0]).toMatchObject(held);
  });
  it("recognizes the already-adopted same target", async () => {
    const { db, claims } = setup(); db.upload("upload-1", { ...held, state: "ADOPTED", claimToken: null });
    expect(await claims.reserve({ userId: "owner", uploadIds: ["upload-1"], target })).toEqual({ alreadyAdopted: true });
  });
  it("releases only current token rows and a second release is a noop", async () => {
    const { db, claims } = setup(); db.upload("upload-1", held); db.upload("upload-2", held); db.upload("foreign", { ...held, claimToken: "other" }); db.upload("adopted", { ...held, state: "ADOPTED" });
    const foreign = structuredClone(db.tables["media_uploads"]?.slice(2));
    await claims.release("token"); await claims.release("token");
    expect(db.tables["media_uploads"]?.slice(0,2)).toEqual([
      expect.objectContaining({ state: "AVAILABLE", claimToken: null, claimDeadline: null, claimTargetType: null, claimTargetId: null }),
      expect.objectContaining({ state: "AVAILABLE", claimToken: null, claimDeadline: null, claimTargetType: null, claimTargetId: null }),
    ]);
    expect(db.tables["media_uploads"]?.slice(2)).toEqual(foreign);
    expect(db.tables["media_upload_cleanups"]).toEqual([]);
  });
  it("settles one failed photo, releases its siblings and is then a noop", async () => {
    const { db, claims } = setup(); db.upload("upload-1", held); db.upload("upload-2", held); db.upload("foreign", { ...held, claimToken: "other" });
    expect(await claims.settle("token", "upload-1")).toBe(true);
    expect(await claims.settle("token", "upload-1")).toBe(false);
    expect(db.tables["media_uploads"]?.map(r => [r["id"],r["state"]])).toEqual([["upload-1","RETIRED"],["upload-2","AVAILABLE"],["foreign","PREPARING"]]);
    expect(db.tables["media_upload_cleanups"]).toHaveLength(1);
  });
  it("does not release siblings when settle's failed photo belongs to another token", async () => {
    const { db, claims } = setup(); db.upload("upload-1", held); db.upload("foreign", { ...held, claimToken: "other" });
    const before = structuredClone(db.tables);
    expect(await claims.settle("token", "foreign")).toBe(false);
    expect(db.tables).toEqual(before);
  });
  it.each(["abandon", "release", "settle"] as const)("%s refuses an expanded token selection after waits", async method => {
    const { db, claims } = setup(); db.upload("upload-1", held);
    db.afterWait = () => { db.upload("late", held); };
    await expect(method === "settle" ? claims.settle("token", "upload-1") : claims[method]("token")).rejects.toThrow("upload_claim_scope_changed");
    expect(db.tables["media_uploads"]?.[0]).toMatchObject(held);
    expect(db.tables["media_upload_cleanups"]).toEqual([]);
  });
  it.each(["abandon", "settle"] as const)("rolls back partial %s and cleanup failure without changing foreign bytes", async method => {
    const { db, claims } = setup(); db.upload("upload-1", held); db.upload("upload-2", held); db.upload("foreign", { ...held, claimToken: "other" });
    const before = structuredClone(db.tables); db.failWrite = 2;
    await expect(method === "settle" ? claims.settle("token", "upload-1") : claims.abandon("token")).rejects.toThrow("claim_write_sentinel");
    expect(db.tables).toEqual(before);
  });
  it("rolls back a claim update failure", async () => {
    const { db, claims } = setup(); db.upload(); const before = structuredClone(db.tables); db.failWrite = 1;
    await expect(claims.reserve({ userId: "owner", uploadIds: ["upload-1"], target })).rejects.toThrow("claim_write_sentinel");
    expect(db.tables).toEqual(before);
  });
  it.each([
    ["missing", undefined, true], ["foreign", { userId: "stranger" }, true],
    ["held", held, true], ["adopted", { ...held, state: "ADOPTED" }, true],
    ["retired", { state: "RETIRED" }, true], ["deleted", { state: "DELETED" }, true],
    ["missing bytes", {}, false], ["empty bytes", {}, false], ["corrected bytes", {}, false],
  ] as const)("retireUnclaimed preserves %s", async (_reason, patch, invalid) => {
    const { db, claims } = setup(); if (patch) db.upload("upload-1", patch);
    const before = structuredClone(db.tables);
    expect(await claims.retireUnclaimed("upload-1", "owner", async () => invalid)).toBe(false);
    expect(db.tables).toEqual(before);
  });
  it("retires a positively invalid unclaimed upload exactly once", async () => {
    const { db, claims } = setup(); db.upload();
    expect(await claims.retireUnclaimed("upload-1", "owner", async () => true)).toBe(true);
    expect(await claims.retireUnclaimed("upload-1", "owner", async () => true)).toBe(false);
    expect(db.tables["media_uploads"]?.[0]).toMatchObject({ state: "RETIRED", retiredAt: now });
    expect(db.tables["media_upload_cleanups"]).toHaveLength(1);
  });
  it.each(["ordinary", "source"] as const)("finalize reuses a live %s receipt with no nested finish", async kind => {
    const { db, claims } = setup(); db.upload("upload-1", held); db.supplied = kind;
    expect(await claims.finalize(db.tx, { token: "token", uploadIds: ["upload-1"], target })).toBe("adopted");
    expect(await claims.finalize(db.tx, { token: "token", uploadIds: ["upload-1"], target })).toBe("already");
    expect(db.tables["media_uploads"]?.[0]).toMatchObject({ state: "ADOPTED", claimToken: null, claimDeadline: null });
    expect(db.finished).toBe(0);
    expect(db.prepared).toEqual([]);
  });
  it.each(["ordinary", "source"] as const)("retire reuses a live %s receipt and preserves existing cleanup bytes", async kind => {
    const { db, claims } = setup(); db.upload("upload-1", held); db.supplied = kind;
    db.tables["media_upload_cleanups"]?.push({ uploadId: "upload-1", key: "prior/exact", objectKeys: ["prior/exact"], status: "DONE" });
    expect(await claims.retire(db.tx, "upload-1")).toBe(true);
    expect(await claims.retire(db.tx, "upload-1")).toBe(false);
    expect(db.tables["media_upload_cleanups"]).toEqual([{ uploadId: "upload-1", key: "prior/exact", objectKeys: ["prior/exact"], status: "DONE" }]);
    expect(db.finished).toBe(0);
  });
  it.each(["wrong token", "wrong target", "missing upload", "retired reference", "missing reference", "existing adopter"])("finalize refuses %s with complete supplied coverage", async reason => {
    const { db, claims } = setup(); db.supplied = "ordinary";
    if (reason !== "missing upload") db.upload("upload-1", held);
    if (reason === "retired reference") db.upload("reference", { state: "RETIRED" });
    if (reason === "existing adopter") db.tables["users"]?.push({ id: "adopter", avatarUploadId: "upload-1" });
    const before = structuredClone(db.tables);
    await expect(claims.finalize(db.tx, { token: reason === "wrong token" ? "other" : "token", uploadIds: ["upload-1"], target: reason === "wrong target" ? { ...target, id: "other" } : target,
      ...(reason.includes("reference") ? { referencedUploadIds: ["reference"] } : {}) })).rejects.toMatchObject({ code: reason.includes("missing") || reason === "retired reference" ? "UPLOAD_NOT_AVAILABLE" : "UPLOAD_ALREADY_ATTACHED" });
    expect(db.tables).toEqual(before);
  });
  it("finalize includes a live referring upload without adopting it", async () => {
    const { db, claims } = setup(); db.upload("upload-1", held); db.upload("reference"); db.supplied = "source";
    expect(await claims.finalize(db.tx, { token: "token", uploadIds: ["upload-1"], target, referencedUploadIds: ["reference"] })).toBe("adopted");
    expect(db.tables["media_uploads"]?.[1]).toMatchObject({ id: "reference", state: "AVAILABLE" });
  });
  it.each(["finalize", "retire"] as const)("%s refuses uncovered supplied preparation without writing", async method => {
    const { db, claims } = setup(); db.upload("upload-1", held); db.supplied = "ordinary"; db.covered = false;
    const before = structuredClone(db.tables);
    await expect(method === "retire" ? claims.retire(db.tx, "upload-1") : claims.finalize(db.tx, { token: "token", uploadIds: ["upload-1"], target })).rejects.toThrow("upload_claim_preparation_uncovered");
    expect(db.tables).toEqual(before);
  });

  it.each(["target appears", "stored target changes", "adopter appears", "Session changes", "membership changes"])("refuses fresh graph change: %s",async reason=>{
    const { db,claims }=setup();db.upload();
    db.tables["sessions"]=[{id:"session",userId:"owner",expiresAt:"2026-10-26T00:00:00Z"}];
    db.tables["dealership_members"]=[{id:"member",userId:"owner",dealershipId:"business",role:"owner",status:"active"}];
    db.tables["dealerships"]=[{id:"business",status:"active"}];
    db.afterWait=()=>{
      if(reason==="target appears") db.tables["listings"]=[{id:"new-listing",sellerId:"owner",businessId:null}];
      if(reason==="stored target changes") { const upload=db.tables["media_uploads"]?.[0];if(upload)upload["claimTargetId"]="other"; }
      if(reason==="adopter appears") db.tables["listing_media"]?.push({id:"adopter",listingId:"other",uploadId:"upload-1"});
      if(reason==="Session changes") db.tables["sessions"]=[{id:"session",userId:"other",expiresAt:"2026-10-26T00:00:00Z"}];
      if(reason==="membership changes") db.tables["dealership_members"]=[];
    };
    await expect(claims.reserve({userId:"owner",sessionId:"session",...(reason==="membership changes"?{businessId:"business"}:{}),uploadIds:["upload-1"],target})).rejects.toThrow("upload_claim_scope_changed");
    expect(db.tables["media_uploads"]?.[0]).toMatchObject({state:"AVAILABLE",claimToken:null});
    expect(db.tables["media_upload_cleanups"]).toEqual([]);
  });

});
