# Full-v3 B2 draft context test handoff, 2026-10-20

Test writer under #901 / #897 / PR904. Base is `abfd51f98dffd3817cc63339d49a383c6db7c2ea`. Branch `agent/issue-901-v3-draft-context-tests-20261020` was reserved and pushed at that base before edits. The root dispatch explicitly includes ordinary personal and admitted-business text drafts. This checkpoint adds a test; runtime acceptance remains unexecuted.

Only [CampaignFullV3.e2e.spec.ts](../../../apps/api/src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts) and this handoff change. All 23 prior cases, helpers and imports remain byte-identical. The original spec body, excluding its final four-byte suite closer, remains an exact prefix with SHA-256 `c9193fb2afc0836ef7d1429528a1ca51919044b5af3150a883655f5b5a07e57d`. There are now 24 declared cases. Existing `ListingsModule` already composes the real providers; no import or provider changes were needed.

## Scope and evidence

The appended case uses primary reservation `d1` repeated 16 times and control reservation `d2` repeated 16 times. Primary actors are buyer-a as admitted owner, sales-a as sales creator, buyer-b as outsider, plus coordinator/support for normal scoped admission. Control buyer-b signs in normally. No sales-b membership is needed. All application writes use ordinary HTTP; fixture/reset use the existing exact reservation operator. Database reads verify ownership, journal accounting and disposal.

| Bounded criterion | Authored assertions | Status |
|---|---|---|
| Explicit personal/business contexts | Owner creates personal draft without business ID; sales creates with admitted business ID; personal list and business inventory return separate exact content; database personal businessId is null | Authored, runtime masked |
| Create/read/update/resume | Reads use existing `/me/drafts` and business inventory routes; PATCH resumes saved IDs; all descriptions and generated `validatedSteps: []` are literal expectations | Authored, runtime masked |
| No silent ownership transfer | Missing business context, personal draft with business header and mismatched body/header refuse; owner edits business draft while creator remains sales-a | Authored, runtime masked |
| Current membership and saved work | Same sales session loses inventory/read and create/update authority after owner suspends membership; owner retains original saved content and can edit; restored sales session reads and resumes that work | Authored, runtime masked |
| Outsider and foreign preservation | Buyer-b and control buyer-b cannot read/edit/create admitted-business drafts or adopt personal draft; primary owner cannot adopt control personal draft; every refusal preserves both journals and draft rows | Authored, runtime masked |
| Exact disposal and retry | Literal journal/table counts, lost-response reset, redacted audits and fenced email jobs through existing assertDisposed, identical reset retry, foreign draft/content/journal survives primary disposal | Authored, runtime masked |
| Current candidate | Stale-candidate operator reset refuses without changing either reservation | Authored; HTTP has no candidate parameter |

[CreateDraftRequestSchema](../../../packages/contracts/src/schemas/listings.ts) accepts `initialPayload: { description }`; no catalog input is required. PATCH accepts `{ description }`. No shared catalog rows are read, adopted or changed. [PrismaBusinessInventoryRepository](../../../apps/api/src/modules/listings/infrastructure/PrismaBusinessInventoryRepository.ts) is the current business draft reader; no single-draft GET route is invented. [ListingOwnership](../../../apps/api/src/modules/listings/application/ListingOwnership.ts) and [CheckBusinessAuthority](../../../apps/api/src/modules/identity/application/CheckBusinessAuthority.ts) establish the expected context and membership refusal reasons.

## Literal budget, counted before writing

Caps remain 128 journal records and 2048 journal events per reservation. No deletes occur before reset. Primary records are 68: users 15, sessions 5, OTP requests 5, TOTP enrollments 2, backup codes 20, grants 3, audits 9, businesses 2, memberships 3, invitations 2, drafts 2. The control has 24: bootstrap 21, sign-in 2, personal draft 1. These are separate reservations, not a pooled cap.

| Operation | Primary new records | Primary events |
|---|---:|---:|
| Bootstrap | 21 | 21 |
| Five ordinary successful sign-ins | 10 | 20 |
| Two ordinary enrollments and first TOTP verifications | 22 | 26 |
| Admission capability grant and audit | 2 | 2 |
| Admission business, owner invitation and audit | 3 | 3 |
| Owner redeem, activation and audit | 2 | 4 |
| Sales invitation and audit | 2 | 2 |
| Sales redeem and audit | 2 | 3 |
| Two description-only draft creates | 2 | 2 |
| Four draft updates | 0 | 4 |
| Sales suspend and restore, each with audit | 2 | 4 |
| Total before reset | 68 | 91 |
| Reset, 59 deletes and 9 audit redactions | 0 | 68 |
| Total after reset | 68 | 159 |

