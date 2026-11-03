# #939 F16/F17 supplemental boundary (amended): offline source

- Contract: #939 comments 6612779049, 6614404848 (amendment), 6614443867 (release) and 6614560976 (Parent correction: proof deadline may coincide).
- Slot: 2026-11-03T20:20Z–22:00Z.
- Source checkpoint: `b52b1f0660d7dac8b26ad9c3c31029d7a07733f5` (tree `89148c4aee6eebb4b3afd34917a5796743862b3c`), from the evidence-stop base `594a6297`. Production source equals candidate `3ee5cdb8`.

## Two-ID map (machine-checked: `f16-f17-supplemental-map-and-audit.json`)

| ID | Row (name unchanged) | Selected material | Refusal locus at the deadline |
|---|---|---|---|
| F16 | `A rights expiry` | A provenance | Identity graph/projectIdentity, A side (`PrismaDiagnosticReports.ts:188`). The A provenance is no longer `retained`, so the A evidence is unusable and the chain is refused |
| F17 | `B rights expiry` | B evidence | Identity graph/projectIdentity, B side (`PrismaDiagnosticReports.ts:189`). The B evidence is no longer `live`, so the chain is refused |

`comparisonRights` is not reached at the deadline. Parent accepts this earlier boundary (amendment 6614404848). `predecessors` catches the `DIAGNOSTIC_NO_ACCESS` refusal and returns the protected empty page.

## Added to both rows

These additions sit inside the existing `it.each`; F11 and F20 do not enter them.

1. **Before the deadline**, the reviewer calls `GET orders/<B>/predecessor-candidates` and gets:
   - HTTP 200 with `cache-control: no-store, private`;
   - `{ candidates: [{ reportId: <A report id>, observedAt: "2026-10-21T12:00:00.000Z", mileageKm: 123000 }], nextCursor: null, exhausted: true, scope: "currently_authorized_retained_predecessors" }`.
2. **At the deadline**, after the existing `expireVisitRights` transition, the read-only `pairDeadlines` readback asserts:
   - the clock and the selected material deadline both equal the predeclared deadline;
   - the other three A/B material deadlines, the reviewer/technicianA/technicianB qualifications, and the reviewer/technicianB Session expiry and elevation are all strictly later;
   - every qualification and order-assignment revocation is null;
   - the proof is issued and not invalidated, consumed or erased.

   The proof's `rightsUntil` equals the deadline: `comparisonRights` binds it to the earliest bound material (`PrivateContinuityAttestation.ts`). Parent correction 6614560976 permits this equality. The predecessor route reads no proof state, so the proof is not the cause. No live-proof/expired-material state is claimed.
3. **At the deadline**, the same route returns HTTP 200, the same header, and `{ candidates: [], nextCursor: null, exhausted: true, scope: "currently_authorized_retained_predecessors" }`.
4. **Unchanged:** every original handoff, empty-handoff, 403 `DIAGNOSTIC_NO_ACCESS`, zero-report and zero-audit assertion runs after the new reads, unchanged and in order.

## Parent correction 6614560976

The ordinal-12 source already matches the corrected rule, so this is an evidence-only update. The source is unchanged at `b52b1f06`; the map asserts that the current HEAD's non-doc source equals it.

- **Proof deadline:** `proof.rightsUntil` may equal the selected deadline. The test asserts that equality.
- **Strictly later:**
  - reviewer `diagnostics.reviewer` qualification;
  - technicianA and technicianB `diagnostics.technician` qualifications;
  - the acting Sessions' `expiresAt` and elevation. The actors are the reviewer (predecessor/proof reads) and technicianB (handoff/consume reads).

  The three non-selected material deadlines are also later. Qualification and assignment revocations are null.
- **Refusal before proof-expiry evaluation:**
  - `retainedCandidate` calls `reports.compared` (line 271), which reaches the identity graph/projectIdentity liveness check, before `comparisonRights` (line 277).
  - The route reads no continuity proof.
  - In the test, the at-deadline predecessor read returns the exact protected empty page before the original post-transition handoff read, which is the first read at the deadline that evaluates proof expiry.
- The original handoff, 403, zero-report and zero-audit oracles are unchanged. No guard, row or oracle changed.

See `corrected_rule_6614560976` in the map.

## Audit

- The e2e diff rewrites 4 lines by suffix only: the two rows, the tuple type and the callback parameters. All base `expect(` lines are kept in order.
- The helper diff only adds lines, and the new method makes only `findUniqueOrThrow` reads.
- Changed paths are within the allow-list.
- Production, migration, guard, config, dependency, workflow and timeout files are unchanged.
- There are no forbidden markers, and the original nine suites and the memory refusal are unchanged.
- All 2394 prior evidence blobs are equal.
- No Session is expired or revoked.
- Accounting is unchanged at 56/168/224. No accepted cases were added, and F16/F17 stay OPEN.

## Checks

`checks/offline-command-receipts.json`: typecheck, tsc6, lint, build and `git diff --check` ran serially against `b52b1f06`. All exited 0.

## Not run or claimed

- Not run: tests, services, runtime, review.
- Not proven at runtime: the predecessor route after a proof is issued for the same pair, and the duration of the two extra reads under the unchanged 120 s timeout.
- Nothing here claims #939, #938 or A acceptance.

Scripts are in the owned `/tmp/issue939-f16f17-supplemental-r1/`: `edit.py` (sha256 `f2307452…`), `run.py` (`0fd1dc63…`) and `map.py` (`baf78ba2…`, with the corrected-rule checks). The pre-correction map is kept as `map-ordinal12-r1.py`.

Check receipts are unchanged. They were recorded against the same source `b52b1f06`; no source changed, so the checks were not rerun.
