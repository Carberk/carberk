import { describe, expect, it } from "vitest";
import { RecordListingView } from "./RecordListingView";
import { InMemoryListingViews } from "./testing/InMemoryListingViews";
import type { IdentityCheckPort } from "../../identity/identity.public";

const now = new Date("2026-10-14T19:00:00Z");
function fixture(admin = false) {
  const views = new InMemoryListingViews();
  const identity: IdentityCheckPort = {
    isAdmin: async () => admin, isSuspended: async () => false,
    isInDealership: async () => false, isDeletionScheduled: async () => false,
    holdsSignInPhone: async () => false,
  };
  return { views, useCase: new RecordListingView(views, identity, { now: () => now }) };
}
describe("RecordListingView", () => {
  it("keeps the same install identity when its viewer signs in", async () => {
    const { views, useCase } = fixture();
    await useCase.execute({ listingId: "car", installId: "install" });
    await useCase.execute({ listingId: "car", installId: "install", requestingUserId: "buyer" });
    expect(views.records.map((r) => r.viewerKey)).toEqual(["install:install", "install:install"]);
    expect(views.records[1]).toMatchObject({ requestingUserId: "buyer", now });
  });
  it("uses an account only when the installation is absent", async () => {
    const { views, useCase } = fixture();
    await useCase.execute({ listingId: "car", requestingUserId: "buyer" });
    expect(views.records[0]?.viewerKey).toBe("account:buyer");
  });
  it("does not record administrators or requests with neither identity", async () => {
    const { views, useCase } = fixture(true);
    await useCase.execute({ listingId: "car", installId: "install", requestingUserId: "admin" });
    await useCase.execute({ listingId: "car" });
    expect(views.records).toEqual([]);
  });
});
