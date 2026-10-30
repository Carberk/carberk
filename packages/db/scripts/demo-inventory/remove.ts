import type { PrismaClient } from "../../generated/prisma/client/client";

import { DEMO_ID_PREFIX, holdsRealSignInMethod } from "./marker";
import { refused, type DemoInventoryResult } from "./result";
import type { ObjectStore } from "./storage";

/** Physical User DELETE has no accepted finite operation. Discover and validate
 * the full plan before any row or object removal. An empty namespace is a no-op. */
export async function removeDemoInventory(deps: {
  prisma: PrismaClient;
  storage: ObjectStore;
}): Promise<DemoInventoryResult> {
  const { prisma } = deps;

  const sellers = await prisma.user.findMany({
    where: { id: { startsWith: DEMO_ID_PREFIX } },
    select: { id: true, phone: true, email: true },
  });
  if (sellers.some(holdsRealSignInMethod)) {
    return refused("remove", "a seeded seller has gained a Sign-in Method; resolve that account by hand first");
  }
  if (sellers.length > 0) {
    return refused("remove", "unsupported physical User DELETE; account_purge requires a surviving exact erasure UPDATE and cannot cover this complete removal plan");
  }
  const counts = { sellers: 0, listings: 0, photos: 0, objects: 0, favorites: 0, conversations: 0, messages: 0, chatPhotos: 0, reports: 0, inspectionInterests: 0 };
  return { exitCode: 0, message: "Demo inventory removal: empty namespace; no change", counts };
}
