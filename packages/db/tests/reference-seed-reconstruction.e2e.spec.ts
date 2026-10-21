import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type * as Pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

import bodyTypes from "../prisma/seed/body-types.json" with { type: "json" };
import brands from "../prisma/seed/brands.json" with { type: "json" };
import cities from "../prisma/seed/cities.json" with { type: "json" };
import colors from "../prisma/seed/colors.json" with { type: "json" };
import driveTypes from "../prisma/seed/drive-types.json" with { type: "json" };
import engineTypes from "../prisma/seed/engine-types.json" with { type: "json" };
import exchangeRates from "../prisma/seed/exchange-rates.json" with { type: "json" };
import models from "../prisma/seed/models.json" with { type: "json" };
import regions from "../prisma/seed/regions.json" with { type: "json" };
import transmissions from "../prisma/seed/transmissions.json" with { type: "json" };

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceChecksums = {
  "brands.json": "0e3ffba94c07a6216260a35fdbaffa2849f4101c6913d706617d333d4096c9e0",
  "models.json": "622be0c3f632d23b973a3adca0d43455419bc4ea4ade4dc71dd7c42783c2dfec",
  "regions.json": "2b334d2f56daab08f2112f83e1f895fe2e4616da45d2d8e21716114a5e1da9a3",
  "cities.json": "b62d3e4370e5879a05b5a096f476065cc54770ccf0c863f0257fa4f11e293d04",
  "body-types.json": "067aae964ed59b77bafca0e8be70cad5bdffbeeaedd5b0d7a080c367cbc43aca",
  "colors.json": "d41b5c4172c79981857552d2d3150a69d72a12afd762d51f07a14dfd4e4bf4bc",
  "engine-types.json": "d6eb5a81d5224859ee06896950b13f168e2bb40dea008f5223c6066b127f2cea",
  "transmissions.json": "837340321377c71ae41566b8a4b6683f688bb75a3a43809c69c56c7796eb6386",
  "drive-types.json": "7c4cb184528396ac2951f39966c91dcdd8e2f989cf300b8748ba34da7d309db2",
  "exchange-rates.json": "113dc658e3df8de126301819cb5d0ad6cbd4c0ed3c5484278ba4bbff84421df4",
} as const;

const sourceFiles = { "brands.json": brands, "models.json": models, "regions.json": regions, "cities.json": cities, "body-types.json": bodyTypes, "colors.json": colors, "engine-types.json": engineTypes, "transmissions.json": transmissions, "drive-types.json": driveTypes, "exchange-rates.json": exchangeRates };
const checksum = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sorted = <T>(rows: T[], key: (row: T) => string) => [...rows].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);

