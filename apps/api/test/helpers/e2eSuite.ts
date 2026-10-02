import { createHash, randomUUID } from "node:crypto";
import type { PrismaService } from "@auto-tm/db";

/**
 * Per-suite fixture isolation for e2e specs that share one Postgres dev stack.
 *
 * Why this exists: vitest serializes spec files inside a single process
 * (`fileParallelism: false` in apps/api/vitest.config.ts), but whole spec
 * files also run concurrently in separate processes (parallel CI jobs,
 * local `pnpm vitest run <file> &`). Hardcoded fixture IDs (brand
 * 00000000-…-0001 / slug "test-brand") and global `deleteMany()` cleanup
 * collide under that concurrency: unique-constraint violations on shared
 * IDs, and one suite wiping another suite's rows mid-test.
 *
 * Every spec file declares a unique suite slug. Entity IDs, slugs, and
 * phones derive deterministically from it (sha256), so:
 *  - no two suites can insert the same row (no shared IDs/slugs/phones),
 *  - cleanup can delete exactly the suite's own rows and nothing else,
 *  - payloads stay module-level constants (deterministic at load time).
 *
 * Cross-context state changes in fixtures (convention):
 * A suite exercises its own context through HTTP only. When a fixture needs
 * state owned by a DIFFERENT context (e.g. a listing banned by admin
 * moderation, in a suite testing favorites), the suite may short-circuit
 * with a direct prisma write scoped to its own suite's rows, instead of
 * importing the other context's module and driving its admin API. Rationale:
 *  - the owning context's own e2e suite covers the real transition end-to-end
 *    (AdminModerationController.e2e.spec.ts proves admin ban + public
 *    enforcement; the row lands in the same column these suites read),
 *  - importing the owning module would widen the suite's Nest module graph
 *    and re-test another context's behavior.
 * Two rules keep the short-circuit honest:
 *  - never use prisma to set up state the suite under test is responsible
 *    for producing (that state MUST go through HTTP), and
 *  - short-circuits touch only suite-namespaced rows, so
 *    `cleanSuiteFixtures` removes them like any other fixture row.
 */

