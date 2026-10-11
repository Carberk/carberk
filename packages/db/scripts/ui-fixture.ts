/**
 * UI evaluation fixture for localhost or the guarded native PR seed.
 *
 * Creates the content the mobile UI needs in order to be reviewable on an
 * emulator: a populated feed of active listings with real car photographs,
 * varied specs and reference data, all three currencies, photo objects in
 * MinIO at the variant paths GetListingDetail expects, favourites, and
 * conversations with message history. Idempotent — re-running replaces the
 * fixture rows.
 *
 * Photos come from `fixture-photos.ts` (Wikimedia Commons, CC-licensed). They
 * are downloaded at run time into a gitignored cache, never committed. Each
 * listing's model, colour, body type and drivetrain were written to match what
 * its photograph actually shows, so the feed reads as real inventory rather
 * than lorem-ipsum rows.
 *
 * Two ways to run it, both decided by the shared guard in
 * `native-pr-seed-guard.cjs` before anything connects:
 *
 *  - Default: a local developer tool. DATABASE_URL and MINIO_ENDPOINT must be on
 *    localhost.
 *      pnpm --filter @auto-tm/db ui:fixture
 *  - `--railway-pr`: one step of `native:seed --remote`, which runs this script
 *    inside the Railway PR API container (ADR-0075). The guard requires that
 *    environment's identity, mock SMS, its private Postgres and MinIO, and its
 *    own public media host.
 *
 * Besides the brand-logo importer, which also downloads Commons masters, this
 * is the only script in the repo that reaches an outside host
 * (upload.wikimedia.org / thumb.wikimedia.org), for the photo downloads: the
 * fixture downloads covered by ADR-0075, not deployment egress.
 */
// Keep this import first. It loads `.env` and refuses an unsafe target before any other module
// (generated Prisma client, sharp, S3) is loaded.
// eslint-disable-next-line import/order
import { DATABASE_URL, MINIO_ENDPOINT } from "./ui-fixture-target";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import sharp from "sharp";

import { PrismaClient } from "../generated/prisma/client/client";
import {
  Currency,
  ListingCondition,
  ListingStatus,
  MediaKind,
  MessageKind,
  UserRole,
} from "../generated/prisma/client/enums";
import { recomputeListingPricesTmt } from "../src/listing-prices";

import { FIXTURE_PHOTOS } from "./fixture-photos";

const PHOTO_BUCKET = "listing-photos";

/** Downloaded originals live here so re-runs don't re-fetch from Commons. */
const PHOTO_CACHE = path.join(__dirname, "../node_modules/.cache/fixture-photos");

const VARIANTS = ["thumbnail", "list", "detail", "fullscreen"] as const;
const VARIANT_WIDTHS: Record<(typeof VARIANTS)[number], number> = {
  thumbnail: 160,
  list: 400,
  detail: 800,
  fullscreen: 1600,
};

