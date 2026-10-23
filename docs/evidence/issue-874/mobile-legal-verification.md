# #874 mobile and disclosure checkpoint

Campaign #897 / draft integration PR #904. Supplied assembled base `709e10c989ad82703ba8dd7067b9fa42393a53af` includes the API checkpoint `542c74bb`, retention #899, staff #900 and protocol/native proof slices. This continuation owns only mobile and disclosure; schema/contracts/identity/admin remain with their campaign writers.

The fresh detached writer checkout is `/Users/bagtyyar/.t3/worktrees/auto.tm-rewrite/issue-874-mobile-legal`, pushed through `HEAD:agent/issue-874`. The previous API checkout is preserved untouched. This checkpoint is for assembly, not issue closure or activation.

## Behavior evidence

Approved authority: issue #874, accepted ADR-0105 and PRD32 Listing views. Red checkpoint `834ac6b9` has seven genuine rendered failures for absent locale figures and absent dedicated view signals, with three already-satisfied exclusions. `/tmp/carberk-874-mobile-red2.log` preserves that run. Earlier `4a4068cf` preserves initial display reds, but its three ID-label assertion failures were test setup, not behavioral evidence.

`src/listings/detail/listingViews.spec.tsx` renders the actual full route and its children with real API/auth/catalog/config hooks and MSW. Only native navigation, storage, randomness and foreground-state boundaries use fakes. No feature hooks/components or API client are mocked.

| Criterion | Evidence | Result |
|---|---|---|
| Dedicated POST after two focused foreground seconds on full loaded detail | Real route, MSW 204 and exact header readback, 1999/2001 ms | pass |
| Card preview/pending detail does not count | Real cached card preview with gated full-detail response, five seconds without signal or ID creation | pass |
| Background/blur/departure cancel dwell; return starts fresh | Foreground/navigation boundary events and network signal readback; delayed storage across background cannot release an expired dwell | pass |
| One signal per screen visit; identity persists across visits | Remount, real sandbox-storage fake and changing random UUID source; both visits send the same persisted ID | pass |
| Default-closed collection and no identifier creation | Absent/empty activation flag, no request or stored ID after four seconds | pass |
| Owner/closed Listing exclusion; reading survives storage failure | Authenticated seller through real session parsing; sold/archived route cases; storage-failure route remains readable | pass |
| Loaded counts only, no optimistic self increment | Unchanged rendered 1234/9 after successful signal | pass |
| Full locale-grouped RU/TK/EN counts and plurals | Real detail/footer and owner card renders, RU 1/2/5/21, EN 1/21, TK 1; 1234 grouping in all locales | pass |
| Zero total hidden, zero today omitted, released response without today accepted | Real components with required legacy total and additive/missing today | pass |
| Closed buyer counts hidden, owner retained | Sold detail buyer versus owner renders | pass |
| Privacy/store text | Founder-approved EN sentence, corresponding RU/TK privacy bullets; conditional App interactions and independent required install-ID store declarations | inspected; docs red-test exemption |
| Actual native UI look and native UUID linkage | Final assembled native build/light+dark screenshots in RU/TK/EN; native crypto module must be in rebuilt binary | blocked: consolidated campaign acceptance owner |
| Deployed API/retention/disabled and enabled fixture acceptance | Parent hosted fixture and reserved staging, including actual cleanup and installed-client response | blocked: parent acceptance owner |
| Shared business owner exclusion | Replace seller-User comparison with #902/#908 shared principal in API eligibility and native ownership | blocked: #902/#908 integration owner |

The local sandbox ID is cryptographically random UUIDv4 from Expo Crypto, stored in AsyncStorage. Existing Android `allowBackup:false` and avoiding iOS Keychain prevent the identifier from being intentionally preserved by app backup/Keychain across reinstall. Startup creates it only with `EXPO_PUBLIC_LISTING_VIEWS_ENABLED=true`, after onboarding has made its fresh-install storage decision. Storage failure suppresses counting and never blocks reading/launch. The identifier is only attached to the dedicated POST, never generic GETs or analytics. The API remains the authoritative admin/owner/deduplication guard.

## Checks

- Mobile full suite: 318 files / 3517 tests passed before the last additional race regression. Final changed file: 20 tests passed after that addition. Logs `/tmp/carberk-874-mobile-unit.log` and `/tmp/carberk-874-mobile-final-focused.log`.
- Mobile TS7 and TS6, ESLint, Expo dependency compatibility and iOS export passed. Logs `/tmp/carberk-874-mobile-{typecheck,ts6,lint,expo-check,export}.log`.
- Web full suite: 12 files / 137 tests passed; TS7/TS6 and ESLint passed. Logs `/tmp/carberk-874-web-{unit,typecheck,ts6,lint}.log`.
- Contracts rebuilt before consumers; agent-docs links/headings and glossary gates passed; `git diff --check` passed.
- The earlier full mobile run found missing fallback plural keys; fixed with matching explicit locale entries. An added owner test used an invalid fake role and a nondeleting fake storage adapter, causing a test-worker OOM; fixed to actual `seller` role and real deletion semantics. The same focused owner/complete route tests then passed. No production memory problem is claimed from that fixture failure.

Docs: https://docs.expo.dev/versions/v55.0.0/sdk/crypto/ verifies cryptographic randomUUID and native-module installation. Expo55 selects `expo-crypto@55.0.19`, published 2026-08-25; registry peerDependencies `expo:*`, no engines restriction. Installed types, both compilers and `expo install --check` verify compatibility. Receipts `/tmp/carberk-874-crypto-doc.html` and `/tmp/carberk-874-crypto-metadata.json`. No unrelated dependency upgrades.

No local Docker, simulator boot, native session, Metro development server, live collection, secret provisioning, deployment or Play Console mutation occurred. Native look, rebuilt native module linkage, independent final review and deployed acceptance remain required. Keep `EXPO_PUBLIC_LISTING_VIEWS_ENABLED` absent/false and server `LISTING_VIEWS_ENABLED=false` until retention, disclosure, lawful collection basis and campaign activation gates pass. No analytics events/identifiers were added.
