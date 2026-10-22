# Consumed private-link erasure test assembly

Root inspected corrected writer `2945e787652c6c5197d58f37b75f0ca38362f692`, tree `4f0d4a757d45167afd704fd9e1c025bc3748b43e`, based on published `18eba80587af2190a443e3aa522f24b12a64b2d9`. Incoming held746eb59f was not accepted directly. The corrected three commits were incorporated as9c521cb5,7e31f10d,64416958. Before this receipt, Root's complete tree matched the corrected writer exactly.

Only the fresh `DiagnosticConsumedPrivateLinkErasure.e2e.spec.ts` and its [writer evidence](../issue-914/consumed-worker-erasure-test-20261022.md) change executable acceptance inputs. Production, contracts, schema, configuration and existing acceptance remain unchanged. Root inspected the worker's exact retirement/deletion behavior, current proof/retry authority, HTTP setup, expected responses, per-pool harness, full-table manifest, closed loopback server, isolated child imports, clock restoration and request-registered teardown. The manifest checks every row in six worker-owned tables before cleanup. It relies on the existing exclusive disposable Vitest pool and does not claim a database lock against arbitrary external writers.

The test issues and consumes a same-private-commissioner proof through ordinary HTTP, declares A's material expiry, proves immediate access refusal at expiry, and then runs the real cleanup worker once. It requires exact A object deletion, B rows/bytes/retry/finding survival and unchanged independently retained raw histories, reports and PDF intents. Teardown exact-key deletion occurs after worker assertions and cannot establish worker success. No account purge substitutes for A-specific expiry.

Root combined checks passed:

- `pnpm test:unit`, 10/10 Turbo tasks, all cached from identical writer inputs. Root agent-GitHub/native-session checks executed. Writer freshly executed API2434 pass/two existing skips; cache replay is not another execution.
- `pnpm typecheck`, 11/11 tasks, all cached. Direct API `tsc6 --noEmit` and focused ESLint with zero warnings freshly executed and passed.
- Import-based Vitest collection with `--staticParse=false`, no setup/global hooks or services, lists exactly101 cases: original99 comparative, one automatic, one new erasure. No runtime test body ran.
- Agent docs8/8, runtime import gate, glossary31 terms and diff check passed. Root's prior full root597pass/one existing skip remains applicable because root-check inputs did not change. Writer's direct build, TS7 and other checks are recorded separately in its evidence.
- Full incoming tree equality and six protected-file byte comparisons against18eba805 passed. These cover comparative, automatic, both CampaignFullV3 suites, reserved fixture and interrupted Redis acceptance.

Logs/config are `/tmp/carberk-resume-20261021/erasure-assembly-*`. No dependency or external API changed. Overview ownership/limitations remain accurate; the context map needs no change. Documentation uses the docs-only RED exemption.

Runtime for the new case is UNKNOWN until hosted execution. [Predecessor18eba805](hosted-receipt-18eba805-20261022.md) proves automatic1/1, comparative99/99, worker373 and DB392, with only three protected reset tails failing. This assembly adds acceptance coverage; it does not claim release GREEN.

Next bounded assignment is a fresh HTTP test for both manual/VIN directions under ADR-0108. Capture reached proof-issuance RED before source changes; supported corrections and public transfer remain subsequent required work. Full green CI, independent fixed-SHA review, native/deployed acceptance, staging restoration and the signed Android artifact remain release gates. Three scoped Railway refusals remain terminal. No reset, deployment, local services, merge, promotion, submission or launch occurred.
