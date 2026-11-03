# Issue 938 blocked-case disposition, 2026-11-03

Input coordinator `54e18b140b446a52749264435106922245f1b554`, executor `4b869f12829f59b18361bd37ba3cc5dc675cc879` / tree `bc40df98d6a5e081dc927be2696e3706f594694c`; source input `d131c6003e6fdb4dd3df7b9acad0da529f121820`. Inventory SHA-256 `324669d09c6d66115a703c300ead0c673eca4974b73493c45d7f6821fb86c5d3`.

No blocked case is executable under the current resource-identity-only contract. H1/H2 can retain the existing #938 paths only after Parent creates and releases separate bounded issue contracts. H3 needs a separate production/test-boundary issue. H4 needs explicit Parent equivalence disposition before any issue.

| Group | Cases | Missing contract | Recommendation |
|---|---:|---|---|
| `H1_CLOCK_RIGHTS` | 10 (F11, F16, F17, F20, F27, F33, F39, F44, F46, P06) | CLOCK, RIGHTS, REVIEWER_QUALIFICATION, LATER_ARRIVAL_FENCE | Add explicit case clock/deadline inputs, independent predeclared per-visit rights and qualification deadlines, and lawful later-arrival timestamps in the existing helper/e2e paths. Preserve literal Session-expiry, privacy, guard and cleanup oracles. No production edits. |
| `H2_ACTOR_GRAPH` | 7 (F04, F05, F06, F10, F23, F40, F41) | BUSINESS_GRAPH, STAFF_MANAGE_ACTOR, ADMIN_ACTOR | Provision ordinary Business graph, staff.manage/founder.control and admin actors through bounded test setup with explicit restricted-role grants. Preserve production routes and all original actor-loss assertions. No production edits. |
| `H3_PRODUCTION_BOUNDARY` | 7 (F08, F14, F15, F30, F37, F43, F45) | SHARED_PRIVATE_COMMISSIONER, ISOLATED_REPORT_ERASURE, RAW_IMMUTABLE, EVIDENCE_GUARD, NULL_DISPLAY_NAME | Do not fake or weaken these states. Parent must either authorize a production-supported path/new bounded test boundary or explicitly leave these cases open. Any implementation needs a separate issue and fresh exact-SHA review. |
| `H4_PARENT_EQUIVALENCE` | 4 (F09, F22, F38, P08) | SESSION_EXPIRY_EQUIVALENCE | Decide whether lawful Session revocation can stand for the literal Session-expiry scenarios. Recommendation: preserve literal expiry and release explicit predeclared Session deadlines plus clock in H1; do not substitute revocation silently. |

## Case-level matrix

| ID | Classification | Exact missing dependency | Current #938 path usable only after new contract? |
|---|---|---|---|
| `F04` | `H2_ACTOR_GRAPH` | BUSINESS_GRAPH | yes |
| `F05` | `H2_ACTOR_GRAPH` | BUSINESS_GRAPH | yes |
| `F06` | `H2_ACTOR_GRAPH` | BUSINESS_GRAPH | yes |
| `F08` | `H3_PRODUCTION_BOUNDARY` | SHARED_PRIVATE_COMMISSIONER, ISOLATED_REPORT_ERASURE | no |
| `F09` | `H4_PARENT_EQUIVALENCE` | SESSION_EXPIRY_EQUIVALENCE | no |
| `F10` | `H2_ACTOR_GRAPH` | STAFF_MANAGE_ACTOR | yes |
| `F11` | `H1_CLOCK_RIGHTS` | REVIEWER_QUALIFICATION, CLOCK | yes |
| `F14` | `H3_PRODUCTION_BOUNDARY` | SHARED_PRIVATE_COMMISSIONER | no |
| `F15` | `H3_PRODUCTION_BOUNDARY` | RAW_IMMUTABLE, SHARED_PRIVATE_COMMISSIONER | no |
| `F16` | `H1_CLOCK_RIGHTS` | RIGHTS, CLOCK | yes |
| `F17` | `H1_CLOCK_RIGHTS` | RIGHTS, CLOCK | yes |
| `F20` | `H1_CLOCK_RIGHTS` | RIGHTS, CLOCK | yes |
| `F22` | `H4_PARENT_EQUIVALENCE` | SESSION_EXPIRY_EQUIVALENCE | no |
| `F23` | `H2_ACTOR_GRAPH` | STAFF_MANAGE_ACTOR | yes |
| `F27` | `H1_CLOCK_RIGHTS` | CLOCK | yes |
| `F30` | `H3_PRODUCTION_BOUNDARY` | SHARED_PRIVATE_COMMISSIONER | no |
| `F33` | `H1_CLOCK_RIGHTS` | CLOCK | yes |
| `F37` | `H3_PRODUCTION_BOUNDARY` | RIGHTS, CLOCK, RAW_IMMUTABLE | no |
| `F38` | `H4_PARENT_EQUIVALENCE` | SESSION_EXPIRY_EQUIVALENCE | no |
| `F39` | `H1_CLOCK_RIGHTS` | LATER_ARRIVAL_FENCE, RIGHTS, CLOCK | yes |
| `F40` | `H2_ACTOR_GRAPH` | STAFF_MANAGE_ACTOR | yes |
| `F41` | `H2_ACTOR_GRAPH` | ADMIN_ACTOR | yes |
| `F43` | `H3_PRODUCTION_BOUNDARY` | NULL_DISPLAY_NAME | no |
| `F44` | `H1_CLOCK_RIGHTS` | CLOCK | yes |
| `F45` | `H3_PRODUCTION_BOUNDARY` | EVIDENCE_GUARD, RAW_IMMUTABLE, RIGHTS, CLOCK | no |
| `F46` | `H1_CLOCK_RIGHTS` | RIGHTS, CLOCK | yes |
| `P06` | `H1_CLOCK_RIGHTS` | REVIEWER_QUALIFICATION, CLOCK | yes |
| `P08` | `H4_PARENT_EQUIVALENCE` | SESSION_EXPIRY_EQUIVALENCE | no |

## Draft-contract recommendation

Parent should review the exact draft bodies below. They are not live GitHub issues and grant no implementation authority:

- `draft-H1-clock-rights.md`: helper-only clock, per-visit rights/qualification and later-arrival inputs for ten cases.
- `draft-H2-actor-graph.md`: Business graph and staff/admin actor provisioning for seven cases.
- `draft-H3-production-boundary.md`: separate production/test-boundary decision for seven cases.
- `draft-H4-session-equivalence.md`: Parent-only equivalence decision for four cases.

No source, runtime, package or issue creation occurred.
