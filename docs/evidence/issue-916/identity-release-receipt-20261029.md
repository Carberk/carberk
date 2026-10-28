# Released vehicle identity and center, 2026-10-29

Base: `b71e8412abce19e22ae6c1c6bea9b6e95402d683`. Branch: `agent/issue-897-pdf-identity-20261029`. Coordinator remains sole assembler for #897 / PR904. This receipt records incomplete implementation evidence, not final acceptance.

## Test-first checkpoint

Before production changes, the following literal commands ran with one worker. Logs are in [identity-20261029](identity-20261029/).

- `pnpm install --frozen-lockfile --ignore-scripts`: exit 0, 5.9 seconds. No dependency manifest changes.
- `pnpm --filter @auto-tm/contracts build`: exit 0.
- `pnpm --filter @auto-tm/contracts exec vitest run src/schemas/diagnostics.spec.ts --maxWorkers=1`: exit 1, 7 failed / 8 passed. Metadata was stripped; finalize rejected typed display input.
- `pnpm --filter @auto-tm/worker exec vitest run --config /tmp/issue916-renderer-vitest.config.mjs --maxWorkers=1 -t 'immutable vehicle|human-readable manual'`: exit 1, 6 failed / 7 skipped. Actual TK/RU/EN PDF text omitted center and vehicle. Temporary config contains only `export default { test: { maxWorkers: 1, include: ["src/jobs/diagnostics/DiagnosticPdfRenderer.spec.ts"] } };`; avoids normal global setup importing the unbuilt DB package. Real renderer, fonts and PDF text decoder execute.
- `pnpm --filter @auto-tm/admin exec vitest run src/app/diagnostics/DiagnosticWorkspace.spec.tsx --maxWorkers=1 -t 'intentional customer vehicle description'`: exit 1, 1 failed / 14 skipped. Manual finalization was enabled without a customer vehicle description.
- `pnpm --filter @auto-tm/web exec vitest run src/diagnostics/Reader.spec.tsx --maxWorkers=1 -t 'same safe released'`: exit 1, 3 failed / 27 skipped. Actual rendered reader omitted safe identity/center.

CPU released to coordinator after these runs. No database, Docker, device, browser or export bundle ran.

## Authorized finite behavior

Optional `releaseIdentity` inside immutable `snapshot.report`, version 1, no legacy defaults. Center id/localized names and safe vehicle method/display are captured at authorized finalization. Standard normalized 17-character VIN gets thirteen stars plus last four in both customer audiences. Nonstandard VIN and arbitrary manual references remain restricted. New manual releases require typed make/model/year supplied through existing finalize input; old issued snapshots remain unchanged. No mutable catalog-name reads, raw identity IDs, ownership/contact data or observation/proof hash changes.

Focused GREEN, rollback/retry, legacy issued-byte hashes and every-page locale inspection are recorded below. Full assembled acceptance, independent reviews, CI and deployed evidence remain with coordinator.

## Source checkpoint (verification pending)

The coordinator approved a finalize-only `vehicleDisplay` with typed make/model/year, one nested optional `releaseIdentity`, minimal existing readers and exact twenty finalize fixture paths. The additional DB change is one offline fake model-list entry (`diagnosticCenter`) at prerequisite `588f5b7a`; no schema, migration, SQL command or production DB behavior changed. The existing report prepared harness adds a truthful localized center seed and a way to clear deliberately injected write/finish faults. Existing authority, transaction and proof behavior stays in place.

New manual release refuses without display facts or a retained immutable first-draft pin. Existing issued reports still parse without metadata. Release proposals are recaptured and compared after current reviewer authority, version and publication admission under the existing complete mutation locks. A changed center or association between planning and locked execution refuses rather than mixing facts. Catalog names are never read; optional protected catalog IDs/year describe only an unchanged association to the pinned observation. The shared customer-visible reference is the existing report id; public order ids remain excluded.

All new readers display the same nested snapshot metadata. No navigation or prototype layout changes. UI scope is minimal current-state conformance to Feature 51 and the approved 14 October report header; the coordinator explicitly approved the three existing finalize inputs. Original byte fixtures remain literal and unchanged. New renderer output adds metadata only when the versioned object exists.

The original contracts, renderer, web and admin behavior criteria have genuine pre-production RED at `9f0d1e94`. Additional mobile parity, negative masking and rollback/retry coverage were drafted afterward; they have no separately executed pre-production RED and are not represented as such. Original assertions in the twenty affected finalize suites are preserved; explicit synthetic display input is added only at existing finalize calls. Targeted new adapter assertions check safe projection, rollback, same-input recovery and immutable readback after center renaming. These offline tests do not establish PostgreSQL lock/race behavior.

Docs: not applicable, internal behavior changes using existing libraries and APIs; no dependency versions or exports changed.

## Focused GREEN at source `c65b0770`

All commands completed before CPU release. Normal configured suites ran with `--maxWorkers=1`; API/worker used `AUTO_TM_TEST_DATABASES=off`, with no database service. No timeout was increased. No manifests or lockfile changed.

