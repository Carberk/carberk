# Auto.ru and Kolesa reference screens

Historical, noncanonical research from 2026-09-21 for [#343](https://github.com/Carberk/carberk/issues/343). The [inventory CSV](reference-screens-2026-09-21-inventory.csv) indexes the founder's local captures; it does not authorize product scope or establish current behavior. [ADR-0051](../../../adr/0051-auto-ru-inspired-mobile-discovery-before-google-play-review.md) owns the approved discovery journey; inspect [mobile source and tests](../../../../apps/mobile/src/listings) for implementation.

## Sources and provenance

| Source | Local archive | Files | Recorded origin |
|---|---|---|---|
| Auto.ru iOS app | `auto.ru-screens/` | 599 JPG, 3 MP4, 51 flow folders | [Screen Gallery, Auto.ru](https://scrn.gallery/app/auto-ru?flow=68aa008fb7e7cf3909f5d4f9), [search flow](https://scrn.gallery/app/auto-ru?flow=68aa00f2b7e7cf3909f5d6d0) |
| Kolesa iOS app | `kolesa.kz-screens/` | 291 JPG, 2 MP4, 50 flow folders | Public origin and capture date unrecorded |

Set `$REF_ARCHIVE_ROOT` to a lawful local copy of the archives. The CSV's `archive_path` is relative to that root; the original nonportable location was `/Users/bagtyyar/Projects/learning/software-engineering-product-management/` on the founder's Mac. The archives were not renamed, moved or rewritten; `.DS_Store` is excluded. No screenshot/video binaries are committed. Keep them outside the repository unless the founder approves a lawful asset store. Attribution and local possession do not establish a redistribution license or permission to reuse third-party assets.

Screen Gallery, checked 2026-09-21, labelled Auto.ru “July 2025, 564 screens, 51 flows, 3 videos” and required sign-in for individual screens. The local 599 JPGs differ by 35; that gap remains unreconciled. Treat them as July 2025 captures, not the live app. All images are 1176×2556 with iOS status bars. Kolesa's date and origin remain unknown; do not infer either from the separate May 2026 set cited by [ADR-0034](../../../adr/0034-kolesa-ux-findability-reference.md).

## Reading the CSV

- IDs use `<source>-<flow>-<seq>`: `AR` means Auto.ru, `KZ` means Kolesa; flow is the two-digit folder prefix. Image sequences have three digits; videos use `V` plus two digits. For example, `AR-06-017` maps to `auto.ru-screens/06-search-params/06-search-params_17.jpg`. Kolesa's source skips flows 20 and 21.
- The 895 rows comprise 602 Auto.ru and 293 Kolesa files: 890 images and 5 videos. There are 130 byte-identical duplicate markers and 765 unique captures. `duplicate_of` names the first capture in ID order; `sha256_prefix` retains the recorded hash prefix.
- `release-core` labels the historical ADR-0051 journey; `release-supporting` labels other reviewer-reachable screens; `reference-only` is indexed without implying a requirement. Category labels mostly came from folder names, including files not opened. `annotated=yes` records past inspection in research notes now available through Git history; it is not a usability or release approval.

## Reference limits and first-party reading

The captures do not prove Android back behavior, Material components, edge-to-edge insets, Turkmen UI, TMT prices, Turkmen city data or results scroll restoration. The two release-core videos were not reviewed. Auto.ru's detail menu/report flow and legal/deletion screens were not captured; Kolesa's report entry does not prove its complaint flow.

First-party references retained from the observations: [Auto.ru search guide](https://auto.ru/support/autoru/ru/buyers-filtering-ads), Kolesa [cars](https://kolesa.kz/cars/), [Camry results](https://kolesa.kz/cars/toyota/camry/), [observed listing](https://kolesa.kz/a/show/230191010), [mobile website](https://m.kolesa.kz/cars/), [filter guide](https://kolesa.kz/content/kak-bystro-nahodit-nuzhnye-avto-na-kolesa-kz/), [mobile promotion](https://kolesa.kz/promo/mobile/), and [developer's Google Play listing](https://play.google.com/store/apps/details?id=kz.kolesa). September's browse observations inspected web pages and the mobile website's accessibility tree, without operating the native app or testing filter controls. Web routes and store descriptions do not establish native navigation or current layout. Live counts and promotions change.
