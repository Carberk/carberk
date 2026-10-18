# Diagnostic PDF renderer checkpoint

The server renderer consumes one immutable report/template snapshot, explicit locale and generation time, licensed font bytes and exact evidence bytes. It never reads mutable Listing/customer fields or translates observations. Generation is deterministic for the same input. Missing referenced evidence fails generation instead of dropping a finding. Findings, measurements, uncertainty, scope limits, original five-view vector diagrams, numbered markers and complete text equivalents are included. Unsupported bodies use an explicitly generic diagram. Every synthetic/draft page is labelled.

Implementation choice: pdf-lib 1.17.1 and its fontkit 1.1.1 plugin generate stored vector PDFs without a headless browser. This is a reversible renderer adapter within the approved immutable-snapshot and private-storage constraints, with no operating-service activation. Official docs: https://github.com/Hopding/pdf-lib/tree/v1.17.1 and https://github.com/Hopding/fontkit/blob/master/README.md. Registry dates are 2021-11-06 and 2020-11-28 respectively; neither declares peer or engine constraints. Installed types verify custom embedding and drawing APIs. Existing workspace sharp decodes bounded evidence and supplies printable JPEG bytes.

Noto Sans Regular/Bold are from https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans. The SIL Open Font License is bundled with the unmodified fonts under apps/worker/assets/fonts/OFL.txt. Font bytes are embedded/subset in PDFs for Turkmen, Cyrillic and Latin glyphs.

Verification on 18 October 2026 UTC:

- Four renderer tests passed, including real PDF reload, A4 dimensions, exact retry bytes, missing-evidence rejection and explicitly requested sample generation. Worker TypeScript 7/6 and changed-file lint passed.
- The [18 committed samples](pdf/) cover short, long, zero-photo, many-findings, alternate-body and draft reports in TK/RU/EN. All 60 pages were rasterized and visually inspected once in 15 four-page sheets. Glyphs, continuation headers, footer numbering, diagrams/markers, captions and uncut synthetic image rectangles were readable without clipping or overlap.
- pdftotext asserted every finding ID, observation date, mileage and äçňöşüýž ÄÇŇÖŞÜÝŽ plus Cyrillic/Latin text. [The manifest](pdf-manifest.json) pins page counts and byte hashes. Raw proof and inspection sheets are under /tmp/carberk-diagnostic-pdf-proof-20261017.

The sample facts are fictional and retain their original language. Technical translation approval, actual service evidence and operating readiness are not inferred from glyph checks. This checkpoint does not prove storage generation/adoption, current-audience delivery, UI/PDF parity, native opening/sharing or final deployed acceptance. Those remain required for #916.
