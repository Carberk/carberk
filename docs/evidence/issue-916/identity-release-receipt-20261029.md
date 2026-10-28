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

GREEN, rollback/retry, every-page locale inspection, legacy issued-byte hashes and full assembled acceptance remain pending. Independent assembled reviews, CI and deployed evidence belong to coordinator.

## Source checkpoint (verification pending)

The coordinator approved a finalize-only `vehicleDisplay` with typed make/model/year, one nested optional `releaseIdentity`, minimal existing readers and exact twenty finalize fixture paths. The additional DB change is one offline fake model-list entry (`diagnosticCenter`) at prerequisite `588f5b7a`; no schema, migration, SQL command or production DB behavior changed. The existing report prepared harness adds a truthful localized center seed and a way to clear deliberately injected write/finish faults. Existing authority, transaction and proof behavior stays in place.

New manual release refuses without display facts or a retained immutable first-draft pin. Existing issued reports still parse without metadata. Release proposals are recaptured and compared after current reviewer authority, version and publication admission under the existing complete mutation locks. A changed center or association between planning and locked execution refuses rather than mixing facts. Catalog names are never read; optional protected catalog IDs/year describe only an unchanged association to the pinned observation. The shared customer-visible reference is the existing report id; public order ids remain excluded.

All new readers display the same nested snapshot metadata. No navigation or prototype layout changes. UI scope is minimal current-state conformance to Feature 51 and the approved 14 October report header; the coordinator explicitly approved the three existing finalize inputs. Original byte fixtures remain literal and unchanged. New renderer output adds metadata only when the versioned object exists.

The original contracts, renderer, web and admin behavior criteria have genuine pre-production RED at `9f0d1e94`. Additional mobile parity, negative masking and rollback/retry coverage were drafted afterward; they have no separately executed pre-production RED and are not represented as such. Original assertions in the twenty affected finalize suites are preserved; explicit synthetic display input is added only at existing finalize calls. Targeted new adapter assertions check safe projection, rollback, same-input recovery and immutable readback after center renaming. These offline tests do not establish PostgreSQL lock/race behavior.

Docs: not applicable, internal behavior changes using existing libraries and APIs; no dependency versions or exports changed.
