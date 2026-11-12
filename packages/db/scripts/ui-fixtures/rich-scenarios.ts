import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Client } from "pg";
import { ListingsSchemas } from "@auto-tm/contracts";

import { DEMO_PHOTO_MANIFEST } from "../demo-inventory/manifest";
import { preparePhoto } from "../demo-inventory/photos";
import reviewer from "../reviewer-fixtures/photos.manifest.json";

import { ES300H_GALLERY } from "./manifest";
import type { richTarget } from "./rich-target";
import { verifyGallery } from "./verify";

export const RICH_SCENARIOS = [
  { key: "rich-es300h-portrait", id: "b1126000-0000-4000-8000-000000000001" },
  { key: "rich-es300h-landscape", id: "b1126000-0000-4000-8000-000000000002" },
] as const;
export const PRIVATE_DRAFT_SCENARIOS = [0, 1, 3, 20].map((count, index) => ({
  key: `private-photos-${count}${count === 20 ? "-synthetic-numbered" : ""}`,
  id: `b1130000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, count,
}));
const PRIVATE_DRAFT_PAYLOAD = { year: 2025, vin: "", condition: "used", mileageKm: 0,
  conditionDisclosure: { damaged: false }, allowCalls: true, allowChat: true, priceCurrency: "TMT" };
const DRAFT_ROOT = "review-baseline/private-photos-v1/";
const BUCKET = "listing-photos";
const ROOT = "review-baseline/photos-v1/";
const PACK = join(__dirname, "es300h-shenzhen-2025-07-17/v1");
const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
class Refusal extends Error {}
const refuse = (message: string): never => { throw new Refusal(message); };
type Target = ReturnType<typeof richTarget>;
type Row = Record<string, unknown>;
type ObjectFile = { key: string; body: Buffer; contentType: string };

/** No downloads. Actual renderer output participates in the immutable version. */
async function prepare(directory: string) {
  await verifyGallery(directory, ES300H_GALLERY).catch((error: unknown) => refuse(error instanceof Error ? error.message : "Offline gallery invalid"));
  const photos = [];
  for (const photo of ES300H_GALLERY.photos) {
    const bytes = await readFile(join(directory, photo.file));
    if (digest(bytes) !== photo.sha256) refuse(`Offline gallery changed during verification: ${photo.file}`);
    photos.push(await preparePhoto(bytes));
  }
  const version = digest(JSON.stringify({ gallery: ES300H_GALLERY, scenarios: RICH_SCENARIOS,
    outputs: photos.map((photo) => photo.files.map((file) => digest(file.body))) }));
  const changes = "Auto-oriented; metadata removed; re-encoded as WebP; resized; thumbnail/list variants cropped. Adaptations retain the source licence. No endorsement implied.";
  const credits = Buffer.from(JSON.stringify({ version, photos: [
    ...Object.values(DEMO_PHOTO_MANIFEST.listings).flatMap((entry) => entry.photos).map((photo) => ({ ...photo, modifications: changes })),
    ...reviewer.photos.map((photo) => ({ ...photo, modifications: "Auto-oriented; metadata removed; resized and re-encoded as WebP for reviewer Listings. Adaptations retain CC BY-SA 4.0." })),
    ...ES300H_GALLERY.photos.map((photo) => ({ ...photo, modifications: `${photo.transformations} ${changes}` })),
  ] }, null, 2));
  return { photos, version, credits };
}

/** Real Postgres + conditional object writes; no identity mutation, delete or convergence. */
export async function runRichScenarios(target: Target, directory = PACK) {
  let phase = "offline gallery verification";
  let db: Client | undefined;
  let s3: S3Client | undefined;
  const createdObjects: string[] = [];
  const plannedUploadIds: string[] = [];
  let attemptedObject: string | undefined;
  try {
    const pack = await prepare(directory);
    const privateDrafts = target.scenarioSet === "private-drafts";
    // Existing public photo versions remain stable when private scenarios evolve.
    const cards = [];
    if (privateDrafts) for (let number = 1; number <= 20; number++) {
      cards.push(await preparePhoto(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#133344"/><text x="600" y="165" text-anchor="middle" fill="white" font-family="sans-serif" font-size="52">SYNTHETIC PHOTO LIMIT TEST</text><text x="600" y="490" text-anchor="middle" fill="#ffd37a" font-family="sans-serif" font-size="280">${String(number).padStart(2, "0")}</text><text x="600" y="680" text-anchor="middle" fill="white" font-family="sans-serif" font-size="40">${number} / 20 — NOT A VEHICLE PHOTO</text></svg>`)));
    }
    const version = privateDrafts ? digest(JSON.stringify({ galleryVersion: pack.version, scenarios: PRIVATE_DRAFT_SCENARIOS, payload: PRIVATE_DRAFT_PAYLOAD, protocol: "conditional-v1",
      cards: cards.map((photo) => photo.files.map((file) => digest(file.body))) })) : pack.version;
    const root = privateDrafts ? DRAFT_ROOT : ROOT;
    const scenarioIds = (privateDrafts ? PRIVATE_DRAFT_SCENARIOS : RICH_SCENARIOS).map((row) => row.id);
    const prefix = `${root}${version}/`;
    const creditsKey = `${prefix}credits.json`;
    const creditsUrl = `${target.publicUrl}${BUCKET}/${creditsKey}`;
    const credits = privateDrafts ? Buffer.from(JSON.stringify({ version, galleryCredits: JSON.parse(pack.credits.toString()),
      synthetic: "Twenty deterministic numbered boundary cards generated for private UI testing; not vehicle photography. Never publish these cards." }, null, 2)) : pack.credits;
    const objects: ObjectFile[] = [{ key: creditsKey, body: credits, contentType: "application/json" }];
    const media = (privateDrafts ? [] : RICH_SCENARIOS).flatMap((scenario, scenarioIndex) => pack.photos.map((photo, index) => {
      const base = `${prefix}${scenario.key}/${index + 1}`;
      for (const file of photo.files) objects.push({ key: `${base}/${file.name}.webp`, body: file.body, contentType: "image/webp" });
      return { id: `b1126000-0000-4000-800${scenarioIndex + 1}-${String(index + 1).padStart(12, "0")}`,
        listingId: scenario.id, kind: "image", key: `${base}/original.webp`, sortOrder: index,
        width: photo.width, height: photo.height, durationMs: null, posterKey: null, thumbHash: null, uploadId: null };
    }));
    const uploads: Row[] = [];
    const drafts: Row[] = [];
    if (privateDrafts) for (const [scenarioIndex, scenario] of PRIVATE_DRAFT_SCENARIOS.entries()) {
      const photos = [];
      for (let index = 0; index < scenario.count; index++) {
        const photo = (scenario.count === 20 ? cards[index] : pack.photos[index]) ?? refuse("Missing rendered draft photo");
        const id = `b1130000-0000-400${scenarioIndex + 1}-8000-${String(index + 1).padStart(12, "0")}`;
        plannedUploadIds.push(id);
        const base = `pending/${id}`;
        const key = `${base}/original.webp`;
        const objectKeys = photo.files.map((file) => `${base}/${file.name}.webp`);
        for (const file of photo.files) objects.push({ key: `${base}/${file.name}.webp`, body: file.body, contentType: "image/webp" });
        uploads.push({ id, userId: target.ownerId, key, kind: "image", contentType: "image/webp",
          sizeBytes: photo.files[0]?.body.length ?? refuse("Missing original"), writeProtocol: "conditional-v1", objectKeys,
          state: "AVAILABLE", claimToken: null, claimTargetType: null, claimTargetId: null, claimDeadline: null, retiredAt: null });
        photos.push({ photoId: id, key, sortOrder: index });
      }
      drafts.push({ id: scenario.id, userId: target.ownerId, payload: { photos, currentStep: 3,
        // Explicitly fictional, partial review answers. No vehicle history is asserted.
        ...PRIVATE_DRAFT_PAYLOAD, validatedSteps: ["vehicle", "specs", ...(scenario.count >= 3 ? ["photos"] : [])],
        description: `Fictional private review: ${scenario.key}. ${scenario.count === 20 ? "SYNTHETIC numbered boundary cards; never publish." : "Coherent Lexus gallery study; not an offer for sale."} Credits: ${creditsUrl}` } });
    }
    phase = "local database connection/schema";
    db = new Client({ connectionString: target.databaseUrl, connectionTimeoutMillis: 5000, query_timeout: 30000 });
    db.on("error", () => undefined);
    await db.connect();
    // Match normal CreateDraft: acquire the owner lock before a fresh count.
    // A pre-lock SERIALIZABLE snapshot can miss a normal READ COMMITTED create.
    await db.query(target.mode === "apply" ? (privateDrafts ? "BEGIN" : "BEGIN ISOLATION LEVEL SERIALIZABLE") : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    if (target.mode === "apply") await db.query("SELECT pg_advisory_xact_lock(1126, 1)");
    phase = "existing eligible tester owner";
    const owner = (await db.query(`SELECT id FROM users WHERE id=$1 AND role='seller' AND "suspendedAt" IS NULL AND "deletionScheduledAt" IS NULL
      AND ((phone IS NOT NULL AND "phoneVerifiedAt" IS NOT NULL) OR (email IS NOT NULL AND "emailVerifiedAt" IS NOT NULL))${target.mode === "apply" ? (privateDrafts ? " FOR UPDATE" : " FOR SHARE") : ""}`, [target.ownerId])).rows;
    if (owner.length !== 1) refuse("Explicit owner must be an existing verified, unsuspended seller; coordinate mapping, never provision or switch accounts");
    phase = "unique local catalog semantics";
    const catalog = (await db.query(`SELECT b.id AS "brandId", m.id AS "modelId", c.id AS "cityId", c."regionId", t.id AS "bodyTypeId"
      FROM brands b JOIN models m ON m."brandId"=b.id CROSS JOIN cities c CROSS JOIN body_types t
      WHERE b.slug='lexus' AND m.slug='es' AND c.slug='ashgabat-city' AND t."nameEn"='Sedan'`)).rows;
    if (catalog.length !== 1) refuse("Require unique Lexus/ES, Ashgabat city and Sedan catalog entries; no catalog seed or copied IDs");
    for (const draft of drafts) Object.assign(draft["payload"] as Row, { brandId: catalog[0].brandId, modelId: catalog[0].modelId });
    const listings = (privateDrafts ? [] : RICH_SCENARIOS).map((scenario) => ({ id: scenario.id, sellerId: target.ownerId, status: "active", ...catalog[0],
      year: null, mileageKm: null, priceAmount: 1, priceCurrency: "TMT", priceTmt: 1,
      description: `Fictional review scenario: ${scenario.key}. Lexus ES 300h showroom photo study; not an offer for sale. Price is a review placeholder, vehicle year/history unverified. Synthetic ${scenario.key.endsWith("portrait") ? "portrait" : "landscape"} video test purpose reserved for a later slice; no video is ready. Photo version ${pack.version}. Credits and adaptation licences: ${creditsUrl}`,
      generationId: null, colorId: null, vin: null, condition: null, engineTypeId: null, transmissionId: null, driveTypeId: null,
      enginePower: null, locationText: null, contactPhone: null, allowCalls: false, allowChat: true, acceptsExchange: false,
      installmentAvailable: false, damaged: false, knownIssuesText: null, deletedAt: null, soldAt: null, archivedByDeletion: false }));
    const draftInventory = privateDrafts ? (await db.query(`SELECT id,"updatedAt" FROM listing_drafts WHERE "userId"=$1 ORDER BY id${target.mode === "apply" ? " FOR UPDATE" : ""}`, [target.ownerId])).rows : undefined;
    const existingDrafts = privateDrafts ? (await db.query(`SELECT * FROM listing_drafts WHERE id=ANY($1::text[])${target.mode === "apply" ? " FOR UPDATE" : ""}`, [scenarioIds])).rows : [];
    const draftInstalled = privateDrafts && existingDrafts.length === drafts.length;
    if (privateDrafts && existingDrafts.length !== 0 && !draftInstalled) refuse("Partial/consumed private drafts; inspect exact scenario IDs; never recreate or evict");
    if (privateDrafts && !draftInstalled && (draftInventory?.length ?? 0) + drafts.length > ListingsSchemas.MAX_DRAFTS_PER_USER) {
      refuse(`Draft capacity: existing=${draftInventory?.length}, required=4, cap=${ListingsSchemas.MAX_DRAFTS_PER_USER}. Complete and clean owned temporary proof BEFORE stable installation; preserve existing drafts`);
    }
    const planHash = digest(JSON.stringify({ version, database: target.databaseUrl, endpoint: target.endpoint,
      publicUrl: target.publicUrl, listings, media, credits: digest(credits),
      ...(privateDrafts ? { drafts, uploads, draftInventory: draftInventory?.filter((row) => !scenarioIds.includes(row.id)) } : {}) }));
    if (target.mode === "apply" && target.planHash !== planHash) refuse("Plan hash changed; run plan against this exact local target/owner/version");
    phase = "scenario ID/content/ownership collision check";
    const ids = privateDrafts ? [] : scenarioIds;
    const existing = (await db.query(`SELECT * FROM listings WHERE id=ANY($1::text[])`, [ids])).rows;
    const existingMedia = (await db.query(`SELECT * FROM listing_media WHERE "listingId"=ANY($1::text[]) OR id=ANY($2::text[]) OR key LIKE $3`, [ids, media.map((row) => row.id), `${root}%`])).rows;
    if (!privateDrafts && (await db.query("SELECT id FROM media_uploads WHERE key LIKE $1 LIMIT 1", [`${ROOT}%`])).rowCount) refuse("Occupied upload ownership namespace; refuse without adoption");
    if (existing.length !== 0 && existing.length !== listings.length) refuse("Partial scenario rows: refuse; inspect the two declared IDs without resetting");
    const installed = privateDrafts ? draftInstalled : existing.length === listings.length;
    const same = (actual: Row | undefined, expected: Row) => actual && Object.entries(expected).every(([key, value]) => isDeepStrictEqual(actual[key], value));
    if (privateDrafts) {
      if ((await db.query(`SELECT id FROM listing_drafts WHERE NOT (id=ANY($1::text[])) AND payload::text LIKE '%pending/b1130000-%' LIMIT 1`, [scenarioIds])).rowCount) refuse("Private upload namespace referenced by another draft; preserve it and coordinate exact collision");
      for (const draft of installed ? drafts : []) {
        const actual = existingDrafts.find((row) => row.id === draft["id"]);
        // Normal autosave can invalidate photo validation bookkeeping when JSONB
        // reorders photo fields. Resume derives completion from actual fields.
        // Accept that exact observed form; keys/order/content/step stay exact.
        const autosaved = { ...draft, payload: { ...draft["payload"] as Row, validatedSteps: ["vehicle", "specs"] } };
        if (!same(actual, draft) && !same(actual, autosaved)) refuse(`Modified/foreign private draft ${draft["id"]}; no overwrite`);
      }
      const recorded = (await db.query(`SELECT * FROM media_uploads WHERE id=ANY($1::text[]) OR key LIKE 'pending/b1130000-%'${target.mode === "apply" ? " FOR UPDATE" : ""}`, [uploads.map((row) => row["id"])] )).rows;
      if ((!installed && recorded.length) || (installed && (recorded.length !== uploads.length || uploads.some((row) => !same(recorded.find((actual) => actual.id === row["id"]), row))))) refuse("Occupied/modified/consumed private upload ownership; no adoption or repair");
      if ((await db.query(`SELECT id FROM listing_media WHERE "uploadId"=ANY($1::text[]) OR key LIKE 'pending/b1130000-%' UNION ALL SELECT id FROM listings WHERE id=ANY($2::text[])`, [uploads.map((row) => row["id"]), scenarioIds])).rowCount) refuse("Consumed/colliding private scenario or adopted object keys; no recreation");
    }
    for (const expected of installed ? listings : []) {
      const actual = existing.find((row) => row.id === expected.id);
      if (!actual || Object.entries(expected).some(([key, value]) => !isDeepStrictEqual(actual[key], value))) refuse(`Modified/occupied Listing ${expected.id}; refuse without convergence`);
    }
    if (!installed && existingMedia.length) refuse("Occupied media ID/key namespace; refuse without adoption");
    if (!privateDrafts && installed && (existingMedia.length !== media.length || media.some((expected) => {
      const actual = existingMedia.find((row) => row.id === expected.id);
      return !actual || Object.entries(expected).some(([key, value]) => !isDeepStrictEqual(actual[key], value));
    }))) refuse("Modified/occupied media IDs, ownership, order or content; refuse without repair");
    phase = "storage inventory/integrity";
    s3 = new S3Client({ endpoint: target.endpoint, region: "us-east-1", forcePathStyle: true,
      credentials: { accessKeyId: target.accessKeyId, secretAccessKey: target.secretAccessKey }, maxAttempts: 1 });
    const keys: string[] = [];
    let token: string | undefined;
    for (const inventoryPrefix of privateDrafts ? [DRAFT_ROOT, "pending/b1130000-"] : [ROOT]) do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: inventoryPrefix, ContinuationToken: token }));
      for (const object of page.Contents ?? []) keys.push(object.Key ?? refuse("Storage returned unnamed object"));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    if (!installed && keys.length) refuse(`Occupied object namespace: ${JSON.stringify(keys)}; inspect exact objects; no overwrite/delete`);
    if (installed && (keys.length !== objects.length || keys.some((key) => !objects.some((object) => object.key === key)))) refuse("Missing/extra versioned objects; explicit bounded recovery required");
    if (installed) for (const object of objects) {
      const actual = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: object.key }));
      if (actual.ContentType !== object.contentType || !actual.Body || digest(Buffer.from(await actual.Body.transformToByteArray())) !== digest(object.body)) refuse(`Corrupt/incompatible object ${object.key}; no overwrite`);
    }
    const report = { version, planHash, scenarioIds, creditsUrl,
      state: installed ? "installed" : "absent", planned: privateDrafts
        ? { drafts: installed ? 0 : 4, uploads: installed ? 0 : 24, objects: installed ? 0 : objects.length }
        : installed ? { listings: 0, media: 0, objects: 0 } : { listings: 2, media: 20, objects: objects.length } };
    if (target.mode !== "apply" || installed) {
      if (installed) await verifyPublicCredits(creditsUrl, credits);
      await db.query("ROLLBACK");
      return { ...report, writes: 0 };
    }
    phase = "conditional immutable uploads (DB transaction not committed)";
    for (const object of objects) {
      attemptedObject = object.key;
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: object.key, Body: object.body, ContentType: object.contentType,
        CacheControl: "public,max-age=31536000,immutable", IfNoneMatch: "*" }));
      createdObjects.push(object.key);
    }
    attemptedObject = undefined;
    phase = "anonymous public attribution before Listing exposure";
    await verifyPublicCredits(creditsUrl, credits);
    phase = "atomic new Listing/media inserts";
    for (const row of listings) {
      const columns = Object.keys(row);
      await db.query(`INSERT INTO listings (${columns.map((key) => `"${key}"`).join(",")},"publishedAt","createdAt","updatedAt") VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")},now(),now(),now())`, Object.values(row));
    }
    for (const row of media) {
      const columns = Object.keys(row);
      await db.query(`INSERT INTO listing_media (${columns.map((key) => `"${key}"`).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})`, Object.values(row));
    }
    phase = "recheck plan-bound draft inventory before private inserts";
    if (privateDrafts) {
      const current = (await db.query('SELECT id,"updatedAt" FROM listing_drafts WHERE "userId"=$1 ORDER BY id', [target.ownerId])).rows;
      if (!isDeepStrictEqual(current, draftInventory)) refuse("Concurrent draft modification; retain exact new objects and replan without eviction");
    }
    phase = "atomic private draft/upload inserts";
    for (const [table, rows] of [["media_uploads", uploads], ["listing_drafts", drafts]] as const) for (const row of rows) {
      const columns = Object.keys(row);
      const values = Object.entries(row).map(([key, value]) => key === "payload" ? JSON.stringify(value) : value);
      await db.query(`INSERT INTO ${table} (${columns.map((key) => `"${key}"`).join(",")}${table === "listing_drafts" ? ',"updatedAt"' : ""}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")}${table === "listing_drafts" ? ",now()" : ""})`, values);
    }
    phase = "commit (if interrupted, check exact scenario IDs before recovery)";
    await db.query("COMMIT");
    return { ...report, state: "installed", writes: listings.length + media.length + drafts.length + uploads.length + objects.length };
  } catch (error) {
    await db?.query("ROLLBACK").catch(() => undefined);
    const reason = error instanceof Refusal ? error.message : `Rich scenarios failed at ${phase}`;
    throw new Error(`${reason}. Recovery: ${JSON.stringify({ scenarioIds: (target.scenarioSet === "private-drafts" ? PRIVATE_DRAFT_SCENARIOS : RICH_SCENARIOS).map((row) => row.id),
      uploadIds: plannedUploadIds, createdObjects, attemptedObject,
      action: "No resources deleted. Inspect exact rows/keys and retained bytes; coordinate explicit recovery. Identical rerun refuses partial state." })}`);
  } finally {
    await db?.end().catch(() => undefined);
    s3?.destroy();
  }
}

async function verifyPublicCredits(url: string, expected: Buffer) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000) });
  if (!response.ok || digest(Buffer.from(await response.arrayBuffer())) !== digest(expected)) refuse("Public attribution is unavailable/incompatible; Listings remain unexposed on first apply");
}
