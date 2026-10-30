# Operator CLI scratch lifetime

The operator CLI must retain its temporary Git checkout until its asynchronous operation settles, then remove it. This bounded #901 fix supports the full next-release scope in [#897](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/897); it does not establish campaign or release acceptance.

## Failure and correction

Hosted [run 39191913667, frontend job 117866513620](https://github.com/bagtyyarkovusov/auto.tm-rewrite/actions/runs/39191913667/job/117866513620) tested synthetic merge `9279725` of source `b7a41abaf9be11c9f41cc0343f2fd2262249cf6f` into main `9fde309c3da17f2661fe9c266504e6e56a1b97c9`. Its frontend workspace step passed all six tasks, including mobile 3770 and admin 330 tests. The subsequent root step had 408 passes, two failures and one skip. Both ordinary-profile CLI recovery guards received `ENOTEMPTY` and an unhandled `Coordination Git operation failed` instead of the expected `Known durable operation required for recovery` refusal. The aggregate check failed afterward; its log was not separately inspected.

`scripts/staging.mjs` returned the control promise without awaiting it inside `try/finally`. Cleanup could therefore remove the Git directory while recovery still used it. Source checkpoint `d975c062afde760826f3eac746cb578eb0d0b1c8` awaits all six affected direct operations: identity attestation, acquire, operate, recover, restore and release. Inspect and enqueue already awaited. No deletion retry, authority change, recovery mutation, timeout extension or admission bypass was added.

The isolated writer preserved reservation refs and pushed test-only RED `11b7ffc951eb3c3c604c050fac4968252faa9ec8`, then source GREEN `d975c062`. Root inspected both commits and fast-forwarded the identical tested tree from supplied base `48e4a33d4549a7d3c04c82ff508ed47059432805` without replaying or changing source. The fetched main above is an ancestor. This is the first recorded source repair for this cleanup-lifetime failure, distinct from earlier authority, render-wait and fixture-setup fixes.

## Verification and limits

| Criterion | RED | GREEN and exercised boundary |
| --- | --- | --- |
| Scratch survives until recovery refuses and is then removed | `11b7ffc9`: `node --test --test-name-pattern='scratch alive' scripts/staging.test.mjs`, two failures observing premature cleanup | `d975c062`: identical command, 2/2 pass. Actual executable CLI, StagingControl, GitLedger, Git and disposable bare remote; filesystem observer delegates to real mkdir/rm without sleeps. |
| Ordinary recovery refusal preserves the durable lease | Historical hosted failure above; new same-test RED retained | Exact refusal, unchanged read-back lease, completed cleanup and absence of Git/ENOTEMPTY failures asserted for both `listing-v1` and `campaign897-identities-v1`. |
| Existing admission and controller behavior | Existing suite retained | `pnpm test:staging-control`: 153/153 pass. Business-v2 closure and observe-only recovery remain. |
| Configured root suite | Initial fresh-worktree attempt failed importing missing contracts dist; retained as setup failure | After `pnpm --filter @auto-tm/contracts build`, smoke helper 6/6 and `pnpm test:root` 412 pass, one existing skip. No additional source repair or assertion change. |
| Syntax and documentation | No artificial RED required | Both changed scripts pass `node --check`; root documentation check and `git diff --check` pass. No configured root-script lint or TypeScript target exists. |

The writer ran these gates on `d975c062` using Node 24.13.0 and pnpm 12.11.2; the hosted failure used Node 22.23.3. Root inspected the actual diffs and result logs. Workspace-wide checks were not gratuitously repeated for this bounded script fix. Deterministic lifetime observation covers the actual recovery directory-creation boundary, not every provider operation. The remaining affected return sites were inspected and corrected; the wider staging suite checks their existing behavior.

## Independent affected reviews

Both reviewers inspected fixed SHA `d975c062afde760826f3eac746cb578eb0d0b1c8`, range `48e4a33d..d975c062`, in fresh read-only Codex contexts using OpenAI `gpt-6.1-sol` at high reasoning. Neither implemented the patch or reran its tests.

- Standards reviewer `/root/cli_lifetime_standards`: **PASS, no blocking findings.** The six awaits preserve the operation lifetime without a new interface or authority change. The executable CLI/Git regressions at `scripts/staging.test.mjs:106` satisfy interface/outcome and system-boundary rules: real filesystem delegation, retained refusal and completed-removal assertions, and durable read-back through GitLedger. No replacement application module or sleep. The reviewer inspected the actual focused diff, callers and retained RED/GREEN and broader logs.
- Spec reviewer `/root/cli_lifetime_spec`: **PASS, no blocking findings or unrequested behavior.** The criterion is that the scratch checkout survives until each asynchronous control operation settles, then is removed. The reviewer traced recovery through `StagingControl.recover`, `owned` and actual GitLedger initialization/read, confirmed all six awaited returns, and inspected the same-test failures/passes. Ordinary guards, business-v2 closure, unchanged durable state and observe-only recovery remain. The deterministic observation directly covers recovery for two profiles; the identical await/finally structure and existing wider tests cover the other return sites.

Root accepts both reports. There are no findings to assign to another fix round. Both reviewers explicitly leave hosted Node 22 verification and full native/deployed release acceptance pending; their bounded verdicts establish neither.

Raw/plain hosted logs and diagnosis are host-local under `/tmp/carberk-next-release-20261019/`. Writer handoff, patch and RED/GREEN/root logs are under `/tmp/carberk-cli-lifetime-20261019/`; these are recovery paths, not durable hosted acceptance URLs. Exact resulting-candidate hosted GREEN remains pending when this note is written. Native/deployed campaign acceptance, staging disposal/restoration, signed Android build and production readiness remain separate required gates. No live staging, production, store or external-delivery operation occurred in this fix.
