# Public automatic B1 contract checkpoint

## Outcome and ownership

B1 is incomplete; public automatic HTTP admission stays CLOSED. No source, schema, migration, fixture or behavioral assertion changes. The approved contract is now durable in [ADR-0109](../../adr/0109-authenticated-ownership-grants-for-automatic-diagnostic-continuity.md), complementing ADR-0108. Founder authorization permits building the grant mechanism, but supplies no actual seller/member consent. This checkpoint does not reopen the settled policy or ask for another approval of it.

- Parent: #897 / #904; implementer branch `agent/issue-897-public-automatic-b1-20261023`.
- Supplied base: `0ca85a6276286278b49333cfa25e0cc99cd93166`, tree `5b9a98cf2b4f83fcef2e5c56dd8be8feb573a4f2`.
- Fresh isolated worktree: `/tmp/carberk-897-b1-20261023-9ebf80f4`. The host scaffold `t3/9ebf80f4` remains unchanged at the supplied base.
- First pushed checkpoint: `4ae9a4ec62442d592d0de259661de96c784d5e6c`, tree `3595f9b5e82a1068cfb573e0c98342e6e5a265bf`. It records the approved ADR and index before any implementation.
- Final checkpoint SHA is supplied in the handoff rather than embedded in its own content.

## ADR collision and approval record

Used `.claude/skills/new-adr/SKILL.md` and its template. Before writing, `node .claude/skills/new-adr/scripts/prepare.mjs "authenticated ownership grants for automatic diagnostic continuity"` selected unused number 0109 and identified semantic neighbors 0103, 0104 and 0108. The selected relationship is complement to 0108. ADR-0108 is byte-for-byte unchanged. The index adds one 0109 entry. Existing unrelated duplicate 0096 numbering is untouched.

The founder's parent approval, reiterated in this dispatch as approval to record and implement without a repeated policy loop, supplies the Decision and Accepted status. No merged ADR is edited. No PR is created. Chief of Staff owns incorporation into PR904 and external execution-state publication.

## Concrete unresolved source contract, identified before implementation

The missing contract is authenticated collection of an actual source grant before either first observation, including its declared authorized end. It is distinct from the now-settled policy authorizing development:

- `packages/contracts/src/schemas/diagnostics.ts:20` accepts only `physical` and `publication` authorization, an arbitrary authority reference and expected order version. Its authorization record has reception attribution/time, but no structured ownership purpose, covered subjects, source-authorized end, or source grant identity.
- `PrismaDiagnosticIntake.authorize`, at `apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts:176`, authorizes reception and records that reference. It does not authenticate the grantor as the seller or authorized dealership owner for a classified continuity grant.
- `DiagnosticOwnershipClassificationSchema`, at `packages/contracts/src/schemas/diagnostics.ts:44`, accepts a technician-submitted rights declaration. `DiagnosticOwnershipCapture.append` copies current source subjects and records that technician as `declaredById`. No persisted grant row authenticates a source grantor, subject coverage, or grant provenance. A valid rights-shaped declaration is insufficient evidence of those facts.
- `PrismaPublisherBindings.bind`, in the identity context, establishes current publisher eligibility. It returns a current binding and digest, not an ownership-retention grant. It cannot be reinterpreted as source consent or historical transition history.
- `DiagnosticPublicTransferProof.e2e.spec.ts:403` creates each public visit as seller and records physical/publication references through reception, then observes through technician. It sends no ownership classification and no actual source grant. The automatic positive at line 861 must retain its issuance expectation of 201; neither that assertion nor its setup is changed here.

A follow-on bounded implementation brief must specify the source command and persisted grant binding: authenticated seller/authorized owner admission, covered server-resolved seller/commissioner/member/Listing/vehicle subjects, provenance, explicit source-declared end, revocation/change serialization, and use by the first observation. It must resolve how the current positive obtains a truthful grant through that ordinary authenticated flow. Merely adding invented rights text or an arbitrary fixed date to its technician request is prohibited. This checkpoint proposes no new issuer class or multi-root policy.

