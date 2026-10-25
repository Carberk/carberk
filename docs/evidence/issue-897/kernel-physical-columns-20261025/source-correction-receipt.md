# Issue 897 physical-column source correction

One bounded correction round under `/tmp/897-bootstrap-physical-column-parent-decision-20261025.json`, based on R3 `f375cb4ae6c363e5a724d92ecc7c9f4af5cc5520`, tree `a08b352c271b3b8543b836e1775edf4584676b1e`. The host scaffold `t3/42bf0da8` remains at `9bcbf1e6f325a9a36cba98fa6e8c796b4e67a408`.

Only the InspectionInterest literal in the two unmerged migrations, their exact mirrors, and their two active R3 profile checksum entries change. The packet's assertion updates and byte archives accompany an expanded source-only regression test. No schema, caller, API, coordination mechanism, workflow guard or historical receipt changes.

| Migration | Original SHA-256 | Revised SHA-256 |
|---|---|---|
| `20261023130000_diagnostic_source_kernel` | `cc10000343f6257cb4b0d9cd4240ec57f46642f5a9b0735cd440680602d642b3` | `b9b2d465c04cc34693e5774d12910a33bb29b39d8452f5a2862dc24b667f4fbf` |
| `20261024030000_diagnostic_purge_effects` | `ccb26627dcee74bf20c01c5e89dba2d6ade4d6644136fd55554c8246fa8f46d0` | `23d894c79c5927d7d976c79e4cbe958af83725ccf172208b7f4d6132e0d3d4ba` |

`original/` preserves nine exact R3 files. `original-profile-inventories.json` preserves all 52 expanded historical inventories unchanged, SHA-256 `6e4c5a8bfce75fc3c8c77505316df23c5a6eae9a42d42fd8fe640c01a590a6b7`. Historical receipts retain their original SHA scope; this revision does not reinterpret them as evidence for revised bytes. All 949 existing evidence files, including 37 JSON files, remain unchanged. All 72 accepted9bcb and 33 current-main migration SQL files remain byte-identical.

Red checkpoint `29cd6fc1` demonstrates both original registries failing the same physical-column assertion at `inspection_interests.fields: listingId`. The corrected source passes 17 focused offline assertions covering kernel, guard repair, purge, source correction, composition, invariants and physical names. The new audit checks mapped scalar PK/fields/unique and both reference endpoints for both 77-row literals, unchanged 76 rows and all other SQL bytes, exact archives, mirrors, schema identity and all 52 inventories. Changed plans reject original and individually mixed hashes in candidate, main and retained inputs. Agent-docs, glossary and diff checks pass.

Acceptance remains held. The unchanged planner has an existing fast path returning `unchanged` for identical candidate/main inventories and schema with no retained entries, before checksum validation. It also returns that result for identical original inventories. Unconditional checksum refusal is therefore not proven; changing this mechanism exceeds the authorized two-entry profile edit. No dual-hash allowlist or runtime inventory normalization was added. DB lint and typecheck fail on missing generated Prisma/contracts modules. Root typecheck invokes build prerequisites and stops at missing `DATABASE_URL` before Prisma generation succeeds. No environment workaround or retry was attempted. Full production suites were neither imported nor executed. Docs lookup: not applicable, internal source metadata correction.

No SQL, hosted run, service, Docker, HTTP, device, deployment, reset or B5 operation occurred. Prior diagnostic `40177598331/1` remains one spent run, 22 authored caller cases and 0 executed. B5 remains UNUSED. Fresh disposable bootstrap, actual migration inventory, installed registry/guards, row projection/normalization, FK closure, unique lock discrimination, purge ownership, caller results/waits and teardown require separate runtime authority. This source checkpoint grants none.
