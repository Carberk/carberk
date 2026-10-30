# Reset read-only implementation checkpoint

Base `6d9567a0ac675db98d808ab3adcbca4fdabf036d`. Branch `agent/issue-901-candidate-a-reset-20261029`, scaffold `t3/ccafc35f` unchanged at base. Test-only checkpoint `be01b77434e6097fa1808c0cd45432b5eaa8ef51`, tree `2ad1ffe516ce8186b637b067122f87d06f3ef7aa`. Source checkpoint `64642c8e9d28221506683e600ba318c738312ab9`, tree `3a5750db9ab29324365b481b895e914e411bcab4`. Test runs preceded their respective production changes; the test-only commit was staged and pushed after those runs, with production changes excluded from that commit.

Only `scripts/staging-clean-reset.mjs`, its test, `scripts/staging-quiescence.mjs`, its test and this owning evidence changed. No dependency, DB/migration/helper, product/API/worker/mobile or parent execution-ledger edit. No PR, integration publication, deploy or live mutation. The existing CLI-session adapter and token-mode refusal/no-fallback semantics are preserved.

| Criterion | Actual evidence | Result |
|---|---|---|
| Exact CLI-session can reach fresh read-only quiescence observations | New test executes real `RailwayPlatform` through the existing network/process/database boundary fake, produces two challenge-bound remote receipts, then requires `QUIESCENCE_EVIDENCE_GAP` | GREEN |
| Credential mismatch and cross-target scope refuse before remote observations | New negative tests require zero effects/receipts and zero mutations | GREEN |
| Exact all-version, delete-marker and multipart planning | New test requires literal complete deletion identities and exact retained catalog identities, with unchanged input | GREEN, pure planning only |
| Missing/extra bucket, incomplete snapshot, extra cursor, duplicate version/upload, changed/unapproved/missing catalog metadata, catalog marker/multipart, malformed object refuse | New negative matrix through `planObjects` | GREEN, pure planning only |
| Existing remote reset guards and quiescence history/active-job refusals | Focused reset/remote/quiescence run | 159/159 GREEN |
| Existing Railway identity and interruption/lost-response controller regressions | Quiescence/Railway run, including Git-ledger boundary scenarios | 224/224 GREEN |
| Real provider exclusion, actual old-grant maximum and accepted storage request drain | [Concrete capability proposal](reset-closure-proposal-20261029.md) | Unproved; independent review required |
| Real paginated S3 collection, approved reference bytes/reconstruction, PG trigger/reset compatibility, object/controller durable recovery, reopen and latest-main restoration | Not executed by this slice | Open |

## Commands and retained output

The parent explicitly released the PDF window and granted a focused Node-only window. No DB, container, build, native runtime or live mutation was used. The broader Railway suite exercised local Git-ledger fixtures, not shared staging. The 159-test run overlapped that broader suite briefly; this did not satisfy the requested serialization, although both runs passed. The parent was notified when all processes drained and the CPU window was released. No additional runtime resource was allocated.

- `node --test --test-name-pattern='CLI-session target|credential modes|cross-target scope' scripts/staging-quiescence.test.mjs`: 2 failed, 1 passed, 57 ms. The exact CLI request was refused by the old project-only shape guard instead of reaching the evidence-gap refusal; the cross-target negative passed. [RED output](reset-20261029/quiescence-cli-red.log), SHA256 `150af0d94471b999e30e9f3ee53e19b8ab110863750b96b7e6105a622769337e`.
- `node --test --test-name-pattern='object planning|object inventories' scripts/staging-clean-reset.test.mjs`: 2 failed because `planObjects` did not exist. Dynamic import succeeded; the new behavior was absent. [RED output](reset-20261029/object-plan-red.log), SHA256 `f8567d865ada140132b81a39048710d6628acf38eae91d4fc0eebfd9b271ccae`.
- `node --test scripts/staging-clean-reset.test.mjs scripts/staging-clean-reset-remote.test.mjs scripts/staging-quiescence.test.mjs`: 159/159 passed, 283 ms. [GREEN output](reset-20261029/object-quiescence-green.log), SHA256 `d29b6db0c80e51aac02cfed71f10d7ddbdec4323f2525c7525b6cd09dfbecf76`.
- `node --test scripts/staging-quiescence.test.mjs scripts/staging-railway.test.mjs`: 224/224 passed, 274,722 ms. [GREEN output](reset-20261029/quiescence-railway-green.log), SHA256 `1ea1f0d6419288e63e827b9646ef7b90eb80b93b4379f6a8ba1eb5dd44ef4cf3`.
- `git diff --check`: passed. No workspace compiler/lint/build, full repository suite, hosted CI or live acceptance ran in this bounded window. No new TypeScript/runtime boundary or external dependency was introduced.

The pure planner accepts normalized exhausted inventory, not raw S3 pages or caller authority. ETag/size checks do not establish byte checksum membership. The six pinned bucket names include the current default video-private bucket; a different configured bucket refuses until its target-specific inventory is reviewed. Unknown prefixes within a bucket still require the later collector's source/runtime classification before execution. No deletion executor consumes this result. No new interruption or restart acceptance is claimed for object planning; the 224-test interruption cases cover existing controller behavior only.

After the released window, the recovered historical design transcript identified two additional private bucket families, `business-chat-private` and `diagnostic-private`, absent from the new six-bucket planner. Its full target inventory criterion therefore remains OPEN. No extra tests or source repair ran after release. The proposal records the exact next correction and trusted-clock requirement; do not mistake the pure planner's GREEN for complete storage coverage.

This checkout remains owned and preserved for follow-up. No local DB/Redis/MinIO/container, port, credential file or persistent runtime was created. Temporary raw test logs remain in `/tmp/issue901-*-20261029.log`; evidence copies are committed here. RED copies strip only trailing spaces from blank stack-trace lines to satisfy the repository diff gate. SHA256 values above identify the raw `/tmp` originals; GREEN copies are byte-identical. Parent owns independent proposal review, dependency coordination, staging reservation/resource handoff, assembly and cleanup after integration.
