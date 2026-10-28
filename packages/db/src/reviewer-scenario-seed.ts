import { ListingsSchemas } from "@auto-tm/contracts";

const REVIEWER_SEED_AUTHORIZATION = "seed-reviewer-scenario";
const REVIEWER_PHONE_RE = /^\+993\d{8}$/;
const REVIEWER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REVIEWER_CODE_RE = /^\d{6}$/;

type ReviewerRole = "buyer" | "seller";
type ReviewerMode = "seed" | "revoke";

/**
 * Every identifier the scenario writes is a fixed UUID, not a readable slug.
 * The API's request contracts validate `brandId`, `modelId`, `regionId`,
 * `cityId`, `listingId`, and `conversationId` with `z.string().uuid()`, so
 * slug ids seeded straight into Postgres are rejected the moment a reviewer
 * tries to filter the catalogue, open a conversation on a seeded listing, or
 * join one over the realtime namespace. The values are hardcoded rather than
 * generated so the seed stays idempotent across runs and environments.
 */
const SCENARIO_UUIDS = {
  buyer1: "be255e7f-3414-49ae-8dcb-d4d6b26b94f9",
  seller1: "c410b0ef-dc1b-45f5-afe6-72f4ba5d9cb7",
  buyer2: "9ee7ec27-8ebc-40e5-b0b5-e76494c9a024",
  seller2: "dbda60a2-a7f6-4230-a993-9ec73f30dc6d",
  buyer3: "30157e67-4129-4984-afe1-c4cd014f68ed",
  brand: "4c5cf769-30a6-4a26-a789-3138bb78bd17",
  model: "928b8485-794b-401b-9ca0-34cac8e74a86",
  region: "8d3bfb24-c5fc-4841-8eaf-089771c642d2",
  city: "b760afbb-d466-4367-8c86-eea7dd392fa5",
  primaryListing: "e042b037-1e59-495d-8380-e497ad7d035e",
  reportableListing: "e2354d2f-3d4f-4860-a71f-c9f1e10c37e8",
  conversation: "a8ff59c2-6da5-45fb-b38a-563fffa989b6",
  buyerParticipant: "293dc57f-3c17-40d4-8ce2-ceb3972518b0",
  sellerParticipant: "55187868-ac2e-40fa-9074-71205d95b630",
  firstMessage: "be00bd8c-661b-45e0-9853-b4431c7e6bf0",
  secondMessage: "3ee96724-f42d-463a-943c-2a0eb5507502",
  report: "67e970fd-d408-4d87-ae3a-c9dc880223d6",
} as const;

const ACCOUNT_SLOTS: Array<{ id: string; role: ReviewerRole; displayName: string }> = [
  {
    id: SCENARIO_UUIDS.buyer1,
    role: "buyer",
    displayName: "Reviewer Buyer 1",
  },
  {
    id: SCENARIO_UUIDS.seller1,
    role: "seller",
    displayName: "Reviewer Seller 1",
  },
  {
    id: SCENARIO_UUIDS.buyer2,
    role: "buyer",
    displayName: "Reviewer Buyer 2",
  },
  {
    id: SCENARIO_UUIDS.seller2,
    role: "seller",
    displayName: "Reviewer Seller 2",
  },
  {
    id: SCENARIO_UUIDS.buyer3,
    role: "buyer",
    displayName: "Reviewer Buyer 3",
  },
];

const REVIEWER_USER_IDS = ACCOUNT_SLOTS.map((slot) => slot.id);

const CATALOG = {
  brandId: SCENARIO_UUIDS.brand,
  brandSlug: "autotm-reviewer",
  modelId: SCENARIO_UUIDS.model,
  modelSlug: "review-scenario",
  regionId: SCENARIO_UUIDS.region,
  regionSlug: "reviewer-region",
  cityId: SCENARIO_UUIDS.city,
  citySlug: "reviewer-city",
};

const PRIMARY_LISTING_ID = SCENARIO_UUIDS.primaryListing;
const REPORTABLE_LISTING_ID = SCENARIO_UUIDS.reportableListing;
const CONVERSATION_ID = SCENARIO_UUIDS.conversation;
const FIRST_MESSAGE_ID = SCENARIO_UUIDS.firstMessage;
const SECOND_MESSAGE_ID = SCENARIO_UUIDS.secondMessage;
const REPORT_ID = SCENARIO_UUIDS.report;

export interface ReviewerScenarioSeedEnv {
  appEnv: string | undefined;
  authorization: string | undefined;
  signupsEnabled: string | undefined;
  reviewDemoAccountEnabled: string | undefined;
}

