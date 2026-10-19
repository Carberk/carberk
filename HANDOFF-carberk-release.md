# Handoff: Carberk first release (state on 2026-10-09)

Written for a new session that continues this work. It contains no credentials, phone numbers or codes. Where a secret is needed, the file that holds it is named.

## 1. What this project is

- Vehicle marketplace for Turkmenistan. Repo `bagtyyarkovusov/auto.tm-rewrite`, pnpm monorepo: `apps/api` (NestJS), `apps/worker`, `apps/web`, `apps/admin`, `apps/mobile` (Expo SDK 55, React Native, expo-router, NativeWind), `packages/db`, `packages/contracts`, `packages/ui`.
- **The product was renamed from AutoTM to Carberk on 2026-10-09** (another app called "awtotm" appeared). Parent company: Alpha Motors. Decision record: `docs/adr/0093-carberk-is-the-public-product-name.md`.
- Everything a user sees says Carberk. Internal names did **not** change and must not be "fixed": Play package `com.auto_tm.ynamly`, bundle id `tm.auto.app`, link scheme `autotm://`, `@auto-tm/*` packages, Expo slug `auto-tm`, env var and cookie names, Railway project `auto-tm`, the repo name, and all domains (`autotm.bagtyyar.dev`, universal-link domain `auto.tm`). The domain moves only after the release.
- The Play developer account is **not** under the Alpha Motors name.

## 2. Where things stand

| Item | State |
|---|---|
| main | `960f190d` plus docs/ignore-file commits after it; app code equals `6796c845` (PR 788, the rename) |
| Staging | Auto-deploys from main. Passed the reviewer smoke 8 of 8 on `6796c845` |
| Production (Railway) | api, worker, web, admin all on `6796c845`. Promoted 2026-10-09, evidence in `docs/prd/ops/evidence/promotion-2026-10-09-carberk.md` |
| Production flags | `SIGNUPS_ENABLED=false`, `SMS_DRIVER=mock`, `REVIEW_DEMO_ACCOUNT_ENABLED=true`. Public sign-up is closed and no real SMS is sent |
| Production accounts | 5 reviewer accounts, 30 tester accounts (already seeded), 1 admin (the founder, created 2026-10-09 under ADR-0045; founder holds the authenticator and backup codes) |
| Store build | EAS `production` build `72a3b8f8-8773-4588-8c7a-fa3ae79fee3d`, version 2.0.0, versionCode **6**, AAB SHA-256 `ea6de1611cd1fc00aec0a07e51d766fc8120eda4555077b3ddf9bd8f05faa0cf`, signed with the upload key whose SHA-1 starts `35:AF:4D:C3` (matches Play Console). versionCode 5 was consumed by a failed build |
| Play Console | Build uploaded to **Closed testing - Alpha**. 13 changes (build, listings, declarations, sign-in details) were **approved by Google** the same day. The founder was told to press "Publish 13 changes"; a first tester has since installed from Play and signed in, so it is published |
| Production access | **Applied 2026-10-09** (second application; the first, last year, was sent back for more testing). Google says 7 days or less. Not yet answered |
| First real-device feedback | Recorded in issue 794 (see section 6). No work started |

## 3. What happened in this session, in order

1. Final fixes merged before the rename: PRs 774, 776, 778, 779, 782, 783, 784, 785, 787.
2. Rebrand: brand kit in the founder's Downloads reviewed; founder chose the wordmark **"carberk."** in Poppins ExtraBold (lowercase, round dot) and the icon **"c."** white on `#E60000`. PR 788 renamed 211 user-visible strings, replaced icon, adaptive icon layers, launch image and header logo, and rewrote the store pack. Brand rules and vector files: `docs/prd/ops/brand/`.
3. Production promotion of `6796c845` (PR 789 evidence, PR 790 admin record). First api build failed on a Railway package-store error; the retry succeeded. Two migrations applied (`20261007130000_exclusive_upload_adoption`, `20261007130100_backfill_upload_adoption_state`). A database dump was taken first and is still on the Postgres volume at `/var/lib/postgresql/data/backups/pre-carberk-6796c845-20261009.dump`.
4. First EAS build failed in prebuild: the root `.gitignore` rule `images/` made EAS drop `apps/mobile/assets/images`. Fixed in PR 791 with `!apps/mobile/assets/images/`.
5. Release audit of the AAB recorded on issue 325. Submission recorded on issues 327 and 329.
6. Founder decided the Turkmen store text goes under the **Turkish (tr-TR) listing, set as default**, because Play has no Turkmen language (PR 792). Do not question this again.

## 4. Decisions the founder made (do not reopen)