// Existing checked-in collisions, not approval to replace live reference content.
// Pin every source variant and the literal persisted names independently of the CLI.
const modelCollisions = [
  { brandSlug: "lexus", slug: "is-f", inputs: [
    { index: 89, nameRu: "IS F", nameTk: "IS F", nameEn: "IS F" },
    { index: 90, nameRu: "IS-F", nameTk: "IS-F", nameEn: "IS-F" },
  ], persisted: { nameRu: "IS-F", nameTk: "IS-F", nameEn: "IS-F" } },
  { brandSlug: "hyundai", slug: "santa-cruz", inputs: [
    { index: 366, nameRu: "Santa Cruz", nameTk: "Santa Cruz", nameEn: "Santa Cruz" },
    { index: 367, nameRu: "Santa Cruz", nameTk: "Santa Cruz", nameEn: "Santa Cruz" },
  ], persisted: { nameRu: "Santa Cruz", nameTk: "Santa Cruz", nameEn: "Santa Cruz" } },
  { brandSlug: "chevrolet", slug: "trailblazer", inputs: [
    { index: 563, nameRu: "TrailBlazer", nameTk: "TrailBlazer", nameEn: "TrailBlazer" },
    { index: 565, nameRu: "Trailblazer", nameTk: "Trailblazer", nameEn: "Trailblazer" },
  ], persisted: { nameRu: "Trailblazer", nameTk: "Trailblazer", nameEn: "Trailblazer" } },
  { brandSlug: "mazda", slug: "mazda6", inputs: [
    { index: 595, nameRu: "MAZDA6", nameTk: "MAZDA6", nameEn: "MAZDA6" },
    { index: 606, nameRu: "Mazda6", nameTk: "Mazda6", nameEn: "Mazda6" },
  ], persisted: { nameRu: "Mazda6", nameTk: "Mazda6", nameEn: "Mazda6" } },
  { brandSlug: "nissan", slug: "cube", inputs: [
    { index: 682, nameRu: "Cube", nameTk: "Cube", nameEn: "Cube" },
    { index: 727, nameRu: "cube", nameTk: "cube", nameEn: "cube" },
  ], persisted: { nameRu: "cube", nameTk: "cube", nameEn: "cube" } },
  { brandSlug: "kia", slug: "bongo", inputs: [
    { index: 729, nameRu: "Bongo", nameTk: "Bongo", nameEn: "Bongo" },
    { index: 730, nameRu: "Bongo", nameTk: "Bongo", nameEn: "Bongo" },
  ], persisted: { nameRu: "Bongo", nameTk: "Bongo", nameEn: "Bongo" } },
  { brandSlug: "ford", slug: "th!nk", inputs: [
    { index: 968, nameRu: "TH!NK", nameTk: "TH!NK", nameEn: "TH!NK" },
    { index: 972, nameRu: "Th!nk", nameTk: "Th!nk", nameEn: "Th!nk" },
  ], persisted: { nameRu: "Th!nk", nameTk: "Th!nk", nameEn: "Th!nk" } },
  { brandSlug: "kamaz", slug: "6520", inputs: [
    { index: 1237, nameRu: "6520", nameTk: "6520", nameEn: "6520" },
    { index: 1238, nameRu: "6520", nameTk: "6520", nameEn: "6520" },
  ], persisted: { nameRu: "6520", nameTk: "6520", nameEn: "6520" } },
  { brandSlug: "pontiac", slug: "solstice", inputs: [
    { index: 1475, nameRu: "Solstice", nameTk: "Solstice", nameEn: "Solstice" },
    { index: 1476, nameRu: "Solstice", nameTk: "Solstice", nameEn: "Solstice" },
  ], persisted: { nameRu: "Solstice", nameTk: "Solstice", nameEn: "Solstice" } },
  { brandSlug: "komatsu", slug: "hm400-5", inputs: [
    { index: 1785, nameRu: "HM400-5", nameTk: "HM400-5", nameEn: "HM400-5" },
    { index: 1786, nameRu: "HM400-5", nameTk: "HM400-5", nameEn: "HM400-5" },
  ], persisted: { nameRu: "HM400-5", nameTk: "HM400-5", nameEn: "HM400-5" } },
  { brandSlug: "shantui", slug: "sg18-3", inputs: [
    { index: 2299, nameRu: "SG18-3", nameTk: "SG18-3", nameEn: "SG18-3" },
    { index: 2300, nameRu: "SG18-3", nameTk: "SG18-3", nameEn: "SG18-3" },
  ], persisted: { nameRu: "SG18-3", nameTk: "SG18-3", nameEn: "SG18-3" } },
  { brandSlug: "shantui", slug: "sg24-c5", inputs: [
    { index: 2302, nameRu: "SG24-C5", nameTk: "SG24-C5", nameEn: "SG24-C5" },
    { index: 2303, nameRu: "SG24-C5", nameTk: "SG24-C5", nameEn: "SG24-C5" },
  ], persisted: { nameRu: "SG24-C5", nameTk: "SG24-C5", nameEn: "SG24-C5" } },
  { brandSlug: "shantui", slug: "sr20ma", inputs: [
    { index: 2315, nameRu: "SR20MA", nameTk: "SR20MA", nameEn: "SR20MA" },
    { index: 2316, nameRu: "SR20MA", nameTk: "SR20MA", nameEn: "SR20MA" },
  ], persisted: { nameRu: "SR20MA", nameTk: "SR20MA", nameEn: "SR20MA" } },
  { brandSlug: "shantui", slug: "sr20yt", inputs: [
    { index: 2317, nameRu: "SR20YT", nameTk: "SR20YT", nameEn: "SR20YT" },
    { index: 2318, nameRu: "SR20YT", nameTk: "SR20YT", nameEn: "SR20YT" },
  ], persisted: { nameRu: "SR20YT", nameTk: "SR20YT", nameEn: "SR20YT" } },
  { brandSlug: "shantui", slug: "srd12", inputs: [
    { index: 2321, nameRu: "SRD12", nameTk: "SRD12", nameEn: "SRD12" },
    { index: 2322, nameRu: "SRD12", nameTk: "SRD12", nameEn: "SRD12" },
  ], persisted: { nameRu: "SRD12", nameTk: "SRD12", nameEn: "SRD12" } },
];