export interface ReviewerScenarioSeedOptions {
  mode: ReviewerMode;
  reviewDemoAccountsJson: string;
  env: ReviewerScenarioSeedEnv;
  now: Date;
}

export interface ReviewerScenarioUser {
  id: string;
  phone: string | null;
  email: string | null;
  role: string;
  displayName: string | null;
  phoneVerifiedAt: Date | null;
  emailVerifiedAt: Date | null;
  deletionScheduledAt: Date | null;
  suspendedAt?: Date | null;
}

export interface ReviewerScenarioCatalog {
  brandId: string;
  brandSlug: string;
  modelId: string;
  modelSlug: string;
  regionId: string;
  regionSlug: string;
  cityId: string;
  citySlug: string;
}

export interface ReviewerCredentialChange {
  mode: "rotate" | "revoke";
  accounts: readonly { id: string; phone: string; email: string | null; role: ReviewerRole; displayName: string }[];
  expected: readonly ReviewerScenarioUser[];
  now: Date;
  associations: { catalog: ReviewerScenarioCatalog; listings: { id: string; sellerId: string }[] };
}

export interface ReviewerScenarioSeedStore {
  changeCredentials(input: ReviewerCredentialChange): Promise<string[]>;
  findUserById(id: string): Promise<ReviewerScenarioUser | null>;
  findUserByPhone(phone: string): Promise<ReviewerScenarioUser | null>;
  findUserByEmail(email: string): Promise<ReviewerScenarioUser | null>;
  upsertUser(input: {
    id: string;
    phone: string;
    email: string;
    displayName: string;
    role: ReviewerRole;
  }): Promise<ReviewerScenarioUser>;
  revokeUser(input: {
    id: string;
    revokedPhone: string;
    displayName: string;
  }): Promise<void>;
  deleteSessionsByUserIds(userIds: string[]): Promise<number>;
  invalidatePushDevicesByUserIds(userIds: string[], invalidatedAt: Date): Promise<number>;
  preflightSeed(input: { catalog: ReviewerScenarioCatalog; listings: { id: string; sellerId: string }[] }): Promise<string | null>;
  upsertCatalog(input: ReviewerScenarioCatalog): Promise<void>;
  upsertListing(input: {
    contactPhone: string;
    id: string;
    sellerId: string;
    priceAmount: number;
    description: string;
    publishedAt: Date;
    damaged: boolean;
    knownIssuesText: string | null;
  }): Promise<void>;
  upsertListingMedia(input: {
    id: string;
    listingId: string;
    key: string;
    sortOrder: number;
    fixtureIndex: number;
  }): Promise<void>;
  upsertConversation(input: {
    id: string;
    listingId: string;
    buyerId: string;
    sellerId: string;
    lastMessageAt: Date;
    lastMessageId: string;
  }): Promise<void>;
  upsertConversationParticipant(input: {
    id: string;
    conversationId: string;
    userId: string;
    lastReadAt: Date | null;
    lastDeliveredAt: Date | null;
  }): Promise<void>;
  upsertMessage(input: {
    id: string;
    conversationId: string;
    senderId: string;
    kind: "text" | "post_ref";
    body: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  }): Promise<void>;
  upsertContentReport(input: {
    id: string;
    reporterUserId: string;
    targetType: "listing";
    targetId: string;
    reason: "misleading";
    details: string;
  }): Promise<void>;
  createAuditLog(input: {
    action: string;
    targetType: string;
    targetId: string;
    details: Record<string, unknown>;
  }): Promise<void>;
}

interface ParsedReviewerAccount {
  phone: string;
  email: string;
  code: string;
}

interface ReviewerScenarioAccount {
  id: string;
  phone: string;
  email: string;
  role: ReviewerRole;
  displayName: string;
}

export interface ReviewerScenarioSeedResult {
  exitCode: number;
  message: string;
  seededUserIds: string[];
  rotatedUserIds: string[];
  revokedUserIds: string[];
}

function parseEnabledFlag(value: string | undefined): boolean {
  return value === "true";
}

function safeFailure(message: string): ReviewerScenarioSeedResult {
  return {
    exitCode: 1,
    message,
    seededUserIds: [],
    rotatedUserIds: [],
    revokedUserIds: [],
  };
}