- `pnpm --filter @auto-tm/contracts build`: exit 0.
- `pnpm --filter @auto-tm/db build`: first refused missing `DATABASE_URL` during Prisma config loading. `DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused pnpm --filter @auto-tm/db build`: exit 0; generates and compiles only, no DB connection.
- `pnpm --filter @auto-tm/contracts exec vitest run src/schemas/diagnostics.spec.ts --maxWorkers=1`: exit 0, 15 passed.
- `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run src/jobs/diagnostics/DiagnosticPdfRenderer.spec.ts --maxWorkers=1`: exit 0, 14 passed, 891 ms suite duration. Includes all three original issued-byte SHA-256 assertions, real embedded glyph/text decoding, both audiences, manual/VIN identity, body findings and unchanged default 5000 ms timeout. Opt-in export tests returned without writing proof files; every-page inspection remains pending.
- `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/identity/infrastructure/DiagnosticReportsPrepared.spec.ts --maxWorkers=1`: exit 0, 54 passed. Covers actual report adapter with offline DB boundary, restricted-source omission, nonstandard VIN omission, manual description refusal, write/finish rollback and same-input recovery, exact pin preservation and immutable snapshot readback after center rename. Does not claim SQL race/locking acceptance.
- `pnpm --filter @auto-tm/admin exec vitest run src/app/diagnostics/DiagnosticWorkspace.spec.tsx --maxWorkers=1`: exit 0, 15 passed.
- `pnpm --filter @auto-tm/web exec vitest run src/diagnostics/Reader.spec.tsx --maxWorkers=1`: exit 0, 30 passed.
- `pnpm --filter @auto-tm/mobile exec vitest run src/diagnostics/DiagnosticReader.spec.tsx --maxWorkers=1`: exit 0, 47 passed.

For each of `@auto-tm/contracts`, `@auto-tm/db`, `@auto-tm/api`, `@auto-tm/worker`, `@auto-tm/admin`, `@auto-tm/web`, `@auto-tm/mobile`, both literal command forms `pnpm --filter <workspace> exec tsc --noEmit` and `pnpm --filter <workspace> exec tsc6 --noEmit` exited 0. TypeScript 7 and TypeScript 6 each passed all seven workspaces. Logs use `<workspace>-tsc.txt` / `-tsc6.txt`.

Affected-file lint ran `pnpm exec eslint <exact changed .ts/.tsx paths relative to workspace> --max-warnings 0` inside each of those seven workspaces, deriving paths from `git diff --name-only b71e8412abce19e22ae6c1c6bea9b6e95402d683 HEAD`; all exited 0. `git diff --check` passed. Logs use `<workspace>-lint.txt`.

No full repository tests, container-backed affected e2e, browser/device UI proof or deployed acceptance ran in this focused window. Those remain coordinator assembly gates; the twenty affected finalize fixture assertions have compiler/lint validation here, not executed database acceptance.

## Every-page PDF proof at source `c35cfd4e19aca112b247611426857e69304102ed`

The PDF skill was applied before creation and inspection. Its operation marker completed once with `--operation-kind create --expected-output-count 12 --output-format pdf`. The only source change since focused GREEN is an opt-in renderer test line retaining the exact snapshot JSON next to each proof PDF. No production source changed after the compiler/lint window.

Literal configured command:

```sh
AUTO_TM_TEST_DATABASES=off DIAGNOSTIC_IDENTITY_PROOF_DIR=/Users/bagtyyar/.t3/worktrees/carberk/t3-dde97944/docs/evidence/issue-916/identity-20261029/pdf pnpm --filter @auto-tm/worker exec vitest run src/jobs/diagnostics/DiagnosticPdfRenderer.spec.ts --maxWorkers=1
```

Exit 0, 14 passed, 1.11 seconds. See [render log](identity-20261029/visual-render.txt). The default 5000 ms remains unchanged. This rerun also passed the original literal issued-byte SHA-256 assertions:

- TK: `858e29b3df9bdb6f888971605ac1a4243e1c59dd3b9725c46817e795601b57b5`
- RU: `59b988d5ca4a51c1c7f408a777be78ae40b54997cfeff6672ff5752eea610c53`
- EN: `ef01ff5ef09ab09765338fea96062fb95a53d84873d0b9d96718c4134c722e27`

The [visual manifest](identity-20261029/visual-manifest.json) records all 12 PDFs, exact snapshot JSON files, canonical snapshot hashes, snapshot-file hashes, PDF artifact hashes and all page-image hashes. The matrix is TK/RU/EN × buyer_private/listing_public × manual/VIN. Every PDF has three A4 pages, 36 pages total. Real embedded fonts and the production renderer were used. Poppler `pdftoppm -r 110 -png <pdf> <page-prefix>` produced 910 × 1287 pixel page images. Every page was individually viewed at that readable scale, rather than reviewing thumbnails or relying on extracted text.

All 36 pages passed visual inspection. Page 1 shows localized center, human-readable Toyota Camry 2018 display, manual identification label or thirteen stars plus VIN last four, existing report reference, date/mileage/template and complete findings. Pages 2 and 3 retain all five body-map views, markers, headings and the report copy caveat. Turkmen, Cyrillic and Latin glyphs are intact. Page numbers and synthetic notices appear throughout. No clipping, overlap, black squares, missing glyphs or masking defects were observed. Existing whitespace and numeric coordinate formatting were left unchanged within the approved conformance scope.

Extracted PDF text plus document information/metadata contain neither the full source VIN nor restricted field names `manualReference` and `identityRecordId`. Both customer audiences use the same safe VIN masking. Artifacts are synthetic evidence, not issued customer documents. Snapshots and PDF artifact hashes are distinct concepts; locale/audience variants may share bytes where their visible content is identical.

CPU RELEASE was sent after rendering and inspection drained. No DB, Docker, native, browser, Metro, export bundle or SQL profile ran. Remaining acceptance includes PostgreSQL lock/race and affected container-backed e2e execution, independent assembled reviews, CI and deployed proof. Offline rollback/retry and unchanged legacy renderer bytes do not substitute for those gates.

Final evidence check normalized terminal-log trailing blank lines only. `git diff --check b71e8412abce19e22ae6c1c6bea9b6e95402d683 HEAD` then passed; command output and results are unchanged.