function uuidFromKey(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex");
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

function digitsFromKey(key: string, length: number): string {
  const hex = createHash("sha256").update(key).digest("hex");
  let out = "";
  for (let i = 0; out.length < length && i + 2 <= hex.length; i += 2) {
    out += String(parseInt(hex.slice(i, i + 2), 16) % 100).padStart(2, "0");
  }
  return out.slice(0, length);
}

export interface SuiteCatalogIds {
  brandId: string;
  brandSlug: string;
  modelId: string;
  modelSlug: string;
  regionId: string;
  regionSlug: string;
  cityId: string;
  citySlug: string;
}

export interface E2eSuite {
  readonly slug: string;
  /** Deterministic UUID for a suite-local alias ("seller-1", "brand-2", …). */
  id(alias: string): string;
  /** Deterministic digits-only phone (+9936XXXXXXXX) for a suite-local alias. */
  phone(alias: string): string;
  /** Suite-unique catalog/entity slug ("<suite>-<alias>"). */
  slugFor(alias: string): string;
  /** Stable IDs + slugs for the standard brand/model/region/city fixture. */
  readonly catalog: SuiteCatalogIds;
}

export function defineE2eSuite(slug: string): E2eSuite {
  const id = (alias: string) => uuidFromKey(`e2e:${slug}:${alias}`);
  const slugFor = (alias: string) => `${slug}-${alias}`;
  return {
    slug,
    id,
    phone: (alias) => `+9936${digitsFromKey(`e2e:${slug}:phone:${alias}`, 8)}`,
    slugFor,
    catalog: {
      brandId: id("brand"),
      brandSlug: slugFor("brand"),
      modelId: id("model"),
      modelSlug: slugFor("model"),
      regionId: id("region"),
      regionSlug: slugFor("region"),
      cityId: id("city"),
      citySlug: slugFor("city"),
    },
  };
}

/**
 * Seeds the standard brand/model/region/city fixture inside the suite
 * namespace. Never collides with another suite: IDs are suite-derived and
 * slugs carry the suite prefix.
 */
export async function seedSuiteCatalog(
  prisma: PrismaService,
  suite: E2eSuite,
): Promise<SuiteCatalogIds> {
  const { catalog: c } = suite;
  await prisma.brand.create({
    data: {
      id: c.brandId,
      slug: c.brandSlug,
      nameRu: "Test Brand",
      nameTk: "Test Brand",
      nameEn: "Test Brand",
    },
  });
  await prisma.model.create({
    data: {
      id: c.modelId,
      brandId: c.brandId,
      slug: c.modelSlug,
      nameRu: "Test Model",
      nameTk: "Test Model",
      nameEn: "Test Model",
    },
  });
  await prisma.region.create({
    data: {
      id: c.regionId,
      slug: c.regionSlug,
      nameRu: "Test Region",
      nameTk: "Test Region",
      nameEn: "Test Region",
    },
  });
  await prisma.city.create({
    data: {
      id: c.cityId,
      regionId: c.regionId,
      slug: c.citySlug,
      nameRu: "Test City",
      nameTk: "Test City",
      nameEn: "Test City",
    },
  });
  return c;
}

/**
 * Stands in for the storage inspector in e2e suites that publish drafts: every
 * presigned upload "exists" as the small JPEG it declared. Override
 * `MEDIA_OBJECT_INSPECTOR` with it so no MinIO is needed.
 */
export const fakeMediaObjectInspector = {
  inspect: async () => ({ contentType: "image/jpeg", sizeBytes: 1024 }),
};

/**
 * Publication adopts only uploads the server recorded for the draft's owner
 * (ADR-0079). This records a presigned upload per photo key in `payload` and
 * returns the payload with those keys replaced by fresh, globally unique ones,
 * because `media_uploads.key` is unique across suites that share a database.
 * Photos without a key are left as they are.
 */
export async function seedPresignedPhotos(
  prisma: PrismaService,
  userId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const photos = payload["photos"];
  if (!Array.isArray(photos)) return payload;

  const seeded = await Promise.all(
    photos.map(async (photo: Record<string, unknown>) => {
      if (typeof photo["key"] !== "string") return photo;
      const key = `pending/${randomUUID()}/original.jpg`;
      await prisma.mediaUpload.create({
        data: { userId, key, kind: "image", contentType: "image/jpeg", sizeBytes: 1024 },
      });
      return { ...photo, key };
    }),
  );
  return { ...payload, photos: seeded };
}

export interface SuiteCleanupOptions {
  /** Suite-local user aliases whose users and user-owned rows get deleted. */
  userAliases: readonly string[];
  /** Raw user IDs created outside the alias scheme (e.g. literal admin IDs). */
  extraUserIds?: readonly string[];
  /** Phones used through real OTP login (users + otpRequests key on phone). */
  extraPhones?: readonly string[];
  /** reports suite only — also delete suite users' inspectionInterest rows. */
  inspectionInterests?: boolean;
  /**
   * ExchangeRate currency pairs this suite exclusively owns and may delete.
   * Pairs shared across suites must be seeded with `upsert` and never
   * deleted — they are global singleton rows keyed by (from, to).
   */
  exchangeRatePairs?: readonly {
    from: "TMT" | "USD" | "AED";
    to: "TMT" | "USD" | "AED";
  }[];
}

/**
 * Deletes ONLY rows inside the suite namespace. Concurrent suites' data is
 * untouched — the inverse of the old global `deleteMany()` cleanup.
 *
 * listingMedia, conversations, participants, messages, sessions, TOTP
 * enrollments/backup codes, favorites-on-own-listings, and inspection
 * interests cascade from the scoped listing/user deletes at the DB level.
 * auditLog/contentReport use SetNull FKs and otpRequest has no cascade, so
 * those get explicit scoped deletes.
 */
export async function cleanSuiteFixtures(
  prisma: PrismaService,
  suite: E2eSuite,
  options: SuiteCleanupOptions,
): Promise<void> {
  const userIds = [
    ...options.userAliases.map((alias) => suite.id(alias)),
    ...(options.extraUserIds ?? []),
  ];
  const phones = [
    ...options.userAliases.map((alias) => suite.phone(alias)),
    ...(options.extraPhones ?? []),
  ];
  const userScope = { OR: [{ id: { in: userIds } }, { phone: { in: phones } }] };

  await prisma.auditLog.deleteMany({ where: { actor: userScope } });
  await prisma.contentReport.deleteMany({ where: { reporter: userScope } });
  if (options.inspectionInterests) {
    await prisma.inspectionInterest.deleteMany({
      where: { requester: userScope },
    });
  }
  await prisma.favorite.deleteMany({ where: { user: userScope } });
  // Cascades listing_media + conversations (+participants/messages).
  await prisma.listing.deleteMany({ where: { seller: userScope } });
  // Uploads go after the listings: a listing_media row references its upload.
  await prisma.mediaUpload.deleteMany({ where: { user: userScope } });
  await prisma.listingDraft.deleteMany({ where: { user: userScope } });
  if (options.exchangeRatePairs) {
    for (const pair of options.exchangeRatePairs) {
      await prisma.exchangeRate.deleteMany({
        where: { fromCurrency: pair.from, toCurrency: pair.to },
      });
    }
  }
  await prisma.otpRequest.deleteMany({
    where: { channel: "phone", destination: { in: phones } },
  });
  // Cascades sessions + TOTP enrollments/backup codes.
  await prisma.user.deleteMany({ where: userScope });
  await prisma.city.deleteMany({ where: { slug: { startsWith: suite.slug } } });
  await prisma.region.deleteMany({
    where: { slug: { startsWith: suite.slug } },
  });
  await prisma.model.deleteMany({ where: { slug: { startsWith: suite.slug } } });
  await prisma.brand.deleteMany({ where: { slug: { startsWith: suite.slug } } });
}