export function parseReviewerScenarioAccounts(
  reviewDemoAccountsJson: string,
): ReviewerScenarioAccount[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(reviewDemoAccountsJson);
  } catch {
    throw new Error("Reviewer demo accounts JSON is invalid");
  }

  if (!Array.isArray(parsed) || parsed.length < 3 || parsed.length > 5) {
    throw new Error("Reviewer scenario seed requires 3 to 5 reviewer accounts");
  }

  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();
  return parsed.map((entry: unknown, index: number) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as ParsedReviewerAccount).phone !== "string" ||
      typeof (entry as ParsedReviewerAccount).email !== "string" ||
      typeof (entry as ParsedReviewerAccount).code !== "string"
    ) {
      throw new Error("Each reviewer account must include a phone, email, and code");
    }

    const phone = (entry as ParsedReviewerAccount).phone;
    if (!REVIEWER_PHONE_RE.test(phone)) {
      throw new Error("Reviewer account phones must be +993 E.164 values");
    }
    if (seenPhones.has(phone)) {
      throw new Error("Reviewer account phones must be unique");
    }
    seenPhones.add(phone);

    const email = (entry as ParsedReviewerAccount).email;
    if (
      email !== email.trim().toLowerCase() ||
      email.length > 254 ||
      !REVIEWER_EMAIL_RE.test(email)
    ) {
      throw new Error("Reviewer account emails must be normalized valid addresses");
    }
    if (seenEmails.has(email)) {
      throw new Error("Reviewer account emails must be unique");
    }
    seenEmails.add(email);

    if (!REVIEWER_CODE_RE.test((entry as ParsedReviewerAccount).code)) {
      throw new Error("Reviewer account codes must be exactly 6 digits");
    }

    const slot = ACCOUNT_SLOTS[index];
    if (!slot) {
      throw new Error("Reviewer account slot is not available");
    }

    return {
      id: slot.id,
      phone,
      email,
      role: slot.role,
      displayName: slot.displayName,
    };
  });
}

function assertSeedEnvironment(options: ReviewerScenarioSeedOptions): ReviewerScenarioSeedResult | null {
  if (options.env.authorization !== REVIEWER_SEED_AUTHORIZATION) {
    return safeFailure(
      "Reviewer scenario seed refused: set REVIEWER_SCENARIO_SEED_AUTHORIZATION=seed-reviewer-scenario",
    );
  }

  if (!parseEnabledFlag(options.env.reviewDemoAccountEnabled)) {
    return safeFailure(
      "Reviewer scenario seed refused: REVIEW_DEMO_ACCOUNT_ENABLED must be true",
    );
  }

  if (options.mode === "seed" && options.env.signupsEnabled !== "false") {
    return safeFailure(
      "Reviewer scenario seed refused: SIGNUPS_ENABLED must be false",
    );
  }

  const allowedAppEnvs = new Set(["staging", "production"]);
  if (!allowedAppEnvs.has(options.env.appEnv ?? "")) {
    return safeFailure(
      "Reviewer scenario seed refused: APP_ENV must be staging or production",
    );
  }

  return null;
}

async function assertNoPrivilegedOrHijackedAccounts(
  store: ReviewerScenarioSeedStore,
  accounts: ReviewerScenarioAccount[],
): Promise<ReviewerScenarioSeedResult | null> {
  for (const account of accounts) {
    const byId = await store.findUserById(account.id);
    if (byId && byId.role !== "buyer" && byId.role !== "seller") {
      return safeFailure(
        `Reviewer scenario seed refused: configured user slot ${account.id} is privileged`,
      );
    }

    const byPhone = await store.findUserByPhone(account.phone);
    if (byPhone && byPhone.id !== account.id) {
      return safeFailure(
        "Reviewer scenario seed refused: a reviewer phone is already owned by another user",
      );
    }
    if (byPhone && byPhone.role !== "buyer" && byPhone.role !== "seller") {
      return safeFailure(
        "Reviewer scenario seed refused: a reviewer phone resolves to a privileged user",
      );
    }

    const byEmail = await store.findUserByEmail(account.email);
    if (byEmail && byEmail.id !== account.id) {
      return safeFailure(
        "Reviewer scenario seed refused: a reviewer email is already owned by another user",
      );
    }
    if (byEmail && byEmail.role !== "buyer" && byEmail.role !== "seller") {
      return safeFailure(
        "Reviewer scenario seed refused: a reviewer email resolves to a privileged user",
      );
    }
  }

  return null;
}