const pool = new Pool({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const s3 = new S3Client({
  endpoint: MINIO_ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env["MINIO_ACCESS_KEY"] ?? "minioadmin",
    secretAccessKey: process.env["MINIO_SECRET_KEY"] ?? "minioadmin",
  },
});

/** Fetches a photo once and caches it on disk. */
async function loadPhoto(slug: string): Promise<Buffer> {
  const photo = FIXTURE_PHOTOS[slug];
  if (!photo) throw new Error(`Unknown fixture photo: ${slug}`);

  const cached = path.join(PHOTO_CACHE, `${slug}.jpg`);
  try {
    return await readFile(cached);
  } catch {
    // Not cached yet — fall through to the network.
  }

  const response = await fetch(photo.url, {
    headers: {
      // Commons rejects requests without a descriptive agent.
      "User-Agent": "auto.tm-dev-fixture/1.0 (local UI evaluation)",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${slug}: HTTP ${response.status}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  await mkdir(PHOTO_CACHE, { recursive: true });
  await writeFile(cached, body);
  return body;
}

/**
 * Writes original.webp plus every variant for one media key, so both the feed
 * (list.webp) and the detail gallery (detail/fullscreen) resolve.
 *
 * Variants are resized from the real photograph rather than generated, so the
 * UI is evaluated against the aspect ratios and detail levels it will see in
 * production — a flat colour block hides cropping and letterboxing bugs.
 */
async function uploadPhotoSet(
  baseKey: string,
  slug: string,
): Promise<{ width: number; height: number }> {
  const source = await loadPhoto(slug);
  const meta = await sharp(source).metadata();

  for (const variant of [...VARIANTS, "original"] as const) {
    const width =
      variant === "original"
        ? 1600
        : VARIANT_WIDTHS[variant as (typeof VARIANTS)[number]];
    const body = await sharp(source)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    await s3.send(
      new PutObjectCommand({
        Bucket: PHOTO_BUCKET,
        Key: `${baseKey}/${variant}.webp`,
        Body: body,
        ContentType: "image/webp",
      }),
    );
  }

  return { width: meta.width ?? 1600, height: meta.height ?? 1200 };
}

/**
 * One fixture listing.
 *
 * `photos` are slugs from FIXTURE_PHOTOS in gallery order; the first is the
 * cover the feed renders. `colorEn` / `bodyTypeEn` describe the car in the
 * photograph, not an arbitrary choice — a silver car must not be filed under
 * "Blue" or the feed's colour chips become nonsense during review.
 */
type FixtureCar = {
  readonly slug: string;
  readonly brandEn: string;
  readonly modelEn: string;
  readonly year: number;
  readonly mileageKm: number;
  readonly priceAmount: number;
  readonly priceCurrency: Currency;
  readonly colorEn: string;
  readonly bodyTypeEn: string;
  readonly engineTypeEn: string;
  readonly transmissionEn: string;
  readonly driveTypeEn: string;
  readonly enginePower: number;
  readonly cityEn: string;
  readonly condition: ListingCondition;
  /** Seller's "Damaged / needs repair" answer (ADR-0052). */
  readonly damaged: boolean;
  readonly acceptsExchange: boolean;
  readonly installmentAvailable: boolean;
  readonly viewCount: number;
  readonly description: string;
  readonly knownIssuesText?: string;
  readonly photos: readonly string[];
  readonly sellerKey: "aygul" | "merdan" | "salamat";
};

/**
 * Descriptions are written the way sellers on this market actually write them:
 * Russian or Turkmen, customs status up front, owner count, what works and what
 * does not, and whether an exchange is on the table. Two listings carry honest
 * defect disclosure so the S9a condition fields render with real content.
 */
const CARS: readonly FixtureCar[] = [
  {
    slug: "camry-beige",
    brandEn: "Toyota",
    modelEn: "Camry",
    year: 2019,
    mileageKm: 84_000,
    priceAmount: 465_000,
    priceCurrency: Currency.TMT,
    colorEn: "Beige",
    bodyTypeEn: "Sedan",
    engineTypeEn: "Gasoline",
    transmissionEn: "Automatic",
    driveTypeEn: "FWD",
    enginePower: 181,
    cityEn: "Ashgabat",
    condition: ListingCondition.used,
    damaged: false,
    acceptsExchange: false,
    installmentAvailable: false,
    viewCount: 1_284,
    description:
      "Bir eýeli, awariýa düşmedik. Gümrük tölegleri doly tölenen. Hyzmat kitapçasy bar — ähli çalşyklar wagtynda edildi. Kondisioner, oturgyç gyzdyryjy, kamera işleýär. Gyşky teker sowgat.",
    photos: ["camry-beige"],
    sellerKey: "aygul",
  },
  {
    slug: "camry-red",
    brandEn: "Toyota",
    modelEn: "Camry",
    year: 2021,
    mileageKm: 39_000,
    priceAmount: 585_000,
    priceCurrency: Currency.TMT,
    colorEn: "Red",
    bodyTypeEn: "Sedan",
    engineTypeEn: "Gasoline",
    transmissionEn: "Automatic",
    driveTypeEn: "FWD",
    enginePower: 207,
    cityEn: "Ashgabat",
    condition: ListingCondition.used,
    damaged: false,
    acceptsExchange: true,
    installmentAvailable: false,
    viewCount: 2_431,
    description:
      "Состояние нового автомобиля, пробег честный. Один хозяин с салона, все ТО у официального дилера. Не битый, не перекрашен — толщиномер при осмотре приветствуется. Обмен на внедорожник рассмотрю с вашей доплатой.",
    photos: ["camry-red"],
    sellerKey: "aygul",
  },
  {
    slug: "corolla-silver",
    brandEn: "Toyota",
    modelEn: "Corolla",
    year: 2020,
    mileageKm: 61_500,
    priceAmount: 372_000,
    priceCurrency: Currency.TMT,
    colorEn: "Silver",
    bodyTypeEn: "Sedan",
    engineTypeEn: "Hybrid",
    transmissionEn: "CVT",
    driveTypeEn: "FWD",
    enginePower: 122,
    cityEn: "Mary",
    condition: ListingCondition.used,
    damaged: false,
    acceptsExchange: false,
    installmentAvailable: true,
    viewCount: 876,
    description:
      "Гибрид, расход по городу 4.5–5 литров. Батарея в идеальном состоянии, диагностику делал месяц назад — отчёт покажу. Второй владелец, обслуживание по регламенту. Возможна рассрочка на 6 месяцев.",
    photos: ["corolla-silver"],
    sellerKey: "merdan",
  },
  {
    slug: "prado-white",
    brandEn: "Toyota",
    modelEn: "Land Cruiser Prado",
    year: 2018,
    mileageKm: 118_000,
    priceAmount: 1_150_000,
    priceCurrency: Currency.TMT,
    colorEn: "White",
    bodyTypeEn: "SUV",
    engineTypeEn: "Diesel",
    transmissionEn: "Automatic",
    driveTypeEn: "4WD",
    enginePower: 177,
    cityEn: "Ashgabat",
    condition: ListingCondition.used,
    damaged: false,
    acceptsExchange: true,
    installmentAvailable: false,
    viewCount: 3_902,
    description:
      "2.8 dizel, doly hereketlendiriji. Çölde we daglyk ýolda ulanyldy, tehniki ýagdaýy gowy. Ähli hyzmat Aşgabatdaky resmi merkezde edildi. Täze teker geçen aý dakyldy. Çalşyga seredýärin — sedan + goşmaça töleg.",
    knownIssuesText:
      "Sag yzdaky gapyda kiçijik çyzyk bar (surata düşdi). Kondisioner gowy işleýär, ýöne yzky zona üçin ýelejiretiji çalşylmaly.",
    photos: ["prado-white"],
    sellerKey: "salamat",
  },
  {
    slug: "sonata-white",
    brandEn: "Hyundai",
    modelEn: "Sonata",
    year: 2020,
    mileageKm: 47_500,
    priceAmount: 398_000,
    priceCurrency: Currency.TMT,
    colorEn: "White",
    bodyTypeEn: "Sedan",
    engineTypeEn: "Gasoline",
    transmissionEn: "Automatic",
    driveTypeEn: "FWD",
    enginePower: 180,
    cityEn: "Turkmenabat",
    condition: ListingCondition.used,
    damaged: false,
    acceptsExchange: false,
    installmentAvailable: false,
    viewCount: 654,
    description:
      "Привезена из Кореи, растаможена полностью, документы чистые. Один хозяин по ПТС. Панорама, полный электропакет, камеры 360. Сервисной книжки нет — обслуживал у частного мастера, чеки сохранил.",
    photos: ["sonata-white"],
    sellerKey: "merdan",
  },
  {
    slug: "sportage-silver",
    brandEn: "Kia",
    modelEn: "Sportage",
    year: 2017,
    mileageKm: 132_000,
    priceAmount: 288_000,
    priceCurrency: Currency.TMT,
    colorEn: "Silver",
    bodyTypeEn: "Crossover",
    engineTypeEn: "Gasoline",
    transmissionEn: "Automatic",
    driveTypeEn: "FWD",
    enginePower: 150,
    cityEn: "Dasoguz",
    condition: ListingCondition.used,
    damaged: true,
    acceptsExchange: true,
    installmentAvailable: false,
    viewCount: 1_097,
    description:
      "Честно: была замена переднего бампера и левого крыла после ДТП в 2021 году, геометрия кузова не пострадала — фото с покраской покажу. Технически машина полностью исправна, ходовая перебрана.",
    knownIssuesText:
      "Переднее левое крыло и бампер в покраске после ДТП 2021 года. Требуется замена стоек стабилизатора — стучат на неровностях.",
    photos: ["sportage-silver-front", "sportage-silver-rear"],
    sellerKey: "salamat",
  },
  {
    slug: "eclass-black",
    brandEn: "Mercedes-Benz",
    modelEn: "E-Class",
    year: 2021,
    mileageKm: 71_000,
    priceAmount: 39_500,
    priceCurrency: Currency.USD,
    colorEn: "Black",
    bodyTypeEn: "Sedan",
    engineTypeEn: "Gasoline",
    transmissionEn: "Automatic",
    driveTypeEn: "RWD",
    enginePower: 258,
    cityEn: "Ashgabat",
    condition: ListingCondition.used,
    damaged: false,
    acceptsExchange: false,
    installmentAvailable: false,
    viewCount: 4_118,
    description:
      "Длинная база, максимальная комплектация. Один владелец, полностью обслужена у дилера — история в Mercedes Me. Массаж и вентиляция сидений, Burmester, ночное видение. Цена в долларах, торг минимальный.",
    photos: ["eclass-black"],
    sellerKey: "salamat",
  },
  {
    slug: "eclass-white",
    brandEn: "Mercedes-Benz",
    modelEn: "E-Class",
    year: 2018,
    mileageKm: 104_000,
    priceAmount: 28_900,
    priceCurrency: Currency.USD,
    colorEn: "White",
    bodyTypeEn: "Sedan",
    engineTypeEn: "Gasoline",
    transmissionEn: "Automatic",
    driveTypeEn: "RWD",
    enginePower: 197,
    cityEn: "Ashgabat",
    condition: ListingCondition.used,
    damaged: false,
    acceptsExchange: true,
    installmentAvailable: false,
    viewCount: 1_755,
    description:
      "Белый перламутр, светлый салон. Второй хозяин, машина не такси и не под выкуп. Полный пакет документов, растаможена. Обмен на Prado или Land Cruiser рассмотрю.",
    photos: ["eclass-white"],
    sellerKey: "merdan",
  },
  {
    slug: "lx-black",
    brandEn: "Lexus",
    modelEn: "LX",
    year: 2019,
    mileageKm: 96_000,
    priceAmount: 78_000,
    priceCurrency: Currency.USD,
    colorEn: "Black",
    bodyTypeEn: "SUV",
    engineTypeEn: "Gasoline",
    transmissionEn: "Automatic",
    driveTypeEn: "4WD",
    enginePower: 367,
    cityEn: "Ashgabat",
    condition: ListingCondition.used,
    damaged: false,
    acceptsExchange: false,
    installmentAvailable: false,
    viewCount: 6_240,
    description:
      "LX 570, 5.7 V8, полный фарш. Один владелец, вся история обслуживания сохранена. Кузов в родной краске, толщиномер по всему кругу. Задние мониторы, три ряда сидений, холодильник в подлокотнике.",
    photos: ["lx-black"],
    sellerKey: "salamat",
  },
  {
    slug: "lx-white",
    brandEn: "Lexus",
    modelEn: "LX",
    year: 2016,
    mileageKm: 148_000,
    priceAmount: 215_000,
    priceCurrency: Currency.AED,
    colorEn: "White",
    bodyTypeEn: "SUV",
    engineTypeEn: "Gasoline",
    transmissionEn: "Automatic",
    driveTypeEn: "4WD",
    enginePower: 367,
    cityEn: "Balkanabat",
    condition: ListingCondition.used,
    damaged: false,
    acceptsExchange: false,
    installmentAvailable: false,
    viewCount: 912,
    description:
      "Imported from Dubai, GCC specification with full agency service history. Accident-free, paint meter report available on request. Price is in AED — buyer covers customs clearance and transport to Turkmenistan.",
    photos: ["lx-white"],
    sellerKey: "merdan",
  },
  {
    slug: "hilux-red",
    brandEn: "Toyota",
    modelEn: "Hilux",
    year: 2019,
    mileageKm: 87_000,
    priceAmount: 132_000,
    priceCurrency: Currency.AED,
    colorEn: "Red",
    bodyTypeEn: "Pickup",
    engineTypeEn: "Diesel",
    transmissionEn: "Automatic",
    driveTypeEn: "4WD",
    enginePower: 150,
    cityEn: "Turkmenbashi",
    condition: ListingCondition.used,
    damaged: false,
    acceptsExchange: false,
    installmentAvailable: false,
    viewCount: 487,
    description:
      "Double cab, 2.8 diesel, 4x4 with low range. Single owner, used for site inspections rather than heavy hauling — bed liner fitted from new. All-terrain tyres replaced at 80 000 km. Clean title, ready for export.",
    photos: ["hilux-red"],
    sellerKey: "aygul",
  },
];

/** Fixed IDs so re-runs replace rather than accumulate. */
const SELLER_IDS = {
  aygul: "f1000000-0000-4000-8000-000000000001",
  merdan: "f1000000-0000-4000-8000-000000000002",
  salamat: "f1000000-0000-4000-8000-000000000003",
} as const;

const BUYER_ID = "f1000000-0000-4000-8000-000000000010";
/** Users that only exist for Cabinet and Profile screenshots: no set name, and a 30-character name. */
const UNNAMED_ID = "f1000000-0000-4000-8000-000000000011";
const LONG_NAME_ID = "f1000000-0000-4000-8000-000000000012";
const NO_PHOTO_LISTING_ID = "f1000000-0000-4000-8000-0000000001ff";
const CONVERSATION_IDS = {
  camryRed: "f1000000-0000-4000-8000-000000000201",
  prado: "f1000000-0000-4000-8000-000000000202",
} as const;

/** Stable per-car listing id, so `ui:fixture` is re-runnable. */
function listingId(index: number): string {
  return `f1000000-0000-4000-8000-0000000001${index.toString(16).padStart(2, "0")}`;
}

/** Builds a name -> id map for one reference table. */
function indexByName<T extends { id: string; nameEn: string }>(
  rows: readonly T[],
): Map<string, string> {
  return new Map(rows.map((row) => [row.nameEn, row.id]));
}

function required(map: Map<string, string>, name: string, table: string): string {
  const id = map.get(name);
  if (!id) {
    throw new Error(
      `Reference data missing: ${table} has no "${name}" — run \`pnpm db:seed\` first`,
    );
  }
  return id;
}

async function main(): Promise<void> {
  // Reference data must already be seeded (pnpm db:seed). Look everything up by
  // name: the previous fixture used findFirst() for each table, which gave all
  // listings the same colour, body type and transmission and so never exercised
  // the feed's spec chips with varied data.
  const [brands, models, cities, colors, bodyTypes, engineTypes, transmissions, driveTypes] =
    await Promise.all([
      prisma.brand.findMany({ select: { id: true, nameEn: true } }),
      prisma.model.findMany({ select: { id: true, nameEn: true, brandId: true } }),
      prisma.city.findMany({ select: { id: true, nameEn: true, regionId: true } }),
      prisma.color.findMany({ select: { id: true, nameEn: true } }),
      prisma.bodyType.findMany({ select: { id: true, nameEn: true } }),
      prisma.engineType.findMany({ select: { id: true, nameEn: true } }),
      prisma.transmission.findMany({ select: { id: true, nameEn: true } }),
      prisma.driveType.findMany({ select: { id: true, nameEn: true } }),
    ]);

  const brandMap = indexByName(brands);
  const colorMap = indexByName(colors);
  const bodyTypeMap = indexByName(bodyTypes);
  const engineTypeMap = indexByName(engineTypes);
  const transmissionMap = indexByName(transmissions);
  const driveTypeMap = indexByName(driveTypes);

  // "Test City" rows exist more than once in the seeded reference data, so pick
  // the first match by name rather than assuming uniqueness.
  const cityMap = new Map<string, { id: string; regionId: string | null }>();
  for (const city of cities) {
    if (!cityMap.has(city.nameEn)) {
      cityMap.set(city.nameEn, { id: city.id, regionId: city.regionId });
    }
  }

  const modelMap = new Map<string, string>();
  for (const model of models) {
    modelMap.set(`${model.brandId}:${model.nameEn}`, model.id);
  }

  // Wipe prior fixture rows (cascades clear media, conversations, messages).
  const allListingIds = [
    ...CARS.map((_, index) => listingId(index)),
    NO_PHOTO_LISTING_ID,
  ];
  await prisma.listing.deleteMany({ where: { id: { in: allListingIds } } });
  await prisma.user.deleteMany({
    where: { id: { in: [...Object.values(SELLER_IDS), BUYER_ID, UNNAMED_ID, LONG_NAME_ID] } },
  });

  // The name number and the avatar index are fixed here, not left to the
  // column's random default, so screenshots of these Users are reproducible.
  await prisma.user.createMany({
    data: [
      {
        id: SELLER_IDS.aygul,
        phone: "+99361000001",
        phoneVerifiedAt: new Date(),
        displayName: "Aýgül Amanowa",
        nameNumber: 6644,
        avatarIndex: 5,
        locale: "tk",
        role: UserRole.seller,
      },
      {
        id: SELLER_IDS.merdan,
        phone: "+99361000002",
        phoneVerifiedAt: new Date(),
        displayName: "Merdan Hojaýew",
        nameNumber: 7310,
        avatarIndex: 9,
        locale: "ru",
        role: UserRole.seller,
      },
      {
        id: SELLER_IDS.salamat,
        phone: "+99361000003",
        phoneVerifiedAt: new Date(),
        displayName: "Salamat Motors",
        nameNumber: 2057,
        avatarIndex: 2,
        locale: "ru",
        role: UserRole.seller,
      },
      {
        id: BUYER_ID,
        phone: "+99361000009",
        phoneVerifiedAt: new Date(),
        displayName: "Öwez Berdiýew",
        nameNumber: 4821,
        avatarIndex: 7,
        locale: "tk",
        role: UserRole.buyer,
      },
      {
        id: UNNAMED_ID,
        phone: "+99361000010",
        phoneVerifiedAt: new Date(),
        displayName: null,
        nameNumber: 4821,
        avatarIndex: 7,
        locale: "tk",
        role: UserRole.buyer,
      },
      {
        id: LONG_NAME_ID,
        phone: "+99361000011",
        phoneVerifiedAt: new Date(),
        displayName: "Abdyrahman Gurbanguly Atamyrad",
        nameNumber: 3906,
        avatarIndex: 11,
        locale: "tk",
        role: UserRole.buyer,
      },
    ],
  });

  // Stagger publishedAt so the feed's "newest first" ordering is observable and
  // the relative-time labels render a spread rather than all "just now".
  const now = Date.now();
  const createdListings: { id: string; slug: string }[] = [];

  for (const [index, car] of CARS.entries()) {
    const id = listingId(index);
    const brandId = required(brandMap, car.brandEn, "brands");
    const modelId = modelMap.get(`${brandId}:${car.modelEn}`);
    if (!modelId) {
      throw new Error(
        `Reference data missing: no model "${car.modelEn}" for brand "${car.brandEn}"`,
      );
    }
    const city = cityMap.get(car.cityEn);
    if (!city) {
      throw new Error(`Reference data missing: cities has no "${car.cityEn}"`);
    }

    const publishedAt = new Date(now - (CARS.length - index) * 7 * 3_600_000);

    // Upload first: a listing whose media row exists but whose object does not
    // renders an empty frame, which is the exact failure mode we are trying to
    // make impossible to mistake for missing data.
    const media: { key: string; sortOrder: number; width: number; height: number }[] = [];
    for (const [order, slug] of car.photos.entries()) {
      const baseKey = `fixture/${car.slug}-${order}`;
      const { width, height } = await uploadPhotoSet(baseKey, slug);
      media.push({ key: `${baseKey}/original.webp`, sortOrder: order, width, height });
    }

    await prisma.listing.create({
      data: {
        id,
        sellerId: SELLER_IDS[car.sellerKey],
        brandId,
        modelId,
        cityId: city.id,
        ...(city.regionId ? { regionId: city.regionId } : {}),
        status: ListingStatus.active,
        publishedAt,
        condition: car.condition,
        year: car.year,
        mileageKm: car.mileageKm,
        priceAmount: car.priceAmount,
        priceCurrency: car.priceCurrency,
        description: car.description,
        colorId: required(colorMap, car.colorEn, "colors"),
        bodyTypeId: required(bodyTypeMap, car.bodyTypeEn, "body_types"),
        engineTypeId: required(engineTypeMap, car.engineTypeEn, "engine_types"),
        transmissionId: required(transmissionMap, car.transmissionEn, "transmissions"),
        driveTypeId: required(driveTypeMap, car.driveTypeEn, "drive_types"),
        enginePower: car.enginePower,
        damaged: car.damaged,
        acceptsExchange: car.acceptsExchange,
        installmentAvailable: car.installmentAvailable,
        viewCount: car.viewCount,
        ...(car.knownIssuesText ? { knownIssuesText: car.knownIssuesText } : {}),
        media: { create: media.map((m) => ({ kind: MediaKind.image, ...m })) },
      },
    });

    createdListings.push({ id, slug: car.slug });
  }

  // One listing with no photo and no description, to hold the empty states
  // honest. Nissan Almera is the cheap end of this market.
  const almeraBrandId = required(brandMap, "Nissan", "brands");
  const almeraModelId = modelMap.get(`${almeraBrandId}:Almera`);
  const almeraCity = cityMap.get("Tejen");
  if (almeraModelId && almeraCity) {
    await prisma.listing.create({
      data: {
        id: NO_PHOTO_LISTING_ID,
        sellerId: SELLER_IDS.aygul,
        brandId: almeraBrandId,
        modelId: almeraModelId,
        cityId: almeraCity.id,
        ...(almeraCity.regionId ? { regionId: almeraCity.regionId } : {}),
        status: ListingStatus.active,
        publishedAt: new Date(now - 30 * 60_000),
        condition: ListingCondition.used,
        year: 2014,
        mileageKm: 210_000,
        priceAmount: 62_000,
        priceCurrency: Currency.TMT,
        // ADR-0052: every seeded Listing answers the Damaged question.
        damaged: false,
        viewCount: 41,
      },
    });
  }

  // Fixture listings mix TMT, USD and AED; give them the stored TMT price that
  // price sort and the Results price range read.
  await recomputeListingPricesTmt(prisma);

  // Favourites, so the Halanlarym tab has content for the fixture buyer.
  const favouriteSlugs = new Set(["prado-white", "lx-black", "corolla-silver"]);
  await prisma.favorite.createMany({
    data: createdListings
      .filter((listing) => favouriteSlugs.has(listing.slug))
      .map((listing) => ({ userId: BUYER_ID, listingId: listing.id })),
    skipDuplicates: true,
  });

  // Two conversations: one in Turkmen on a TMT listing, one in Russian on the
  // Prado, so the chat list shows two currencies, two locales and two
  // thumbnails rather than a single row.
  const byslug = new Map(createdListings.map((l) => [l.slug, l.id]));
  const threads = [
    {
      id: CONVERSATION_IDS.camryRed,
      listingId: byslug.get("camry-red"),
      sellerId: SELLER_IDS.aygul,
      messages: [
        { from: "buyer", body: "Salam! Maşyn satylýarmy?" },
        { from: "seller", body: "Salam, hawa. Häzir elýeterli." },
        { from: "buyer", body: "Bahasy boýunça gepleşip bilerismi?" },
        { from: "seller", body: "Gelip görüň, soň gürleşeris. Şu hepde Aşgabatda." },
      ],
    },
    {
      id: CONVERSATION_IDS.prado,
      listingId: byslug.get("prado-white"),
      sellerId: SELLER_IDS.salamat,
      messages: [
        { from: "buyer", body: "Здравствуйте, машина ещё в продаже?" },
        { from: "seller", body: "Да, в продаже. Можете приехать посмотреть." },
        { from: "buyer", body: "Обмен на Camry 2021 рассмотрите?" },
        { from: "seller", body: "Рассмотрю, но с вашей доплатой. Пришлите фото." },
      ],
    },
  ];

  let threadCount = 0;
  for (const thread of threads) {
    if (!thread.listingId) continue;
    const conversation = await prisma.conversation.create({
      data: {
        id: thread.id,
        listingId: thread.listingId,
        buyerId: BUYER_ID,
        sellerId: thread.sellerId,
        participants: {
          create: [{ userId: BUYER_ID }, { userId: thread.sellerId }],
        },
      },
    });

    let lastMessageId = "";
    let lastMessageAt = new Date();
    for (const [index, message] of thread.messages.entries()) {
      const createdAt = new Date(now - (thread.messages.length - index) * 11 * 60_000);
      const created = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: message.from === "buyer" ? BUYER_ID : thread.sellerId,
          kind: MessageKind.text,
          body: message.body,
          createdAt,
        },
      });
      lastMessageId = created.id;
      lastMessageAt = createdAt;
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageId, lastMessageAt },
    });
    threadCount += 1;
  }

  const photoCount = CARS.reduce((sum, car) => sum + car.photos.length, 0);
  console.log(
    [
      `Seeded ${CARS.length} active listings with real photos + 1 without media`,
      `  currencies: TMT / USD / AED`,
      `  ${photoCount} photographs, ${photoCount * 5} objects in ${MINIO_ENDPOINT}/${PHOTO_BUCKET}/fixture/*`,
      `  photos cached at ${PHOTO_CACHE}`,
      `${threadCount} conversations, 3 favourites for the buyer`,
      `Sellers +99361000001 / +99361000002 / +99361000003 · Buyer +99361000009`,
      `No set name +99361000010 · 30-character name +99361000011`,
    ].join("\n"),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    s3.destroy();
  });
