# Issue #946 bounded fresh-resource seam handoff

Source commit `362aab7523a329ed8c8208efcd4b0b973a16e04d` is the implementation checkpoint from retained HEAD `b425fe1800514f4253872463eb0db7c35556302d`. The source tree is `a4e6b2aa552352ea171dc5e1a32f872b16b944c1`. The new evidence is under this directory and will be committed as a documentation-only descendant. #945 PG behavior and all historical evidence remain preserved.

The fixture now validates three independently supplied expected ports. Defaults remain PostgreSQL 61169, Redis 61168, and MinIO 61170. `DIAGNOSTIC_EXPECTED_REDIS_PORT` and `DIAGNOSTIC_EXPECTED_MINIO_PORT` accept strict decimal TCP ports 1 through 65535 only. Invalid values return no expected port, and `initialize()` rejects them through the existing dependency path before resource connections. The initialization ownership function checks exact worker URLs, loopback/database name, Redis DB1, MinIO HTTP loopback, and the fixed private bucket.

The focused boundary test covers 24 tests: historical defaults, fresh 61171/61173 overrides, invalid values, mismatched ports, wrong loopback/database/Redis DB/bucket, and undefined expected-port rejection. The deliberate red run is retained under `checks/red/`; it failed only because the new exports were absent from the clean #945 helper. The final run passed.

## Serial verification

All six commands ran serially in the exclusive slot. Raw streams are base64 stored so their exact bytes and hashes survive `git diff --check`. See `raw-stream-encoding.json` and `checks/final/offline-command-receipts.json`.

| Check | Exit | Start UTC | End UTC | stdout SHA-256 | stderr SHA-256 |
|---|---:|---|---|---|---|
| `focused-boundary-green` | 0 | 2026-11-03T23:46:47.243559+00:00 | 2026-11-03T23:46:48.734942+00:00 | `efd81e390bdb304887441e67c458049a34cf4e79ff71168f16701e037e8b9da8` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `api-typecheck` | 0 | 2026-11-03T23:46:48.735239+00:00 | 2026-11-03T23:46:51.344108+00:00 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92` |
| `api-tsc6` | 0 | 2026-11-03T23:46:51.344458+00:00 | 2026-11-03T23:46:58.900530+00:00 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `api-lint` | 0 | 2026-11-03T23:46:58.900910+00:00 | 2026-11-03T23:47:04.380944+00:00 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632` |
| `api-build` | 0 | 2026-11-03T23:47:04.381335+00:00 | 2026-11-03T23:47:10.682148+00:00 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `9aba080a04d36f3c5b3e64cf2e200d70a422c78297ff80bac5f5551def846538` |
| `git-diff-check` | 0 | 2026-11-03T23:47:10.682443+00:00 | 2026-11-03T23:47:10.704603+00:00 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

## Static #944 compatibility

See `static-compatibility-table.json`. The corrected future manifest must use base `auto_tm_897_938_s1r1`, random 6-hex template and `_w1`, PG 61172, Redis 61171 DB0→DB1, MinIO 61173, `VITEST_POOL_ID=1`, `NODE_OPTIONS=--import=tsx`, and unchanged reporter/cleanup destinations. Worker dist is absent in this offline worktree but is a lazy `purgeA` dependency, outside the selected F16/F17 boundary path; the coordinator must inventory/build it before any selector that reaches that method.

## Allow-list and preservation

`allow-list-audit.json` and the lossless `source.diff.base64` artifact prove that only `apps/api/test/helpers/diagnosticPreparedReaderFixture.ts` and `apps/api/test/helpers/diagnosticPreparedReaderFixture.boundary.spec.ts` changed from the retained base. No production/config/dependency/migration/workflow/selector/assertion changes occurred. Existing docs and evidence are untouched. No service, database, Redis, MinIO, Compose, listener, volume, or network resource started.

## Next owner and blocker

Coordinator owns selective assembly onto `007b27c488a70bb74b646b044d5c572681d9bd89`, fresh exact-SHA Standards/Spec review for combined #945+#946, and any later #944 runtime preparation. This writer did not run reviewers or #944. The only concrete preparation note is the absent worker dist inventory recorded above; it is not exercised by the selected F16/F17 path.