export async function runReviewerScenarioSeed(
  store: ReviewerScenarioSeedStore,
  options: ReviewerScenarioSeedOptions,
): Promise<ReviewerScenarioSeedResult> {
  const environmentFailure = assertSeedEnvironment(options);
  if (environmentFailure) return environmentFailure;

  let accounts: ReviewerScenarioAccount[];
  try {
    accounts = parseReviewerScenarioAccounts(options.reviewDemoAccountsJson);
  } catch (error) {
    return safeFailure(error instanceof Error ? error.message : String(error));
  }

  const associations = { catalog: CATALOG,
    listings: [PRIMARY_LISTING_ID, REPORTABLE_LISTING_ID].map(id => ({ id, sellerId: SCENARIO_UUIDS.seller1 })),
  };
  if (options.mode === "revoke") {
    const expected: ReviewerScenarioUser[] = [];
    for (const slot of ACCOUNT_SLOTS) {
      const existing = await store.findUserById(slot.id);
      if (!existing) continue;
      if (existing.role !== slot.role || existing.deletionScheduledAt !== null || existing.suspendedAt != null ||
          !existing.phoneVerifiedAt || !existing.emailVerifiedAt) {
        return safeFailure("Reviewer scenario revocation refused: privileged or unsupported reviewer source");
      }
      expected.push(existing);
    }
    const associationFailure = await store.preflightSeed(associations);
    if (associationFailure) return safeFailure(`Reviewer scenario revocation refused: ${associationFailure}`);
    const revokedUserIds = expected.length === 0 ? [] : await store.changeCredentials({
      mode: "revoke", expected, now: options.now, associations,
      accounts: ACCOUNT_SLOTS.map(slot => ({ ...slot, phone: `revoked:${slot.id}`, email: null, displayName: `Revoked ${slot.id}` })),
    });
    return { exitCode: 0, message: `Reviewer scenario revoked ${revokedUserIds.length} accounts`,
      seededUserIds: [], rotatedUserIds: [], revokedUserIds };
  }

  const accountFailure = await assertNoPrivilegedOrHijackedAccounts(store, accounts);
  if (accountFailure) return accountFailure;

  // Discover the whole account plan before catalog, account, media, audit or storage effects.
  const existingUsers = new Map<string, ReviewerScenarioUser>();
  for (const account of accounts) {
    const existing = await store.findUserById(account.id);
    if (!existing) continue;
    if (existing.role !== account.role || existing.suspendedAt != null ||
        !existing.phone || !existing.email || !existing.phoneVerifiedAt || !existing.emailVerifiedAt || existing.deletionScheduledAt !== null) {
      return safeFailure("Reviewer scenario seed refused: unsupported existing-source eligibility or verification");
    }
    existingUsers.set(account.id, existing);
  }
  const sellerAccount = accounts.find(account => account.role === "seller");
  if (!sellerAccount) return safeFailure("Reviewer scenario seed requires a seller account");
  const associationFailure = await store.preflightSeed({ catalog: CATALOG,
    listings: [PRIMARY_LISTING_ID, REPORTABLE_LISTING_ID].map(id => ({ id, sellerId: sellerAccount.id })),
  });
  if (associationFailure) return safeFailure(`Reviewer scenario seed refused: ${associationFailure}`);
  const changedIds = accounts.filter(account => {
    const existing = existingUsers.get(account.id);
    return existing && (existing.phone !== account.phone || existing.email !== account.email);
  }).map(account => account.id);
  const rotatedUserIds = changedIds.length === 0 ? [] : await store.changeCredentials({
    mode: "rotate", accounts, expected: [...existingUsers.values()], now: options.now, associations,
  });
  const seededUserIds: string[] = [];
  for (const account of accounts) {
    // Equal source converges without refreshing verification timestamps or User.updatedAt.
    const existing = existingUsers.get(account.id);
    const user = existing?.displayName === account.displayName ? existing : await store.upsertUser(account);
    seededUserIds.push(user.id);
  }

  const buyer = accounts.find((account) => account.role === "buyer");
  const seller = accounts.find((account) => account.role === "seller");
  const reporter = accounts.find(
    (account) => account.role === "buyer" && account.id !== buyer?.id,
  ) ?? buyer;
  if (!buyer || !seller || !reporter) {
    return safeFailure("Reviewer scenario seed requires distinct buyer and seller accounts");
  }

  await store.upsertCatalog(CATALOG);
  await store.upsertListing({
    id: PRIMARY_LISTING_ID,
    sellerId: seller.id,
    contactPhone: seller.phone,
    priceAmount: 245000,
    description:
      "Store review scenario listing. Deterministic demo data only; not a real vehicle.",
    publishedAt: options.now,
    damaged: false,
    knownIssuesText: null,
  });
  await store.upsertListing({
    id: REPORTABLE_LISTING_ID,
    sellerId: seller.id,
    contactPhone: seller.phone,
    priceAmount: 198000,
    description:
      "Reportable store review scenario listing with intentionally incomplete disclosure copy.",
    publishedAt: options.now,
    damaged: true,
    knownIssuesText: "Rear bumper needs repainting. Demo data only.",
  });

  for (const listingId of [PRIMARY_LISTING_ID, REPORTABLE_LISTING_ID]) {
    for (let index = 0; index < ListingsSchemas.MIN_LISTING_PHOTOS; index++) {
      await store.upsertListingMedia({
        id: `${listingId.slice(0, -3)}${String(100 + index).padStart(3, "0")}`,
        listingId,
        key: `reviewer-scenario/${listingId}/${index}/original.webp`,
        sortOrder: index,
        fixtureIndex: index,
      });
    }
  }

  const firstMessageAt = new Date(options.now.getTime() - 60_000);
  await store.upsertConversation({
    id: CONVERSATION_ID,
    listingId: PRIMARY_LISTING_ID,
    buyerId: buyer.id,
    sellerId: seller.id,
    lastMessageAt: options.now,
    lastMessageId: SECOND_MESSAGE_ID,
  });
  await store.upsertConversationParticipant({
    id: SCENARIO_UUIDS.buyerParticipant,
    conversationId: CONVERSATION_ID,
    userId: buyer.id,
    lastReadAt: options.now,
    lastDeliveredAt: options.now,
  });
  await store.upsertConversationParticipant({
    id: SCENARIO_UUIDS.sellerParticipant,
    conversationId: CONVERSATION_ID,
    userId: seller.id,
    lastReadAt: firstMessageAt,
    lastDeliveredAt: firstMessageAt,
  });
  await store.upsertMessage({
    id: FIRST_MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: buyer.id,
    kind: "text",
    body: "Hello, is this review scenario listing still available?",
    metadata: null,
    createdAt: firstMessageAt,
  });
  await store.upsertMessage({
    id: SECOND_MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: seller.id,
    kind: "post_ref",
    body: null,
    metadata: {
      listingId: REPORTABLE_LISTING_ID,
      snapshot: {
        brandId: CATALOG.brandId,
        modelId: CATALOG.modelId,
        displayPriceTmt: 198000,
        priceCurrency: "TMT",
        status: "active",
        year: 2020,
      },
    },
    createdAt: options.now,
  });

  await store.upsertContentReport({
    id: REPORT_ID,
    reporterUserId: reporter.id,
    targetType: "listing",
    targetId: REPORTABLE_LISTING_ID,
    reason: "misleading",
    details:
      "Store review scenario report. Deterministic demo data only; not a real moderation case.",
  });

  if (rotatedUserIds.length === 0) await store.createAuditLog({
    action:
      rotatedUserIds.length > 0
        ? "REVIEWER_SCENARIO_ROTATE"
        : "REVIEWER_SCENARIO_SEED",
    targetType: "reviewer_scenario",
    targetId: "store-review",
    details: {
      mode: "seed",
      accountCount: seededUserIds.length,
      seededUserIds,
      rotatedUserIds,
      listingIds: [PRIMARY_LISTING_ID, REPORTABLE_LISTING_ID],
      conversationId: CONVERSATION_ID,
      reportId: REPORT_ID,
      occurredAt: options.now.toISOString(),
    },
  });

  return {
    exitCode: 0,
    message: `Reviewer scenario converged ${seededUserIds.length} accounts, 2 listings, 1 conversation, and 1 report`,
    seededUserIds,
    rotatedUserIds,
    revokedUserIds: [],
  };
}

export const reviewerScenarioSeedIds = {
  userIds: REVIEWER_USER_IDS,
  buyerIds: [SCENARIO_UUIDS.buyer1, SCENARIO_UUIDS.buyer2, SCENARIO_UUIDS.buyer3] as const,
  sellerIds: [SCENARIO_UUIDS.seller1, SCENARIO_UUIDS.seller2] as const,
  brandId: CATALOG.brandId,
  modelId: CATALOG.modelId,
  regionId: CATALOG.regionId,
  cityId: CATALOG.cityId,
  primaryListingId: PRIMARY_LISTING_ID,
  reportableListingId: REPORTABLE_LISTING_ID,
  conversationId: CONVERSATION_ID,
  buyerParticipantId: SCENARIO_UUIDS.buyerParticipant,
  sellerParticipantId: SCENARIO_UUIDS.sellerParticipant,
  firstMessageId: FIRST_MESSAGE_ID,
  secondMessageId: SECOND_MESSAGE_ID,
  reportId: REPORT_ID,
};
