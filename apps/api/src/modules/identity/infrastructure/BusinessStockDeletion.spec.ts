import { describe, expect, it } from "vitest";
import type { PrismaService } from "@auto-tm/db";
import { PrismaAccountDeletionUnitOfWork } from "./PrismaAccountDeletionUnitOfWork";

describe("personal deletion preserves business stock", () => {
 it("archives personal stock while retaining active stock created for the business", async () => {
  const listings = [{ sellerId: "seller", businessId: null as string | null, status: "active", archivedByDeletion: false }, { sellerId: "seller", businessId: "business", status: "active", archivedByDeletion: false }];
  const tx = { listing: { updateMany: async ({ where, data }: { where: { sellerId: string; status: string; businessId?: null }; data: object }) => {
   for (const listing of listings) if (listing.sellerId === where.sellerId && listing.status === where.status && (where.businessId === undefined || listing.businessId === where.businessId)) Object.assign(listing, data);
  } } };
  const db = { $transaction: async (work: (transaction: typeof tx) => Promise<void>) => work(tx) };
  const deletion = new PrismaAccountDeletionUnitOfWork(db as unknown as PrismaService);
  await deletion.run(async (writes) => { await writes.archiveActiveListings("seller"); });
  expect(listings).toEqual([{ sellerId: "seller", businessId: null, status: "archived", archivedByDeletion: true }, { sellerId: "seller", businessId: "business", status: "active", archivedByDeletion: false }]);
 });
});
