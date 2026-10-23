# Private comparative proof security test checkpoint

Test-only #914 work under #897 through sole integration PR #904. Supplied base `2b00c38ec28d6180d4fd32ccc248e8735dd44d53`, tree `dafde1c05aedf31522fcc9363d490423794b4879`. The [classified base receipt](../issue-901/prelaunch-hosted-receipt-2b00c38e-20261021.md) preserves the actual missing issuance endpoint RED, 404 versus 201 after real setup. This checkpoint supplies no new HTTP runtime result.

Writer branch `agent/issue-914-proof-issuance-denials-20261021` returned `ab4d3a2afb699db5a4524a987891e117dfdd08d9` and follow-up `ec80b22dd63f5b1832cf5038fae2eda383922cf7`, final tree `19b773db6cc1830874b355b2f5def190209e266b`. Root inspected and assembled them as `bd1967a1` and `0358cc45`. Both tasks are terminal and acknowledged. Root remains the sole assembler; no new PR or competing source writer exists.

## Prepared behavior

The [issuance suite](../../../apps/api/src/modules/diagnostics/presentation/DiagnosticContinuityProofIssuance.e2e.spec.ts) now collects 66 tests. Its original positive test body is byte-identical to the supplied base. Shared helpers keep the same private versions and original setup assertions. All visits use ordinary diagnostic HTTP capture, upload, assignment, authorization and release routes. Direct writes provision established cross-context authority fixtures, rather than future proof state.

| Area | Prepared assertions | Runtime limit |
|---|---|---|
| Comparative issuer | Qualified independent reviewer assigned to both orders; linking technician cannot issue even with reviewer qualification | New denial runtime pending |
| Current authority | Missing/revoked grants, each missing/revoked assignment, expired qualification/session, suspended/deleting issuer; same JWT after ordinary revocation | New denial runtime pending |
| Input and stale bindings | Strict 400 for malformed/client-controlled/unsupported inputs; authorized 409 for actual stale versions and raw pins | New runtime pending |
| Identity and provenance | Generic 403 for arbitrary/unverified/unretained/omitted provenance, freeform-only identity, different chassis and contradictory material | Setup and denial runtime pending |
| Audience and commissioner | Different private commissioner, mixed audience and public pairs refuse this private-only issuance slice | Setup and denial runtime pending |
| Restricted proof reads | Current two-order qualified technician and reviewer get the same strict envelope; buyer, B-only technician and unassigned reviewer get identical real/unknown generic refusals | Requires ordinary issuance first; read assertions are unreached at base |
| Erasure | Product account deletion plus production purge, with due-account/OTP isolation guards; erased/null-commissioner and unknown handles refuse generically | Common commissioner erases both visits; new runtime pending |
| Refusal effects | Stored reports, order state, successor representation and audits remain exactly unchanged, including on assertion failure | Does not yet inspect a future proof table |

All protected responses require private/no-store. Error bodies are exact generic envelopes with no protected predecessor, identity, provenance or existence facts. Proof-read cases first require real reviewer issuance and an ordinary read. No fabricated proof id or stored success state bypasses that gate.

## Root inspection corrections

The first test draft incorrectly denied a technician still qualified and assigned to both visits. [ADR-0108](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md) requires an independent qualified reviewer for comparative issuance. The [read contract](diagnostic-pair-proof-next-red-contract-20261021.md) permits current qualified staff independently authorized on both orders to read restricted material. The corrected denial removes A's technician assignment through reception HTTP. A new positive case checks the current two-order technician's complete envelope, private/no-store and unchanged reports/orders/audits. Issuer independence remains unchanged. This corrects the test to the governing contract; it creates no new access policy.

Public setup originally called the create-only catalog fixture helper for every visit. Root caught the resulting repeated-ID collision before hosted execution. The follow-up seeds the suite catalog once in `beforeAll`; each public Listing stays separate. Consent, version and isolation assertions remain unchanged.

## Offline verification

Writer passed changed-file lint, API TS7 and TS6 typechecks, non-static collection, runtime-import/docs/glossary/diff guards and original-positive preservation. The writer's full handoff is `/tmp/issue-914-proof-issuance-denials-handoff-20261021.md`.

Root reran on the assembled files:

- `pnpm --filter @auto-tm/api typecheck`: pass, `security-assembled-typecheck.log`.
- `pnpm --filter @auto-tm/api exec eslint src/modules/diagnostics/presentation/DiagnosticContinuityProofIssuance.e2e.spec.ts --max-warnings 0`: pass, `security-assembled-lint.log`.
- `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest list src/modules/diagnostics/presentation/DiagnosticContinuityProofIssuance.e2e.spec.ts --staticParse=false --json=/tmp/carberk-resume-20261021/security-assembled-collected.json`: pass, 66 tests. Collection evaluates imports/declarations; it executes no test hooks or HTTP assertions.
- Runtime-import, documentation links, glossary and diff checks: pass.
- Byte comparisons: exact final child spec, original positive body and all three protected DB specs plus legacy API reset suite remain unchanged from their designated inputs. The catalog seed occurs once.

Root logs above are under `/tmp/carberk-resume-20261021/`. No local Docker, runtime service, endpoint/schema/contract implementation, dependency/CI policy change, timeout increase, skip, reset, Railway/quota call or deployment occurred. Docs: no external lookup needed; existing repository contracts and accepted ADR-0108 supply these test expectations.

## Open gates

The combined candidate must establish actual hosted setup and denial RED before source implements these new refusals. A missing issuance response in a read test proves nothing about its later read assertion. Diagnose setup failures separately. Unsupported-method assertions describe this first private slice; they do not cancel required automatic VIN or transfer work.

Still required: isolated A-only erasure/retained null commissioner, deleting issuer with surviving session, legacy missing raw pins, rights-expiry/provenance-chain lifecycle, actual proof persistence/cleanup and atomic issuance races/failure. Current routes cannot manufacture some legacy states; do not invent a production API or seed a future proof to make a positive test pass.

Automatic VIN, both manual/VIN directions, justified corrected identity, public transfer, atomic single-use consumption/exact retry/staleness/generation reversal, successor races and surviving B after consumed A erasure remain separate required slices. Real evidence rights, retention/hold policy, qualification provisioning and service activation remain unresolved readiness gates. This checkpoint claims none of them.
