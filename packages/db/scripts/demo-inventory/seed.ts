import type { PrismaClient } from "../../generated/prisma/client/client";

import { DEMO_CARS, DEMO_SELLERS, type DemoCar, type DemoSeller } from "./content";
import { DEMO_PHOTO_MANIFEST, validateDemoInventory, type DemoPhotoManifest } from "./manifest";
import {
  DEMO_ID_PREFIX,
  DEMO_OBJECT_PREFIX,
  demoListingId,
  demoMediaId,
  demoSellerPhone,
  holdsRealSignInMethod,
} from "./marker";
import { OBJECTS_PER_PHOTO, preparePhoto, type PhotoSource } from "./photos";
import { refused, type DemoInventoryResult } from "./result";
import type { ObjectStore } from "./storage";
import { createUploadQueue } from "./upload-queue";

const DAY_MS = 86_400_000;
/** Listings are published over this many days before the first run. */
const PUBLISH_WINDOW_DAYS = 30;
/** The fixed seed behind every drawn value, so a run on any machine draws the same ones. */
const RANDOM_SEED = 703;
/**
 * Stored objects uploaded at once. Photos are still loaded one at a time, as Commons asks, and
 * prepared one at a time; only the uploads to the bucket overlap.
 */
export const DEMO_UPLOAD_CONCURRENCY = 8;

/** mulberry32: a small seeded generator. `Math.random` would make two runs disagree. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Per Listing, in content order: how long before the run it was published, and its view count. */
function drawListingValues(count: number): { publishedAgoMs: number; viewCount: number }[] {
  const random = seededRandom(RANDOM_SEED);
  return Array.from({ length: count }, () => {
    const publishedAgoMs = Math.floor(random() * (PUBLISH_WINDOW_DAYS * DAY_MS - 3_600_000)) + 1_800_000;
    // Most Listings get a few hundred views and a few get thousands, as a real feed does.
    const viewCount = 18 + Math.floor(random() ** 3 * 6_200) + Math.floor((publishedAgoMs / DAY_MS) * 9);
    return { publishedAgoMs, viewCount };
  });
}

interface Catalog {
  brands: Map<string, string>;
  models: Map<string, string>;
  cities: Map<string, { id: string; regionId: string }>;
  colors: Map<string, string>;
  bodyTypes: Map<string, string>;
  engineTypes: Map<string, string>;
  transmissions: Map<string, string>;
  driveTypes: Map<string, string>;
  ratesToTmt: Map<string, number>;
}

/** Reference tables other than brand, model and city have no unique name; the first row wins. */
function byNameEn(rows: readonly { id: string; nameEn: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!map.has(row.nameEn)) map.set(row.nameEn, row.id);
  }
  return map;
}

async function loadCatalog(prisma: PrismaClient): Promise<Catalog> {
  const select = { id: true, nameEn: true } as const;
  const [brands, models, cities, colors, bodyTypes, engineTypes, transmissions, driveTypes, rates] =
    await Promise.all([
      prisma.brand.findMany({ select: { id: true, slug: true } }),
      prisma.model.findMany({ select: { id: true, slug: true, brand: { select: { slug: true } } } }),
      prisma.city.findMany({ select: { id: true, slug: true, regionId: true, region: { select: { slug: true } } } }),
      prisma.color.findMany({ select, orderBy: { id: "asc" } }),
      prisma.bodyType.findMany({ select, orderBy: { id: "asc" } }),
      prisma.engineType.findMany({ select, orderBy: { id: "asc" } }),
      prisma.transmission.findMany({ select, orderBy: { id: "asc" } }),
      prisma.driveType.findMany({ select, orderBy: { id: "asc" } }),
      prisma.exchangeRate.findMany({ where: { toCurrency: "TMT", rate: { gt: 0 } } }),
    ]);
  return {
    brands: new Map(brands.map((brand) => [brand.slug, brand.id])),
    models: new Map(models.map((model) => [`${model.brand.slug}/${model.slug}`, model.id])),
    cities: new Map(cities.map((city) => [`${city.region.slug}/${city.slug}`, { id: city.id, regionId: city.regionId }])),
    colors: byNameEn(colors),
    bodyTypes: byNameEn(bodyTypes),
    engineTypes: byNameEn(engineTypes),
    transmissions: byNameEn(transmissions),
    driveTypes: byNameEn(driveTypes),
    ratesToTmt: new Map(rates.map((rate) => [rate.fromCurrency, rate.rate])),
  };
}