- Product name Carberk; logo "carberk." in Poppins ExtraBold; icon "c."; red `#E60000`; app UI font stays Geist.
- "by Alpha Motors" appears on the About screen, web home page, store description and feature graphic. Turkmen line: "Alpha Motors bilen arzan däl-de, amatly ulag satyn al."
- Keep the Play package name, link scheme and domains.
- Turkmen store listing under tr-TR as default; English and Russian as translations.
- The founder's phone is the production admin identity.
- No subagents and no Kimi in the orchestration session; work inline. Kimi was near its quota.
- The founder gave explicit go-ahead for the production promotion and for the EAS build. A new session should ask again before any new production change or any new store build.

## 5. Waiting on Google or the founder

- Google: decision on production access.
- Founder: read of the Russian SMS wording "Carberk 123456: номер будет в объявлении. Не давайте код без согласия" (changed from "покажут" to fit 70 characters) and of "от Alpha Motors" / "Carberk — проект Alpha Motors."
- Founder: decision on how real users sign in before a public launch (email only first, or phone too once a real SMS route exists). This is the main work left before going public: `SIGNUPS_ENABLED` and `SMS_DRIVER` in production.
- Founder: Pre-launch report screenshot from Play Console (Test and release → Testing → Pre-launch report).
- Founder: allocation of the 30 tester accounts to people. Each tester gets only their own entry, privately.
- Founder asked a tester for a screen recording of his session; not received in this session.

## 6. Next build (versionCode 7): known work, none started

| Issue | What |
|---|---|
| 794 | **Founder's feedback from the first real phone.** (a) The launch screen is "so bad": in dark theme the red "c." sits in a white square on a dark background, and the founder wants a distinctive launch screen. Likely cause: `expo-splash-screen` in `apps/mobile/app.config.js` has only `backgroundColor: "#FFFFFF"` and no dark variant. Get the founder's approval of a design before building. (b) Turkmen wording: mileage label "Ýörelgesi" → "Geçen ýoly"; "Neşir edildi" → "Post edildi"; for an edited Listing "Posta üýtgeşme edildi" (confirm diacritics with the founder). Strings are in `apps/mobile/src/i18n/resources.ts` |
| 793 | Declare the camera as optional so tablets and Chromebooks without one can install (Play dropped 461 device models) |
| 786 | Home buttons stopped responding once on the emulator; not reproduced in five tries. Ask testers for exact steps if they see it |
| 780, 781 | Invalid VIN shows no error text; Filters pill over Call button and OTP cells losing focus |
| 763 | Android bottom bar decision (founder) |

The app has **no over-the-air updates** (`expo-updates` is not installed), so every app change needs a new build through Play. Server, web and store-text changes do not.

## 7. How to do the recurring tasks

**Merge a PR:** `gh pr ready <n>` then `gh pr merge <n> --squash` once the required `pr` check is green (about 9 minutes for code, 1 minute for docs). The founder authorised merges for the session; a new session should confirm that still holds.

**Local gates in a fresh worktree:** `pnpm install --frozen-lockfile`, `pnpm --filter @auto-tm/contracts build`, then `DATABASE_URL=postgresql://u:p@127.0.0.1:5999/none pnpm turbo run test --continue`, `pnpm typecheck`, `pnpm lint`. Tests that need Docker (db and api e2e) fail locally and are covered by the hosted `pr` check.

**Store build:** this Mac is signed in to Expo as `tkmdevelopers`. From a clean checkout of main: `cd apps/mobile && npx --yes eas-cli@latest build --platform android --profile production --non-interactive --no-wait --json`. Check the upload contents first with `eas build:inspect --platform android --profile production --stage archive --output <dir> --force`. The AAB URL is in `eas build:view <id> --json` under `artifacts`. Build logs are brotli-compressed; decode with Node's `zlib.brotliDecompressSync`.

**Audit an AAB:** `keytool -printcert -jarfile <file>.aab` for the certificate; the manifest is protobuf at `base/manifest/AndroidManifest.xml` inside the zip.