## Lock and admission prerequisites

The existing handoff's lock order is retained: complete sorted User -> Business -> Listing -> inspection order -> report -> assignment/proof. OLD, NEW and retained references must be discovered before writes, then revalidated under that complete union. Current implementation does not yet satisfy the full writer contract:

- `DiagnosticPublicBindings.targets/lock` discovers requested orders and current Listing seller/business/commissioner only. It omits retained ownership references and the full affected report/proof/assignment graph.
- Listing update/delete writers do not discover that retained graph before mutation. Account deletion updates User before discovering/removing membership. Business recovery acquires its initial locks before discovering the replaced owner. An order-writing ownership trigger added alone would introduce lock inversions.
- `PublicAutomaticOwnership.ts` already requires both visits' first anchor, complete retained facts and a clear visit-local transition. The schema has classified components but no authenticated immutable first-anchor/witness storage. No backfill or raw-count substitute can establish it.
- `PrismaDiagnosticContinuityProofs.pair` still omits ownership. SQL `diagnostic_continuity_proof_bound` in migration `20261022180000_diagnostic_public_continuity` independently restricts public pairs to `comparative_attestation`. Both remain closed.

Do not implement a broad speculative writer/trigger rewrite from this checkpoint. Parent must complete the bounded grant/source and discovery contract first. Opening automatic admission then requires atomic source facts on BOTH visits, every relevant writer's transition fencing, rights expiry/erasure integration, and matching adapter/domain/SQL checks. Keep temporary eligibility separate, preserve the single structured root restriction and comparative admission, and retain component-only erasure plus consumed retry bindings.

## Root-failure ledger

The read-only mapping `/tmp/public-automatic-403-root-failure-20261023.md` was inspected and its accounting is preserved:

1. Exact positive RED at `0aaff93731cd9b1a5a6c9ab6e76527b236dddda2`, supplied run `39884355600`, API job `120189010381`: expected 201, actual 403.
2. Same root at supplied base `0ca85a6276286278b49333cfa25e0cc99cd93166`, supplied run `39959579692`, API job `120434030280`: expected 201, actual 403 at issuance line 890.
3. Rejected mutable-Listing/history-count shortcut `f0824f32c9821fb2e93b3ae223a00e1a93e6d336`, assembled as `9c7f7a6f`, reverted by `07d328ea67df9864061619559b83f7089bee0553`. Count remains three; this ADR/source inspection is no new repair attempt and does not reset it.

No new HTTP result is claimed. Earlier failures with other causes are not relabeled. Automatic 201, every negative assertion, retention and deletion behavior remain unchanged. No synthetic bypass or database seed is introduced.

## Focused offline verification

- `node scripts/check-agent-docs.mjs`: PASS.
- `node --test scripts/diagnostic-classified-ownership-schema.test.mjs scripts/diagnostic-ownership-disposal-schema.test.mjs`: PASS, 2 tests. This verifies existing migration/profile bytes and disposal compatibility only, not SQL execution or HTTP admission.
- `git diff --check`: PASS.
- Base comparison confirms only ADR0109, ADR index, and this evidence file change. ADR0108 and all source/tests/schema/migrations retain their original blobs.

Static output is retained in `/tmp/897-b1-9ebf80f4-evidence/ownership-static.log`. No unit runtime is claimed, because no product code changes. No dependency installation, local service, Docker, HTTP/e2e, CI query/dispatch, Railway, reset, deployment, device, emulator, signing, external messages or delegated agent work occurred. No host guard refusal occurred.

## Handoff

Next owner is Chief of Staff for the missing source contract and bounded follow-on dispatch. B1 source implementation, authenticated-grant journey, SQL/race execution, automatic HTTP 201, independent review and exact-candidate acceptance remain unmet. This is a pushed policy/evidence checkpoint, not an implemented vertical slice or release approval.
