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

The supplied base already contains separately sourced Navistar artwork for `international`, superseding the issue's historical letter fallback. Preserve that identifying artwork instead of replacing it with the IH emblem.

The existing search contract reserves standalone four-digit tokens for years, so bare `1055` does not find this tractor. Searching `International Harvester` exposes it with the other models. This seed change does not alter that shared API contract. Deployed search/picker proof, staging seeding and logo import remain delivery acceptance work; no database or storage activation was performed here.
