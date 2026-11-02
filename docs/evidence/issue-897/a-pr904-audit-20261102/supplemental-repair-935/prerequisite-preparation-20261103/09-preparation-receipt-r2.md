# Issue 935 prerequisite preparation, run 3

Preparation passed under contract https://github.com/Carberk/carberk/issues/935#issuecomment-6588058176
in the same writer/worktree and exclusive slot `issue935-prereq-offline-20261103-r2`.
Resume HEAD was `e322a639c6c996b04f6eca7c0144db9f9af04293`, tree
`82a6c00f45b22e38972d45a3875dcab70e2613b4`, on `agent/issue-935`.
Host settings remain the coordinator-verified `codex_work/gpt-6.1-sol`,
`reasoningEffort=xhigh`, `serviceTier=default`, full-access/default.

Commands ran sequentially with complete argument arrays, UTC times, durations,
exit codes and raw-log SHA-256 values in their corresponding `.command.json`:

| Command | Exit | Evidence prefix |
|---|---|---|
| Frozen filtered API/admin install, offline | 0 | `03-install-offline` |
| Existing contracts build | 0 | `04-contracts-build` |
| Existing DB build with only the contract's synthetic unreachable generator URL | 0 | `05-db-build` |
| Direct Node runtime-import check | 0 | `06-runtime-imports` |

The install used pnpm 12.11.2, reused the existing cache with zero downloads and
needed no registry fallback. Existing supply-chain/build policy stayed intact.
The invoking binary is the Corepack shim recorded in `01-inputs-before.json`;
the actual pnpm version is retained in the install output. Node was v24.13.0.

Both packages' configured JS/declaration entries and DB testing exports exist.
`07-inputs-after.json` verifies all 3,120 tracked non-doc input hashes, including
source, schema, migrations, scripts, manifests, lockfile and configuration, are
unchanged. Direct non-doc comparisons against resumed HEAD and the assembled
source pin both exit 0. All 18 historical audit/original block-receipt hashes
are unchanged. No original evidence file was overwritten.

`08-generated-output-hashes.json` inventories all 779 built/generated files and
their hashes. Every output is ignored. The authorized transient build locks
were absent before preparation and removed by the existing scripts afterward.
No generated/dependency content is committed or shared with another checkout.

Docs applicability is internal configuration-driven preparation. No external
API or dependency version changed. No app build, database/service/container,
migration/seed, HTTP, hosted/deployed/native or PR/issue mutation ran.

This is prerequisite success only. Under the conditional release, the same
writer now continues the original bounded repair with meaningful behavior RED
before production changes, followed by the same-selector GREEN and affected
checks. No repair, runtime, source-readiness or milestone acceptance is claimed.