type Snapshot = {
  brands: unknown[]; models: unknown[]; regions: unknown[]; cities: unknown[];
  bodyTypes: unknown[]; colors: unknown[]; engineTypes: unknown[]; transmissions: unknown[]; driveTypes: unknown[];
  exchangeRates: unknown[]; generations: number; protectedCounts: Record<string, number>;
};

async function snapshot(pool: Pg.Pool): Promise<Snapshot> {
  const query = async <T extends Pg.QueryResultRow = Record<string, unknown>>(sql: string): Promise<T[]> => (await pool.query<T>(sql)).rows;
  return {
    brands: await query('SELECT slug, "nameRu", "nameTk", "nameEn", "logoKey" FROM brands ORDER BY slug COLLATE "C"'),
    models: await query('SELECT b.slug AS "brandSlug", m.slug, m."nameRu", m."nameTk", m."nameEn" FROM models m JOIN brands b ON b.id = m."brandId" ORDER BY b.slug COLLATE "C", m.slug COLLATE "C"'),
    regions: await query('SELECT slug, "nameRu", "nameTk", "nameEn" FROM regions ORDER BY slug COLLATE "C"'),
    cities: await query('SELECT r.slug AS "regionSlug", c.slug, c."nameRu", c."nameTk", c."nameEn" FROM cities c JOIN regions r ON r.id = c."regionId" ORDER BY r.slug COLLATE "C", c.slug COLLATE "C"'),
    bodyTypes: await query('SELECT "nameRu", "nameTk", "nameEn" FROM body_types ORDER BY "nameEn" COLLATE "C"'),
    colors: await query('SELECT "nameRu", "nameTk", "nameEn", hex FROM colors ORDER BY "nameEn" COLLATE "C"'),
    engineTypes: await query('SELECT "nameRu", "nameTk", "nameEn" FROM engine_types ORDER BY "nameEn" COLLATE "C"'),
    transmissions: await query('SELECT "nameRu", "nameTk", "nameEn" FROM transmissions ORDER BY "nameEn" COLLATE "C"'),
    driveTypes: await query('SELECT "nameRu", "nameTk", "nameEn" FROM drive_types ORDER BY "nameEn" COLLATE "C"'),
    exchangeRates: await query('SELECT "fromCurrency", "toCurrency", rate::double precision AS rate, "setByUserId" FROM exchange_rates ORDER BY "fromCurrency"::text COLLATE "C", "toCurrency"::text COLLATE "C"'),
    generations: Number((await query<{ count: string }>('SELECT count(*)::text AS count FROM generations'))[0]?.count ?? 0),
    protectedCounts: Object.fromEntries(await Promise.all([
      "users", "sessions", "staff_grants", "diagnostic_centers", "diagnostic_center_assignments", "diagnostic_template_versions",
      "service_conversations", "service_messages", "service_outbox", "history_capacity_days", "history_orders", "market_knowledge_datasets",
    ].map(async (table) => [table, Number((await query<{ count: string }>(`SELECT count(*)::text AS count FROM "${table}"`))[0]?.count ?? 0)]))),
  };
}