Each successful sign-in produces OTP INSERT, consumption UPDATE, user binding UPDATE and Session INSERT. Correct-code verification does not increment attempts. Each initial TOTP setup produces enrollment INSERT/UPDATE, ten backup INSERTs and Session UPDATE. Admission adoption journals its business INSERT once. Reads, all refusals and reset retries add zero events. Control events are 21 bootstrap + 4 sign-in + 1 draft = 26 before reset, then 24 disposal mutations = 50. Literal equalities in the case enforce these budgets; they remain predictions until runtime executes them.

## First predicted RED and masked behavior

Runtime was deliberately not executed. After ordinary admission/membership setup, the first new request is owner personal draft POST, expected 201. [CreateDraft](../../../apps/api/src/modules/listings/application/CreateDraft.ts) performs no business-authority call for missing businessId. [PrismaListingDraftRepository.saveWithinLimit](../../../apps/api/src/modules/listings/infrastructure/PrismaListingDraftRepository.ts) locks the User, counts personal drafts, then INSERTs with `businessId: null`. The campaign AFTER trigger recognizes the owned User, accepts the null parent edge, then [staging-campaign.mjs](../../../scripts/staging-campaign.mjs) raises exactly `Campaign business required` because null differs from rootId. Expected HTTP symptom is 500 instead of 201, with the transaction rolled back. This is the first anticipated refusal, not a measured RED.

Once personal draft insertion is allowed, the admitted-business INSERT encounters the same root-only businessId guard. Once both contexts pass, the first personal PATCH encounters `Unsupported draft payload`: [UpdateDraft](../../../apps/api/src/modules/listings/application/UpdateDraft.ts) merges the description and always writes `validatedSteps: []`, while the campaign guard only permits description and empty media. The test preserves the real payload rather than sending guessed `media` data or bypassing the production updater. The control's personal draft also depends on the personal-context guard change. The coordinator source writer owns these source changes; this writer changed no guards.

D2 contact proof and publication remain deferred to the contact/media slice. This case never calls publish and makes no publication-authority claim from incomplete or bogus listing input. The existing contact case still has its independently reported `Unsupported campaign OTP` barrier; no contact source fix, proof row or phone seed is used here. Native Sell context choice, wizard/review identity and full rendered D2 proof remain outside this HTTP slice.

D3 successful member removal, creator account deletion, published stock/media/history survival and personal lifecycle regression remain later obligations. Suspend/restore here proves saved draft preservation only; it does not substitute for removal. No images, uploads, media, publish enablement, token/role/session/grant/domain seeding, timestamp mutation, cap, timeout, guard or concurrency changes were made. No integration/database/service runs, Docker, CI, staging/provider operations, PRs or child agents were used.

## Offline checks and handoff

- `pnpm install --offline --frozen-lockfile --ignore-scripts` passed, using the local package store. This checkout initially had no dependencies or shared build artifacts.
- `pnpm --filter @auto-tm/contracts build` passed.
- Initial `pnpm --filter @auto-tm/db build` stopped because DATABASE_URL was absent. Re-running with `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline` passed Prisma client generation and compilation. This was an offline build; no database command or connection was run.
- `pnpm --filter @auto-tm/api exec tsc --noEmit` and `pnpm --filter @auto-tm/api exec tsc6 --noEmit` passed.
- Focused `eslint src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts --max-warnings 0` passed in the API workspace.
- `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest list src/modules/identity/presentation/CampaignFullV3.e2e.spec.ts` passed static collection and listed the new case. No hooks or tests ran.
- Byte-prefix comparison against the full base SHA passed, with 23 original and 24 current declared cases. `git diff --check` and `pnpm check:agent-docs` passed.

Docs: no external dependency/API lookup was needed; the schemas, repositories, controllers, existing draft/business tests, owning overviews, glossary, D2/D3 and the [next-slices evidence](full-v3-business-graph-next-slices-20261020.md) establish this test's inputs and assertions.

Next owner is the root/coordinator. Incorporate this test-only checkpoint with the bounded source changes, then obtain the authorized hosted runtime RED/GREEN and combined acceptance evidence. All deeper assertions and numeric budgets remain unproven until then. Stop at this handoff.