**Promote to production** (only with the founder's explicit yes naming the commit): follow Step 4 of `docs/prd/ops/80-deployment-runbook.md`. Method used: GraphQL mutation `serviceInstanceDeployV2(serviceId, environmentId, commitSha)` against `https://backboard.railway.com/graphql/v2` with the token in `~/.railway/config.json`, **api first**, wait for `https://api.autotm.bagtyyar.dev/healthz` to report the commit, then worker, admin, web. Railway project `176ddec0-dd65-4087-b82c-798599fc2ebe`; production environment `c628b9bf-08ef-45f6-976f-3d646e0ebfbd`; staging `652abc79-fdb0-48b0-9f6c-ad0ff572d7b2`; services api `6db6f1b1-5c7a-4033-88d0-53f5f315bfc0`, worker `24aa02e0-25a9-4e80-9cc2-c1795ef82091`, web `f3c5888b-d303-44b1-bc6e-3d775dad4639`, admin `69ba9f86-0000-4460-8165-de69b289b36e`, Postgres `30dda76c-1a50-457f-a08a-dce846eb9843`. Production has no deploy triggers. Do not use the Railway MCP `list-deployments` tool (huge output); use `railway deployment list --service <s> --environment <e>`.

**Smoke test:** `SMOKE_CREDENTIALS_FILE=~/.autotm-ops/<staging|production>/smoke-credentials.json node scripts/staging-reviewer-flow-smoke.mjs`. On production the admin check cannot run, because the admin authenticator secret stays with the founder; 5 of 6 is the expected result.

**Admin sign-in code:** production SMS is mocked, so the code appears only in the api log as `[mock] OTP for ***NNNN (...): <code>`. Read it with `railway logs --service api --environment production` and give it to the founder; never sign in as the admin.

**Addresses:** production api `https://api.autotm.bagtyyar.dev` (root returns 404 by design; use `/healthz`, `/readyz`), web `https://autotm.bagtyyar.dev`, admin `https://admin-production-cea2.up.railway.app`. Staging api `https://api-staging-2861.up.railway.app`, web `https://web-staging-e9c7.up.railway.app`, admin `https://admin-staging-a851.up.railway.app`. The name `staging.autotm.bagtyyar.dev` in the EAS `staging` profile has no domain attached and does not load.

## 8. Where files are

| What | Where |
|---|---|
| Store text, icon, feature graphics, screenshots (en, ru, tk) | `docs/prd/ops/play-console-submission/` and a copy in `~/Downloads/Carberk first release assets/` (also holds the AAB and release notes) |
| Play Console answers and checklist | `docs/prd/ops/88-play-console-submission.md` |
| Brand rules, vector logo, asset generator | `docs/prd/ops/brand/` |
| Reviewer accounts for production | `~/.autotm-ops/production/` (mode 600). `play-app-access-short.txt` is what was pasted into Play's Sign in details |
| Tester accounts (30) | `~/.autotm-secrets/tester-accounts.json` (mode 600) |
| Android and iOS native build tree | `.claude/worktrees/agent-aed7041e61af0ecee/apps/mobile/{android,ios}` (detached at the rename commit) |
| Rebrand worktree | `.claude/worktrees/rebrand-carberk` |

Device builds on this Mac: Android emulator AVD `Medium_Phone_API_36.1` must start with `-no-snapshot -gpu swiftshader_indirect`; build script `/tmp/abuild.sh`; iOS script `/tmp/ibuild.sh` (workspace is now `Carberk.xcworkspace`). `/tmp` files may be gone in a new session; the recipes are short and can be rebuilt from `docs/agents/mobile-expo.md`.

## 9. Rules that still apply

- Never print or commit reviewer, tester or admin values (phones, emails, codes). Read them from the secret files inside a script. One tester entry was pasted into the previous chat by the founder; treat it as exposed.
- Do not change phones or emails in the tester list. Do not use "Delete account" on tester accounts.
- Production changes, promotions and store builds need the founder's go-ahead in chat each time.
- Do not use the founder's own phone number for automated tests.
- Merged ADRs are immutable; older documents keep the name AutoTM on purpose.
- One heavy job at a time on this Mac (build, emulator, test run).
- The founder reads at a non-native English level and prefers short, plain answers with clear steps.

## 10. Things said in this session that turned out wrong or unverified

- "The Android session survived the update" was not verified; the emulator app was later found signed out.
- The exact AAB had not run on any device when it was submitted. A tester has since installed it from Play and signed in; nothing beyond browsing has been reported yet.
- The sign-in email with the new sender name, push notifications, and the pre-launch report have not been checked.
- PRs 776, 779, 783, 785 and 788 were merged on the orchestrator's own review, without an independent reviewer, because the founder asked for no subagents.
- The first production api build failure (`ERR_PNPM_ENOENT`) was not explained; it did not recur.

## 11. Small clean-ups left

- Delete the database dump from the Postgres volume once the release is stable.
- Remove worktrees no longer needed (`rebrand-carberk`, `docs-play-pack`, `fix-chat-separator-vin`, agent worktrees) and the untracked `.reference-preview/` and `play-console-submission/` folders in the orchestration worktree (never commit `.reference-preview/`).
- The founder's Desktop folder `Carberk-Play-pack` duplicates the Downloads folder.
- Staging test Listings ("TEST 1", "TEST 3") are still published on staging.