function expected(): Snapshot {
  const modelKey = (row: { brandSlug: string; slug: string }) => `${row.brandSlug}\0${row.slug}`;
  const groups = new Map<string, Array<(typeof models)[number] & { index: number }>>();
  models.forEach((row, index) => {
    const key = modelKey(row);
    groups.set(key, [...(groups.get(key) ?? []), { index, ...row }]);
  });
  // Fail on any new, missing or changed collision, including its source position.
  expect(sorted([...groups.entries()].filter(([, rows]) => rows.length > 1).map(([key, inputs]) => ({ key, inputs })), (group) => group.key)).toEqual(
    sorted(modelCollisions.map(({ brandSlug, slug, inputs }) => ({ key: modelKey({ brandSlug, slug }), inputs: inputs.map((input) => ({ brandSlug, slug, ...input })) })), (group) => group.key),
  );
  expect(groups.size).toBe(2420);
  const collisionKeys = new Set(modelCollisions.map(modelKey));
  const persistedModels = [
    ...models.filter((row) => !collisionKeys.has(modelKey(row))),
    ...modelCollisions.map(({ brandSlug, slug, persisted }) => ({ brandSlug, slug, ...persisted })),
  ];
  expect(persistedModels).toHaveLength(2420);
  return {
    brands: sorted(brands.map((x) => ({ ...x, logoKey: null })), (x) => x.slug), models: sorted(persistedModels, modelKey),
    regions: sorted(regions, (x) => x.slug), cities: sorted(cities, (x) => `${x.regionSlug}\0${x.slug}`),
    bodyTypes: sorted(bodyTypes, (x) => x.nameEn), colors: sorted(colors, (x) => x.nameEn),
    engineTypes: sorted(engineTypes, (x) => x.nameEn), transmissions: sorted(transmissions, (x) => x.nameEn), driveTypes: sorted(driveTypes, (x) => x.nameEn),
    exchangeRates: sorted(exchangeRates.map((x) => ({ ...x, setByUserId: null })), (x) => `${x.fromCurrency}\0${x.toCurrency}`),
    generations: 0, protectedCounts: { users: 0, sessions: 0, staff_grants: 0, diagnostic_centers: 0, diagnostic_center_assignments: 0, diagnostic_template_versions: 0, service_conversations: 0, service_messages: 0, service_outbox: 0, history_capacity_days: 0, history_orders: 0, market_knowledge_datasets: 0 },
  };
}