interface ResolvedCar {
  brandId: string;
  modelId: string;
  cityId: string;
  regionId: string;
  colorId: string;
  bodyTypeId: string;
  engineTypeId: string;
  transmissionId: string;
  driveTypeId: string;
}

/** Resolves every catalog reference of every car, or lists what the catalog lacks. */
function resolveCars(cars: readonly DemoCar[], catalog: Catalog): { resolved: ResolvedCar[]; missing: string[] } {
  const missing: string[] = [];
  const need = (map: Map<string, string>, key: string, what: string): string => {
    const id = map.get(key);
    if (!id) missing.push(`${what} ${key}`);
    return id ?? "";
  };
  const resolved = cars.map((car) => {
    const city = catalog.cities.get(`${car.regionSlug}/${car.citySlug}`);
    if (!city) missing.push(`city ${car.regionSlug}/${car.citySlug}`);
    return {
      brandId: need(catalog.brands, car.brandSlug, "brand"),
      modelId: need(catalog.models, `${car.brandSlug}/${car.modelSlug}`, "model"),
      cityId: city?.id ?? "",
      regionId: city?.regionId ?? "",
      colorId: need(catalog.colors, car.colorEn, "colour"),
      bodyTypeId: need(catalog.bodyTypes, car.bodyTypeEn, "body type"),
      engineTypeId: need(catalog.engineTypes, car.engineTypeEn, "engine type"),
      transmissionId: need(catalog.transmissions, car.transmissionEn, "transmission"),
      driveTypeId: need(catalog.driveTypes, car.driveTypeEn, "drive type"),
    };
  });
  return { resolved, missing: [...new Set(missing)] };
}

/**
 * Creates or converges the demo inventory: the demo sellers, their active Listings, each Listing's
 * media rows and the stored photo objects.
 *
 * A rerun converges. Every row has a fixed id (see `marker.ts`) and is upserted, so nothing is
 * duplicated, and a Listing, media row or object the content no longer lists is removed. A rerun
 * leaves `publishedAt` and `viewCount` as the first run set them, so the feed order does not jump
 * and views collected since are kept.
 *
 * Nobody can sign in as a demo seller: its only Sign-in Method is a phone tombstone the API never
 * accepts (`demoSellerPhone`). Their Listings carry no contact phone and have calls off and chat
 * on: under ADR-0081 a Listing may only show a number its seller proved can receive codes, and
 * the tombstone is not a number.
 *
 * It writes no audit row, so removal has nothing outside the marker to find.
 */
