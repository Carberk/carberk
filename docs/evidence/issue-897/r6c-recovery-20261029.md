# R6c recovery, 29 October

Owned checkout starts at 023e6a5dcefbcd5d7e7c71bf4bba18f01a3d01ab, tree 53c99b0ed17a8f2a80aca66ff5cf86114cea8399. Held d2d14258e84d3b9768b506a2130a463257774586 descends from that base. Its eight-path payload was transferred unchanged as a098aee7. Earlier 332f4b557cc48c90b4795921177842f2cc4f767d and old branches remain intact.

The held ordinary HTTP producer failed twice with its original 120000ms setup and 5000ms request caps. Run 1 overlapped the coordinator's root check and is contaminated, 88 completed HTTP commands and 13 Orders. The unchanged clean run completed 95 commands and 14 Orders before timeout. Neither declared E or created ownership material. Full queue, privilege rollback and races remain unknown.

Artifacts live at `/tmp/897-r6c-recovery-20261029`, including producer-1.log, producer-clean.log, ownership-1/producer-first-failure.json and ownership-3/producer-first-failure.json. Exact disposable project is auto_tm_ci_897_r6c_candidatea_1, PostgreSQL 65379, Redis 65378, MinIO 65380. Loaded migration160 checksum is 87dd1162b90c334137859cbaf4afd61af068f50602a4ec438d041b22364e95b1, 98 migrations.

After the clean run, read-only source-scope measurement found a commissioner-only root expanded to 275 rows, 1.17–1.40s per discovery. Staff roots expanded to 189–191 rows, 0.86–0.99s. Adding the first Order root did not change those closures. DiagnosticPreparedIntake roots the actor User explicitly, and diagnostic_source_scope expands explicit subject inventories. Distinct Listings alone did not isolate the fixture. The next owned fixture repair isolates principals and center authority per visit while retaining the comparative pair's shared qualified staff and all ordinary routes.

Docs: not applicable. This recovery changes internal worker/fixture behavior, with no dependency upgrades or new external API contract.