describe("checked-in baseline seed on fresh migrated PostgreSQL", () => {
  const containers: StartedPostgreSqlContainer[] = [];
  const pools: Pg.Pool[] = [];

  afterAll(async () => { await Promise.all(pools.map((pool) => pool.end())); await Promise.all(containers.map((container) => container.stop())); });

  it("matches the independent source baseline across two databases and repeats", async () => {
    for (const [name, data] of Object.entries(sourceFiles)) expect(checksum(data), name).toBe(sourceChecksums[name as keyof typeof sourceChecksums]);
    expect({ brands: brands.length, models: models.length, regions: regions.length, cities: cities.length, bodyTypes: bodyTypes.length, colors: colors.length, engineTypes: engineTypes.length, transmissions: transmissions.length, driveTypes: driveTypes.length, exchangeRates: exchangeRates.length }).toEqual({ brands: 130, models: 2435, regions: 6, cities: 35, bodyTypes: 10, colors: 15, engineTypes: 6, transmissions: 4, driveTypes: 4, exchangeRates: 2 });
    expect(exchangeRates).toEqual([{ fromCurrency: "USD", toCurrency: "TMT", rate: 18.2 }, { fromCurrency: "AED", toCurrency: "TMT", rate: 4.96 }]);
    expect(brands[0]).toEqual({ slug: "toyota", nameRu: "Toyota", nameTk: "Toyota", nameEn: "Toyota" });
    expect(regions[0]).toEqual({ slug: "ahal", nameRu: "Ахалский велаят", nameTk: "Ahal welaýaty", nameEn: "Ahal Region" });
    expect(colors[0]).toEqual({ nameRu: "Белый", nameTk: "Ak", nameEn: "White", hex: "#FFFFFF" });
    const baseline = expected();
    const snapshots: Snapshot[] = [];
    const identities: Array<Array<{ family: string; naturalKey: string; id: string }>> = [];
    for (let index = 0; index < 2; index++) {
      const container = await new PostgreSqlContainer("postgres:16-alpine").start(); containers.push(container);
      const databaseUrl = container.getConnectionUri();
      execFileSync("pnpm", ["prisma", "migrate", "deploy"], { cwd: packageRoot, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
      const { Pool } = await import("pg"); const pool = new Pool({ connectionString: databaseUrl }); pools.push(pool);
      // Migration history is configuration evidence, not seed data. Pin the full
      // rows before seeding and require byte-for-byte semantic preservation.
      const migrations = (await pool.query('SELECT * FROM "_prisma_migrations" ORDER BY migration_name')).rows;
      expect(migrations.length).toBeGreaterThan(0);
      const before = await snapshot(pool);
      for (const value of Object.values(before)) {
        if (Array.isArray(value)) expect(value).toEqual([]);
      }
      expect(before.generations).toBe(0);
      expect(before.protectedCounts).toEqual(baseline.protectedCounts);
      const readIds = async () => (await pool.query<{ family: string; naturalKey: string; id: string }>(`
        SELECT 'brand' AS family, slug AS "naturalKey", id FROM brands
        UNION ALL SELECT 'model', b.slug || '/' || m.slug, m.id FROM models m JOIN brands b ON b.id = m."brandId"
        UNION ALL SELECT 'region', slug, id FROM regions
        UNION ALL SELECT 'city', r.slug || '/' || c.slug, c.id FROM cities c JOIN regions r ON r.id = c."regionId"
        UNION ALL SELECT 'bodyType', "nameEn", id FROM body_types
        UNION ALL SELECT 'color', "nameEn", id FROM colors
        UNION ALL SELECT 'engineType', "nameEn", id FROM engine_types
        UNION ALL SELECT 'transmission', "nameEn", id FROM transmissions
        UNION ALL SELECT 'driveType', "nameEn", id FROM drive_types
        UNION ALL SELECT 'exchangeRate', "fromCurrency"::text || '/' || "toCurrency"::text, id FROM exchange_rates
        ORDER BY family, "naturalKey"
      `)).rows;
      const first = execFileSync("pnpm", ["seed"], { cwd: packageRoot, env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8" });
      expect(first).toContain("Seeded 130 brands");
      const firstSnapshot = await snapshot(pool); expect(firstSnapshot).toEqual(baseline); snapshots.push(firstSnapshot);
      const ids = await readIds(); identities.push(ids);
      expect(ids).toHaveLength(2632);
      for (const row of ids) expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      execFileSync("pnpm", ["seed"], { cwd: packageRoot, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" });
      expect(await snapshot(pool)).toEqual(firstSnapshot);
      expect(await readIds()).toEqual(ids);
      expect((await pool.query('SELECT * FROM "_prisma_migrations" ORDER BY migration_name')).rows).toEqual(migrations);
    }
    expect(snapshots[1]).toEqual(snapshots[0]);
    expect(identities[1]?.map(({ family, naturalKey }) => ({ family, naturalKey }))).toEqual(identities[0]?.map(({ family, naturalKey }) => ({ family, naturalKey })));
    const firstIds = new Set(identities[0]?.map(({ id }) => id));
    for (const row of identities[1] ?? []) expect(firstIds.has(row.id)).toBe(false);
    expect(checksum(snapshots[0])).toBe(checksum(snapshots[1]));
  });
});
