# Corrected mixed identity: RED checkpoint and method-transition case

This #914 implementation assignment stops before production changes at the task's explicit design-case return point. Supported corrected mixed continuity remains required under accepted ADR-0108. The founder's comparative-attestation approval is settled. No release exclusion is proposed.

## Ownership and checkpoints

- Owned worktree: `/Users/bagtyyar/.t3/worktrees/carberk/t3-7ea20cdc`.
- Host scaffold: `t3/7ea20cdc`, unchanged at `c9e80cb88f513321b6c7a6f65b6dacd95cd873ba`.
- Supplied base and pushed reservation: `c9e80cb88f513321b6c7a6f65b6dacd95cd873ba`, tree `4932573e28c0ebb8d8cd98600e2a935638d57f51`.
- Reserved branch: `agent/issue-914-corrected-mixed-source-20261022`. It was pushed before edits. No second checkout was created.
- Pushed RED checkpoint: `26f319c4fdaf6d8e8a94e44543ed7b1a3f03da84`, tree `d4825c148722afb1c11a193f4e37915e433d1b04`.
- GREEN checkpoint and GREEN log: absent. No production implementation was attempted.
- Final documentation checkpoint SHA/tree and clean/pushed status are returned separately to avoid self-reference.

The runtime identifies this session as Codex `gpt-6.1-sol`, medium reasoning. The live orchestration catalog confirms inherited provider `codex_work` and model `gpt-6.1-sol`; medium is an available effort and Standard is an available service tier. Its composer default effort is low, which is not a measurement of this already running session's effort. No model substitution, quota probe, child, reviewer or parallel delegated writer was used. Root remains sole assembler/publisher through PR904. This writer created or worked on no PR.

## Exact case for Root before source changes

The unresolved distinction is a method change *within one visit*, not a manual/VIN comparison between two independently captured visits.

1. Visit A retains original raw record R0 with `method: manual`, `vin: null`, a manual observation reference and physical chassis041 evidence E0. Its released report and original comparison pin remain R0/E0.
2. A later raw record R1 on that same order has `method: vin`, VIN041 and its own actual observation date/mileage. Independently staged and classified fresh provenance supports E1, which binds R1, names E0 in `supersedesId`, explains the original recording error and retains chassis041 plus consistent VIN041 stamps. All original and current records, hashes and rights remain retained.
3. Current intake equals R1. No raw record is unrepresented and no evidence component is disconnected. The other physical visit B independently retains manual chassis041 evidence. The current reviewer is qualified and independently assigned to both visits, distinct from B's linking technician.
4. The reverse same-visit transition is also possible: original VIN observation and evidence, followed by manual observation and fresh superseding physical evidence on the same order. This is distinct from simply putting the corrected visit on the opposite side of the pair.

The decision to preserve is whether an explained, freshly supported change of observation method belongs to the recording-correction contract, and what distinguishes it from a new physical visit requiring a new order. If it is a supported correction, continuity must preserve the original method in the pin while resolving the effective identity through the complete graph. If it requires a new visit, capture's current ability to append that transition cannot itself authorize continuity. Neither helper shape nor the existence of the capture operation settles that product distinction.

Evidence traced:

- [ADR-0108 identity/correction contract](../../adr/0108-pair-bound-diagnostic-reinspection-continuity-proof.md#identity-and-comparison) requires original/corrected values and supporting provenance, and admits corrected identity including mismatching VIN. It does not explicitly classify a same-visit observation-method transition. Its audience/lifecycle section says same-visit correction rules remain unchanged.
- The [original decision table](../issue-897/diagnostic-reinspection-continuity-transfer-decision-table-20261021.md) separately lists manual/VIN between visits and corrected/mismatching VIN. The [approved handoff](../issue-897/diagnostic-continuity-approved-implementation-20261021.md), [feature 50](../../prd/features/50-reports-tier.md) and [flow 66](../../prd/flows/66-diagnostic-inspection.md) preserve immutable observations and distinguish editorial correction from a new inspection. They do not supply the missing method-transition classification.
- [Raw capture](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIntake.ts#L212) appends a raw record under the order lock. It checks arrived state, time, version and applicable public association, but does not require the prior observation method to match. Private intake can therefore append manual then VIN, or VIN then manual, on one order.
- [Structured capture](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIdentityEvidence.ts#L198) requires the current raw record, a retained same-order parent without a successor, live rights and at least one previously unused provenance reference. It does not require parent and child observation methods to match. The full record is a replacement; original evidence remains retained.
- [Comparison evidence](../../../apps/api/src/modules/diagnostics/infrastructure/PrismaDiagnosticIdentityEvidence.ts#L238) follows explicit ancestors and descendants around the immutable pin. It does not collapse the chain into the newest raw observation.
- [Current policy](../../../apps/api/src/modules/diagnostics/domain/PrivateContinuityAttestation.ts#L29) blanket-refuses corrected mixed pairs, and its graph resolver requires every record's observation method to equal the pinned side method. Those are implementation boundaries, not authority for excluding the case above.
- [The old VIN domain test](../../../apps/api/src/modules/diagnostics/domain/PrivateContinuityVinCorrection.spec.ts#L74) includes a manual leaf mutation among refused inputs. That fixture also retains a VIN current observation, so it does **not** isolate a fully accounted, supported method transition. No actual contradiction between that old oracle and ADR-0108 has been established. It stays untouched.

Root's next action is to resolve this exact classification against the accepted contract before dispatching production implementation. This is not a request to reconsider corrected mixed admission or comparative reviewer authority. The assignment explicitly requires returning a true unresolved case before source changes. The [run-issue skill](../../../.claude/skills/run-issue/SKILL.md) likewise says: "Scope expansion, architecture/product ambiguity, missing nontrivial design, destructive recovery and semantic conflicts return to Chief of Staff."

## Fresh domain sibling and genuine RED

New [PrivateContinuityCorrectedMixed.spec.ts](../../../apps/api/src/modules/diagnostics/domain/PrivateContinuityCorrectedMixed.spec.ts) declares 20 tests without changing any prior test. Its authorized positive cases keep each visit's method unchanged across correction:

- Supported manual physical-identifier correction against independently retained consistent VIN evidence.
- Supported VIN recording correction against independently retained manual physical-identifier evidence.
- Each pair with the corrected visit as predecessor and as candidate.

The positive assertions preserve original pins and observations, use explicit supersedes links and new bound support, and require literal retention dates. Additional assertions cover original/descendant and comparison rights, missing components, missing graphs, disconnected evidence, incomplete evidence counts, unsupported or unbound correction support, changed pins, unrepresented raw history, unexplained current material, simultaneous contradictory identifiers and automatic refusal. The sibling does not decide the method-transition case above.

Exact freshly executed command:

```sh
AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/diagnostics/domain/PrivateContinuityCorrectedMixed.spec.ts
```

Result: **8 failed, 12 passed**. Four pair/direction positive tests and four positive rights tests fail with `DIAGNOSTIC_NO_ACCESS` at the unchanged production corrected-mixed guard, line29. These are reached policy failures, not imports or setup errors. The 12 passing negative tests currently benefit from the blanket refusal and do not establish safety after admission changes. Assertions after a failing positive call remain unreached.

RED artifact: `/tmp/issue-914-corrected-mixed-7ea20cdc/domain-red.log`, SHA256 `6d5e8dc7012cf3d1af72f20f276a6ceab230e3f497e56a287fdc6814d05c11fd`. The log predates the pushed RED commit. No GREEN log or hash exists.

## Verification and preservation

All artifacts below are under `/tmp/issue-914-corrected-mixed-7ea20cdc/`. Direct affected checks ran freshly. Installation used `pnpm install --frozen-lockfile`; tracked lockfile/configuration are unchanged. Contracts and DB packages built in dependency order. DB generation used only `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline`, without a database connection or local service.

| Executed command | Result |
|---|---|
| New domain command above | Expected RED, 8 fail/12 pass; `domain-red.log` |
| `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/diagnostics/domain/PrivateContinuityAttestation.spec.ts src/modules/diagnostics/domain/PrivateContinuityManualCorrection.spec.ts src/modules/diagnostics/domain/PrivateContinuityVinCorrection.spec.ts` | PASS, fresh 79/79; `prior-domain.log` |
| `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm test:unit` | FAIL only new sibling's 8 RED assertions; API 2,518 pass/2 existing skips, 263 other files pass. Turbo 9/10 successful, 9 cached, API fresh; `root-unit.log` |
| `DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline pnpm typecheck` | PASS 11/11, 10 cached, API fresh; `root-typecheck.log` |
| `pnpm --filter @auto-tm/api exec tsc --noEmit` | PASS, fresh TS7; `api-ts7.log` |
| `pnpm --filter @auto-tm/api exec tsc6 --noEmit` | PASS, fresh TS6; `api-ts6.log` |
| `pnpm --filter @auto-tm/api lint` | PASS, fresh complete API, zero warnings; `api-lint.log` |
| `pnpm --filter @auto-tm/api build` | PASS, fresh Nest build; `api-build.log` |
| `pnpm check:agent-docs`, `pnpm check:runtime-imports`, `pnpm check:glossary` | PASS, fresh; respective logs |
| `pnpm --filter @auto-tm/api exec vitest list --config /tmp/issue-914-corrected-mixed-7ea20cdc/collection.config.mts --staticParse=false --json` | PASS 112 declarations; `collection.json`, empty `collection.stderr` |
| Full base path/content/mode comparison | PASS all 4,161 existing paths unchanged; `base-file-manifest.json`, `preservation.json` |

Collection config explicitly sets `globalSetup: []` and `setupFiles: []`. `staticParse=false` performs actual imports. No hooks, test bodies, HTTP setup, DB or storage bodies execute during collection. The ten retained files contain the seven original proof journeys, including the 99-case private suite, plus all three conflict siblings. Their 112 declarations are retained. All 100 base E2E files and all five base diagnostics domain test files are byte-identical. Because every base file and mode is identical, all prior assertions, imports, original seven journeys, conflict journeys, production, schemas, migrations, guards, CI and budgets remain exact. No old oracle was weakened or renamed.

Base manifest SHA256: `0b6e0928e93aae6a595858f8df00b812238bfcbdd70cd3f7a7056bc1925bd4b7`. Collection SHA256: `0b1c9b70b1841e727640070441a52a3adf3e813269cb2bd89933fa32b7c33851`. Other artifact hashes are in `artifact-hashes.json`.

Changed paths relative to the supplied base are only the new domain sibling and this new evidence document. The owning overview is unchanged because no implementation boundary changed. No new HTTP sibling was authored at this pre-implementation stop. The requested new corrected mixed HTTP journeys, setup, issuance, consumption, audits, retries and protected refusals are **UNKNOWN**, not covered by local domain RED, import collection, older hosted results or compiler success. The [current hosted receipt](../issue-897/erasure-audience-assembly-and-c1fa-hosted-20261022.md) remains historical evidence on its named candidate; the assembled consumed-erasure change's fresh hosted result remains UNKNOWN.

| Criterion | Evidence and status |
|---|---|
| Unique isolated reservation from exact base, push before edits | PASS, reservation and RED SHAs above |
| New domain sibling first, execute against unchanged production | PASS, genuine RED and pushed test checkpoint |
| Four required corrected mixed pair/direction positives | Specified, executed RED; implementation BLOCKED before source by unresolved method-transition classification |
| Complete graph/raw/evidence/provenance/rights and automatic preservation | New assertions specified; old 79-case suite PASS; new admission safety not proven GREEN |
| Same issuance/consumption full policy and immutable bindings | No source changes; requested new behavior remains unimplemented |
| Fresh ordinary HTTP sibling and actual journey acceptance | Not authored; runtime UNKNOWN, Root owns later normal hosted publication |
| Original seven journeys, conflicts and exact112 declarations | PASS source/mode preservation and actual import-only collection; no HTTP runtime claim |
| Existing production, domain and HTTP assertion frontiers | PASS full base comparison; prior domain79/79 and remaining API2,518 pass |
| Root units/typecheck, affected compilers/lint/build, docs/runtime/glossary | Results above; root unit intentionally RED, no aggregate GREEN claim |

Docs: not applicable. This is an internal domain specification checkpoint with no dependency, service interface or version changes; repository contracts/source and installed tooling supplied the relevant information. No external lookup was needed.

No local Docker/services, DB/storage test bodies, HTTP execution, CI query/mutation, Railway/proxy/credentials/reset/deployment/native/store work, external messages, additional checkout, children, integration push or PR were performed. This checkpoint is not a completed implementation or release acceptance. Root independently inspects the new assertions and exact unresolved case before any assembly.