export async function seedDemoInventory(deps: {
  prisma: PrismaClient;
  storage: ObjectStore;
  photos: PhotoSource;
  now: Date;
  log?: (line: string) => void;
  sellers?: readonly DemoSeller[];
  cars?: readonly DemoCar[];
  manifest?: DemoPhotoManifest;
}): Promise<DemoInventoryResult> {
  const { prisma, storage, photos, now, log = () => {} } = deps;
  const sellers = deps.sellers ?? DEMO_SELLERS;
  const cars = deps.cars ?? DEMO_CARS;
  const manifest = deps.manifest ?? DEMO_PHOTO_MANIFEST;

  const problems = validateDemoInventory(cars, manifest);
  if (problems.length > 0) return refused("seed", `the photo manifest is incomplete (${problems[0]})`);
  const sellerKeys = new Set(sellers.map((seller) => seller.key));
  const orphan = cars.find((car) => !sellerKeys.has(car.sellerKey));
  if (orphan) return refused("seed", `${orphan.slug} names a seller that is not listed`);

  const held = await prisma.user.findMany({
    where: { id: { startsWith: DEMO_ID_PREFIX } },
    select: { id: true, phone: true, email: true, role: true },
  });
  if (held.some(holdsRealSignInMethod)) {
    return refused("seed", "a seeded seller has gained a Sign-in Method");
  }
  if (held.some((user) => user.role !== "seller" && user.role !== "buyer")) {
    return refused("seed", "a seeded seller has become privileged");
  }

  const catalog = await loadCatalog(prisma);
  const { resolved, missing } = resolveCars(cars, catalog);
  if (missing.length > 0) {
    return refused("seed", `the catalog is missing ${missing.slice(0, 5).join(", ")}; seed the catalog first`);
  }

  for (const seller of sellers) {
    const data = {
      phone: demoSellerPhone(seller.id),
      phoneVerifiedAt: new Date(seller.memberSince),
      email: null,
      emailVerifiedAt: null,
      displayName: seller.displayName,
      nameNumber: seller.nameNumber,
      avatarIndex: seller.avatarIndex,
      locale: seller.locale,
      role: "seller" as const,
      createdAt: new Date(seller.memberSince),
    };
    await prisma.user.upsert({ where: { id: seller.id }, update: data, create: { id: seller.id, ...data } });
  }
  const sellerIds = new Map(sellers.map((seller) => [seller.key, seller.id]));

  const drawn = drawListingValues(cars.length);
  const expectedKeys = new Set<string>();
  const uploads = createUploadQueue(DEMO_UPLOAD_CONCURRENCY);
  let photoCount = 0;

  for (const [index, car] of cars.entries()) {
    const id = demoListingId(index);
    const reference = resolved[index];
    const draw = drawn[index];
    const entry = manifest.listings[car.slug];
    const sellerId = sellerIds.get(car.sellerKey);
    // The checks above cover all four; this narrows them for the compiler.
    if (!reference || !draw || !entry || !sellerId) throw new Error(`Demo car ${car.slug} is incomplete`);

    // Upload first: a media row whose object is missing renders an empty frame. Every upload of
    // this Listing has finished before its rows are written.
    const media: { id: string; key: string; sortOrder: number; width: number; height: number }[] = [];
    try {
      for (const [order, photo] of entry.photos.entries()) {
        const base = `${DEMO_OBJECT_PREFIX}${car.slug}/${String(order + 1).padStart(2, "0")}`;
        const prepared = await preparePhoto(await photos.load(photo));
        for (const file of prepared.files) {
          const key = `${base}/${file.name}.jpg`;
          await uploads.add(() => storage.put(key, file.body, "image/jpeg"));
          expectedKeys.add(key);
        }
        media.push({
          id: demoMediaId(index, order),
          key: `${base}/original.jpg`,
          sortOrder: order,
          width: prepared.width,
          height: prepared.height,
        });
      }
    } catch (error) {
      // A photo that failed to load or prepare: let the uploads in flight finish, then report it.
      await uploads.drain().catch(() => undefined);
      throw error;
    }
    await uploads.drain();
    photoCount += media.length;

    const rate = car.priceCurrency === "TMT" ? 1 : catalog.ratesToTmt.get(car.priceCurrency);
    const fields = {
      sellerId,
      status: "active" as const,
      ...reference,
      year: car.year,
      mileageKm: car.mileageKm,
      priceAmount: car.priceAmount,
      priceCurrency: car.priceCurrency,
      // The stored TMT price behind feed price sort (ADR-0061): amount times the current rate.
      priceTmt: rate === undefined ? null : car.priceAmount * rate,
      description: car.description,
      deletedAt: null,
      condition: car.condition,
      enginePower: car.enginePower,
      contactPhone: null,
      allowCalls: false,
      allowChat: true,
      acceptsExchange: car.acceptsExchange,
      installmentAvailable: car.installmentAvailable,
      damaged: car.damaged,
      knownIssuesText: car.knownIssuesText ?? null,
    };
    await prisma.listing.upsert({
      where: { id },
      update: fields,
      create: {
        id,
        ...fields,
        publishedAt: new Date(now.getTime() - draw.publishedAgoMs),
        viewCount: draw.viewCount,
      },
    });
    await prisma.listingMedia.deleteMany({ where: { listingId: id, id: { notIn: media.map((row) => row.id) } } });
    for (const row of media) {
      const data = { listingId: id, kind: "image" as const, key: row.key, sortOrder: row.sortOrder, width: row.width, height: row.height };
      await prisma.listingMedia.upsert({ where: { id: row.id }, update: data, create: { id: row.id, ...data } });
    }
    log(`${String(index + 1).padStart(2)}/${cars.length} ${car.slug}: ${media.length} photos`);
  }

  // Converge: drop what an earlier run seeded and the content no longer lists.
  const listingIds = cars.map((_, index) => demoListingId(index));
  await prisma.listing.deleteMany({
    where: { sellerId: { startsWith: DEMO_ID_PREFIX }, id: { notIn: listingIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { startsWith: DEMO_ID_PREFIX, notIn: sellers.map((seller) => seller.id) } },
  });
  const stale = (await storage.list(DEMO_OBJECT_PREFIX)).filter((key) => !expectedKeys.has(key));
  await storage.remove(stale);

  const counts = {
    sellers: sellers.length,
    listings: cars.length,
    photos: photoCount,
    objects: photoCount * OBJECTS_PER_PHOTO,
  };
  return {
    exitCode: 0,
    message: `Demo inventory converged ${counts.sellers} sellers, ${counts.listings} Listings, ${counts.photos} photos and ${counts.objects} stored objects`,
    counts,
  };
}
