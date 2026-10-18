# International Harvester seed sources

Issue #826 adds historical IH machinery separately from Navistar trucks and modern Case IH tractors. Sources checked on 2026-10-18 through read-only HTTP requests.

Agroline's [Turkmenistan International tractor listings](https://agroline-tm.com/-/traktory/International--c228tm2614) advertise the models below. The [Russian endpoint](https://agroline.ru/-/traktory/International--c228tm2614) redirects to the [Russian-language Kazakhstan catalog](https://agroline.kz/-/traktory/International--c228tm2614). These pages advertise imported machinery to the region; their European seller locations do not prove machines already reside in Turkmenistan.

| Seed model | Listing evidence |
|---|---|
| 584 | [1978 tractor](https://agroline-tm.com/-/prodazha/traktory-kolesnye/International/584--26052621005357209600), also checked through the Russian listing endpoint |
| 744 | [1978 tractor, 54 kW](https://agroline-tm.com/-/prodazha/traktory-kolesnye/International/744-54-kW-72-HP-Manual--23042413094337830200) |
| 844 | [844 auction](https://agroline-tm.com/-/aukcion/traktory-kolesnye/International/844--26101404445386738500); the category page also lists 1979 844S and 1985 844 AXL variants |
| 955 | [1977 955A](https://agroline-tm.com/-/prodazha/traktory-kolesnye/International/955A--25112614143015275300); the category page also lists 955XL |
| 1055 | [1982 tractor](https://agroline-tm.com/-/aukcion/traktory-kolesnye/International/1055--26051404422228601200) |
| Farmall DED 3 | [1954 tractor](https://agroline-tm.com/-/aukcion/mototraktory/International/FARMALL-DED-3--26101216224196014800) |

Numeric family rows follow the catalog's existing model conventions. Farmall DED 3 is specific to the historical tractor advertised, avoiding a generic Farmall family that could include modern Case IH machines. The issue's other example tractors and Axial-Flow combines are omitted because this lookup did not verify matching regional listings. This is a supported initial selection, not a complete historical IH catalog.

Brand rows have no vehicle category or tier fields. The logo manifest uses tier E, matching Case's agricultural machinery entry. Existing `international` and `case` rows and models remain unchanged. Slug-based brand upserts and composite brand/model slug upserts in `src/seed.ts` retain the existing idempotent seed behavior.

The [Commons IH emblem page at revision 1217491956](https://commons.wikimedia.org/w/index.php?title=File%3AInternational_Harvester_Company_logo.svg&oldid=1217491956) identifies the supplied PD-shape artwork. Downloaded original SVG SHA-256 is `f05935521c919cb3aa34cff769f426cebac65fff8c40b62fc985552a9bf9ff05`. The identical test fixture verifies provenance and actual mask rendering without network access. The manifest imports the Commons original through the existing operator script.

## Navistar reconciliation, 2026-10-18

[#822 review](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/822#issuecomment-6102753572) removed the wrongly assigned IH emblem in `376a9bd7`. Its merge commit `81b87b6fcbb2c8224ef47748686fca46963f2685` records `international` as `source: null` with the Navistar/IH separation reason. That explains #826's original letter-fallback criterion.

The later [#829 artwork delivery](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/829), merged on 2026-10-11 as `ceb6bc68aec93cd095785574d513db1b32c14a0e`, replaced all 54 prior fallbacks under the founder's approved identifying-artwork decision. Its [source receipt](../../../../docs/research/2026-10-11-brand-logo-coverage.md) explicitly identifies `international` as International Motors / Navistar International trucks. The bundled `international.png` in that merge and the supplied base both hash to `914a1012b31d3d273391b29d6f003b35d606ae4e1428984aca66f64b6371ca34`. The manifest records [International Motors' original](https://news.international.com/download/International_Symbol_Black_RGB.png), upstream SHA-256 `23d3ccef1c23005af6a59c41776b85425973437104e118aa7147ad9535cb7afb` and alpha-mask normalization.

Root's 2026-10-18 reconciliation preserves this later, separately sourced Navistar artwork. The #826 original body remains historical evidence. Deployed picker acceptance still requires the IH emblem on International Harvester and the distinct Navistar artwork on International, in the required appearances. Local manifest/render checks do not replace that proof.

## Numeric search reconciliation, 2026-10-18

[Approved search issue #363](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/363) and feature 33 require valid year queries and ignore out-of-range years; neither forbids an exact numeric model name. The original parser discarded every four-digit candidate, which hid IH 1055 as well as existing Chevrolet 1500, Lada 2106 and Saab 9000. Search now identifies exact numeric catalog names matching the remaining brand/model query context and retains those out-of-year-range tokens. Valid years remain authoritative, including catalog names such as PPM 2007 and YTO 2004. Unrelated displacement/invalid-year tokens and invalid ranges retain their previous behavior. All original parser tests remain unchanged.

Deployed search/picker proof, staging seeding and logo import remain delivery acceptance work; no database or storage activation was performed here.
