# Public lineage next source contract, 2026-10-22

This source inspection supplements the [local assembly receipt](public-lineage-local-assembly-20261022.md). It selects no production design. New PDF criteria remain awaiting hosted RED. The existing JSON erasure failure is already reached evidence, not proof of PDF behavior.

## Current implementation

- `PrismaDiagnosticPublic.read` copies `successorOf` from B's immutable snapshot. Its `successor` projection controls A's forward `supersededBy` disclosure and does not control B's predecessor reference.
- `DiagnosticPdfRenderer` prints `report.successorOf` at line 76. `DiagnosticArtifactWorker.current` validates B's snapshot, synthetic status, audience and erasure state. It does not derive current authorization to disclose A.
- Finalization creates three `v1` artifact intents. The worker, document list and document download all select `v1`. The schema already distinguishes renderer version and per-locale generation, with a unique tuple and immutable object identity.
- Download reauthorizes after real storage I/O. That recheck currently validates B and its selected artifact, without predecessor-disclosure authority. Correcting only JSON or initial download admission leaves other disclosure paths open.

ADR-0108 requires B to remain usable after later A changes or erasure. Feature 51 requires reader/PDF parity, original snapshot integrity, versioned stored output, honest pending/failure states, supported languages and current audience authorization. Existing copies already exported cannot be recalled. Current server delivery can withhold an unsafe stored artifact without mutating its bytes.

## Required next acceptance addition

The new finalized lifecycle case preserves the already-issued EN descriptor and bytes, checks that an unsafe copy is withheld, then generates RU/TK after A erasure. It does not yet prove safe EN recovery. Before calling the source correction complete, extend the same lifecycle journey to prove that all TK/RU/EN downloads eventually succeed through ordinary artifact maintenance, with B's own report id, finalized date/mileage, template and finding ids, and no protected A content. Do not accept permanent EN denial or bypass the immutable old descriptor assertion. Document the bounded maintenance action used; do not add arbitrary waits or retries to hide failure.

Root corrected a test assumption before publication. The locale download route selects the current artifact; it does not address the historical artifact id. Its post-erasure check now accepts a safe replacement only with B's own content, absence of A's protected content, a distinct artifact id and distinct bytes. A non-successful current download must not claim PDF readiness. The storage-I/O race likewise refuses stale A-bearing bytes while allowing genuinely safe output. The historical row and stored bytes must still match exactly. This permits a valid forward fix without selecting its architecture, and the explicit eventual all-locale recovery criterion remains open.

For this test-only correction, fresh API TS7/TS6, lint, build, agent-docs and diff gates passed. Actual import-only collection remains 136 continuity cases and 21 public cases, with no setup/hooks/bodies. The preceding fresh API units remain 2552 pass and 2 skip; the changed assertions are in the hosted-only lifecycle suite and have no reached result yet. PR Checks `39866884699` was authoritatively still live at API codec installation, before bodies, so integration publication remains held.

Keep draft and finalized paths, storage-I/O erasure, exact proof retry, independent B writes/finalization, restricted-material denial and exact cleanup coverage. Assert current document list state agrees with actual safe downloads. API JSON and decoded PDF content must agree on permissible lineage. Follow the same reached-RED procedure for this additional availability criterion before its source implementation.

## Bounded production assignment after reached RED

The writer must first propose the smallest forward change that provides safe current output while retaining immutable snapshots and issued artifact identities. Inspect existing generation/renderer contracts, database immutability guards, all API/private/public consumers, worker claim/write/adoption boundaries and account-erasure lock order. Define which immutable rendering input and current disclosure facts bind an artifact, how a safe replacement is scheduled, and how post-I/O rechecks refuse a stale copy. An artifact whose predecessor disappears during rendering or storage I/O must not become deliverable through an old eligibility decision.

The current public route cannot merely return a different byte sequence under the original artifact id/key/hash. Do not rewrite B's released snapshot, relabel an issued descriptor, reintroduce A admission conditions on B's ordinary updates, backfill missing historical facts, add blanket retention periods or weaken isolation/reset guards. Reuse the existing artifact mechanism where it satisfies the selected contract; do not build an environment-history preservation system.

Any material choice about renderer inputs, version/generation semantics or current versus historical document delivery follows the repository decision process before production changes. The clean-reset authorization does not resolve that product lifetime behavior: both visits can be created and A erased after a clean launch. No renderer version or replacement scheduling architecture is approved by this evidence note.

Verification must include the same reached hosted lifecycle cases turning green, affected API/worker tests and typechecks/lint/builds, exact immutable old bytes/descriptors, race outcomes and independent fixed-SHA review. A unit-only or JSON-only green does not complete this assignment.

Docs: inspected installed application/worker/schema sources and existing ADR-0108 and feature 51. No dependency, external service, public contract or implementation was changed.
