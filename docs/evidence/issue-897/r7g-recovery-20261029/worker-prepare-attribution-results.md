# Worker prepare attribution receipt

This source-only receipt records the one approved attribution run on the stopped clone. It does not change production source, SQL, migrations, guards, worker code, caps or acceptance criteria. It is diagnostic evidence, not capability acceptance.

## Resource and input

- Project: `candidatea-r7g-attribution`
- PostgreSQL container: `candidatea-r7g-attribution-postgres`
- Port: `62778`
- Database: `candidatea_r7g_attribution_before`
- Restricted role: `r6c_ownership_worker_0997c81081f6`
- Input: 100 roots and 100 rows, SHA256 `0cc55f9db0bbe795fb2a1c14e4d8b7bef3cb0b0a58ea3299facd1e4ee8990e22`
- Driver: `/tmp/897-r7g-worker-attribution-20261029/profile.cjs`, SHA256 `88434da53284a0a2dbdd2e9916a82c519a569cf84c81d5a221f9e82b71de706e`

The command ran once with six fixed phases, READ COMMITTED, ROLLBACK per phase, a 15-second statement limit, 20-second client limit and 250 ms lock limit. The clone was drained and stopped afterward. The retained ownership7 database was not changed.

## Phase results

| Phase | Result |
|---|---|
| `prepare100` | P0001 `diagnostic_source_scope_limit`, 5099.010 ms |
| `prepare10` | PASS, 2982.307 ms |
| `parse10` | PASS, 80.986 ms |
| `scope10` | PASS, 1057.917 ms, 240 entries |
| `keys10` | PASS, 41.178 ms, 370 keys |
| `effects10` | PASS, 76.891 ms, 30 effects |

The exact `prepare100` error was:

```text
SQLSTATE P0001: diagnostic_source_scope_limit
PL/pgSQL function diagnostic_source_scope_before_purge(jsonb) line 44 at RAISE
PL/pgSQL function diagnostic_source_scope_before_intake(jsonb) line 13 at RETURN
PL/pgSQL function diagnostic_source_scope_before_finite_fk(jsonb) line 4 at RETURN
PL/pgSQL function diagnostic_source_scope_before_complete_moderation(jsonb) line 33 at RETURN
PL/pgSQL function diagnostic_source_scope_before_composition(jsonb) line 13 at RETURN
PL/pgSQL function diagnostic_source_scope_before_listing_publication(jsonb) line 4 at RETURN
SQL function "diagnostic_source_scope" statement 1
PL/pgSQL function diagnostic_source_insert_receipt() line 15 at assignment
SQL statement "INSERT INTO public.diagnostic_source_commands(command) VALUES(command) RETURNING id"
PL/pgSQL function diagnostic_prepare_source(jsonb) line 4 at SQL statement
```

## Function attribution

For `prepare100`, the highest measured counters were:

- `diagnostic_source_registry`: 12,596 calls, 3,097.641 ms self-time
- `diagnostic_source_meta`: 21,956 calls, 3,715.862 ms total, 620.138 ms self-time
- `diagnostic_source_add`: 11,881 calls, 3,235.414 ms total, 612.722 ms self-time
- `diagnostic_source_disposal_effects`: 659.843 ms total, 147.241 ms self-time
- `diagnostic_ownership_disposal_scope`: 200 calls, 77.470 ms self-time
- `diagnostic_source_key`: 10,885 calls, 3,259.506 ms total, 52.982 ms self-time

The smaller exact-ten prepare passed in 2,982.307 ms. Its scope function took 1,951.430 ms total across two calls. The phase counters also show 4,784 registry calls, 500 source reads and 9,757 metadata calls. The direct phase checks passed at 80.986 ms for parsing, 1,057.917 ms for scope, 41.178 ms for lock keys and 76.891 ms for effects. Scope returned 240 entries, lock-key derivation returned 370 keys and effects returned 30 entries.

Repeated registry, metadata, scope and source-read work dominates the failing path. The unchanged semantic closure limit still refuses `prepare100` before receipt insertion. This run does not establish acceptance or justify changing that limit.

The smallest next source hypothesis is an immutable exact registry-map and metadata-reuse candidate. It may be considered only after proving all 77 registry entries, unknown/null/duplicate behavior, and complete OLD/NEW scope, lock-key and effect equivalence. No repair was selected or applied. The ordinary five-second oracle and a pristine full100 baseline remain required.

## Artifacts and cleanup

- Raw measurement: `/tmp/897-r7g-worker-attribution-20261029/measurement.json`, SHA256 `27fbd41462a17cfcb438c90b18113266520f50286b9af8894bad93ac188c6410`
- Normalized measurement: `/tmp/897-r7g-worker-attribution-20261029/measurement-normalized.json`, SHA256 `96a457dc81ec9678364498cec70698695d96362b12cd8149179ca2289e331b02`
- Drain receipt: `/tmp/897-r7g-worker-attribution-20261029/drain.json`, SHA256 `f34e75fb01157944a4912903ca2eb240db2d9354fcf58cfe59fab76d779b95f9`
- Stop receipt: `/tmp/897-r7g-worker-attribution-20261029/stop.log`, SHA256 `a76efff297231486276aa748c71654c649a65d5d1155446f5d35187fb7f3c6a9`

Drain verified source/campaign receipts `0/0`, no remaining clone clients, matching function and guard fingerprints, and all eight fixture fingerprints. The clone is stopped. This evidence remains attribution-only; full100 pristine setup and ordinary five-second proof are still open.
