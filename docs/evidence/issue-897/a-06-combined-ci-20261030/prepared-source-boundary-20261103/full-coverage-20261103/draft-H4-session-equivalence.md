# Draft issue: [A verification decision] Preserve Session-expiry semantics for diagnostic readers

Owner and tracking

Program Parent creates and owns the GitHub Issue. The existing A coordinator is issue-update owner after creation and sole assembler/resource owner. Existing executor/worktree remains preserved but held. No issue exists from this draft.

Immutable base and evidence

Read from source input `d131c6003e6fdb4dd3df7b9acad0da529f121820`, stop checkpoint `4b869f12829f59b18361bd37ba3cc5dc675cc879` / tree `bc40df98d6a5e081dc927be2696e3706f594694c`, and coordinator receipt `54e18b140b446a52749264435106922245f1b554`. Inventory SHA-256: `324669d09c6d66115a703c300ead0c673eca4974b73493c45d7f6821fb86c5d3`.

Decision scope and exact cases

F09, F22, F38 and P08 map to SESSION_EXPIRY_EQUIVALENCE. The original oracles name Session expiry; the only current lawful adapter identified is Session revocation. Replacing expiry with revocation changes the behavior under test.

Phase A is a Parent decision backed by read-only source/criteria inspection. Recommendation: retain literal expiry and, if approved, extend the helper with predeclared Session deadlines plus an injected case clock. Do not substitute revocation without an explicit equivalence ruling.

Allowed implementation paths after disposition

Only the four e2e replacement files and `apps/api/test/helpers/diagnosticPreparedReaderFixture.ts`, plus the named evidence prefix and owned `/tmp`. No production module, migration, SQL guard, config, dependency, selector, timeout or original memory suite change. Runtime resources remain held until exact identity/slot/resource reservations are recorded.

Commands and evidence

Record the Parent decision, four-ID one-for-one assertion map and exact source/criteria citations. If implementation is approved, run API typecheck, TS6, lint, build and diff check, then a fresh exact-SHA #924/#934 pair and probe/full 224 selector with maxWorkers=1 and complete cleanup. Preserve focused evidence and original literal outcomes.

Pass/fail gate

PASS requires literal Session-expiry scenarios to execute lawfully and distinguish expiry from revocation. A refusal or equivalence mismatch is a stop, not a rewritten oracle. No #938/A acceptance is implied.
