# Public readers and sharing evidence

The issue branch adds anonymous Listing/showroom API projections and localized web/native readers, seller-type filtering, actual business identity on feed/detail, HTTPS association configuration, and system Share/Copy controls. It does not establish deployed or installed-app acceptance.

| Criterion | Evidence | Result |
|---|---|---|
| Anonymous current public projection, sold facts without new contact, hidden business lifecycle, private evidence excluded | `PublicMarketplace.e2e.spec.ts`, real HTTP/PostgreSQL suite | Hosted execution required |
| Localized reader identity, stable target locale links, network schema/refusal behavior | Web `Reader.spec.ts`, `readers.spec.ts` | Pass |
| Seller choice preserved in draft/applied route and count request | `ListingFilter.spec.ts`, `resultsRouteState.spec.ts`, rendered `SearchParametersForm.count.spec.tsx` | Pass |
| Business card identity and showroom navigation | `ListFeed.spec.ts`, rendered `ListingLargeCard.spec.tsx` and `SellerBlock.spec.tsx` | Pass |
| Anonymous native inventory, empty/localized state, unavailable recovery, existing Listing entry | Rendered/MSW `ShowroomScreen.spec.tsx` | Pass |
| Exact configured app IDs and fingerprints; sharing disabled until acceptance | Web `marketplace-links.spec.ts` | Pass |
| Localized HTTPS reader to native target mapping | `publicLinks.spec.ts` | Pass |
| Share/Copy waits for acceptance and current public visibility; system failure recovery | Rendered/MSW `MarketplaceShareActions.spec.tsx` | Pass |
| Native visual/runtime and installed/uninstalled links on iOS and Android | Final acceptance session | Missing |

Web typecheck, affected lint, complete web tests and production build passed. API typecheck, affected lint, and focused application tests passed. Expo dependency alignment and iOS export passed; the export is `/tmp/carberk-910-links-export-20261017`. Mobile typecheck on this base is blocked by unrelated `ServiceScreen.spec.tsx:51` nullable test instance. Regenerate Expo typed routes when assembling the full candidate.

Test-first checkpoints retain the observed missing behavior for schema fields, filter application, business identity, native showroom, native HTTPS routes, association responses, and Share/Copy activation. Hosted database tests are not reported as executed.

## Deployment inputs and activation

Use the same HTTPS origin in web `WEB_BASE_URL` and native build `EXPO_PUBLIC_WEB_URL`. Native builds derive iOS associated domains and Android verified intent filters from that origin. Changes require a new native build.

Web `MARKETPLACE_IOS_APP_IDS` is a comma-separated list of actual Apple Team ID plus bundle ID pairs. `MARKETPLACE_ANDROID_ASSOCIATIONS` is a JSON array of `{ "packageName": "...", "sha256CertFingerprints": ["..."] }`, using the signing certificate for each actual installed application. Store production `com.auto_tm.ynamly` and development `tm.auto.app` are distinct identities. Missing/malformed configuration returns 404 for the association file and never activates sharing. No signing identities have been invented or deployed.

Only set `MARKETPLACE_LINKS_VERIFIED=true` after deployed anonymous readers, current lifecycle removal, canonical/metadata behavior, association responses and installed/uninstalled iOS/Android routing have passed on the intended domain/build/signature. The capability response also requires both configured association documents, a configured API origin and an explicit HTTPS canonical origin. Share/Copy remains hidden until the deployed capability responds enabled. The action rechecks acceptance and public visibility before passing the canonical URL to the system or clipboard. No third-party messaging integration is added.

## External documentation

Docs: https://docs.expo.dev/linking/ios-universal-links/ verified associatedDomains host syntax, AASA application identity and installed-device verification requirement.

Docs: https://docs.expo.dev/router/advanced/native-intent/ verified top-level `+native-intent.tsx` and safe `redirectSystemPath` handling for cold and warm links.

Docs: https://developer.apple.com/documentation/xcode/supporting-associated-domains and https://developer.android.com/training/app-links/verify-android-applinks establish domain/signing association and real installed verification requirements.

Docs: https://reactnative.dev/docs/share verified system Share promise/failure handling. Installed Expo Clipboard declarations verify `setStringAsync` returns a boolean result. No dependency upgrades.
