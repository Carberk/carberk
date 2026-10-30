# Staff grants and DB lifecycle observation, 2026-10-20

Root assembled this batch after [the completed `67733dbd` result](checkpoint-67733dbd-20261020.md). Main remains `9fde309c3da17f2661fe9c266504e6e56a1b97c9`. Hosted behavior for the new batch is pending. PR #904 stays draft with auto-merge off.

| Returned checkpoint | Root assembly | Scope and evidence |
| --- | --- | --- |
| `98cf72a9` | `90e222fe` | [V3 ordinary staff grants](../issue-901/full-v3-staff-grants-source-20261020.md): roster grant/revoke transitions, bounded owned audits and retained redaction. Application policy, full-v3 spec, worker helper, v1/v2, limits and operational gates remain unchanged. |
| `7ed43f0a` | `68b9b7f4` | [DB investigation](db-teardown-57p01-20261020.md): confirmed offline pool/socket lifetime gap; original hosted termination cause UNKNOWN. |
| `8e05164e` | `37af0acf` | Temporary lifecycle observation in the demo seed test. At most 100 sanitized lines. Node error monitors preserve the original error path; all existing awaits, assertions and teardown operations remain. Remove after diagnosis. |

Root inspected each diff, cherry-picked with `-x`, and confirmed the assembled executable files equal the returned checkpoints. The full-v3 acceptance spec, production worker helper and operational remote entry point are byte-identical to `67733dbd`. The configured `pnpm --filter @auto-tm/db typecheck`, script syntax, documentation and diff checks pass. An initial `@auto/db` filter matched no project and supplied no verification; the corrected configured package command above executed and passed.

Writer-local grant checks passed 153 staging-control tests plus source-compatibility checks. Writer-local trace checks exercised the actual observer with real pg/Prisma classes and a fake transport, confirming delayed close observation, preserved error propagation and the output bound. Root did not repeat those unchanged suites or run any local service-backed tests. These checks do not establish PostgreSQL trigger execution, HTTP grant success, a clean hosted DB lane or original-cause repair.

The next automatic hosted run must establish whether the unchanged main journey passes its grant assertion and reaches admission, and capture DB connection/stop ordering. A passing DB lane alone would not identify the earlier termination cause. Preserve the grant handoff's clock, exact-session and lock-order limitations for independent review. Admission, redemption, content and the broader owned graph remain incomplete.

The Opus medium implementer has a separate documentation-only task deriving full-roster and graph capacity from criteria. The 189-record minimum exceeds the current 128 cap; the proposed 269 cap remains unapproved and no capacity changed. The DB writer is terminal. Root owns one combined push and the PR watch; independent Sol 6.1 high Standards/Spec review is still pending for changes after `0fdf8836`.

All browser/native/deployed acceptance, restoration, exact signed Android artifact, matching disclosures and human-owned activation gates remain open. Denied staging credentials are not retried. Proxy quota access is unrelated to staging authorization. Founder approval remains required for protected merge, production promotion, spending, invitations and store submission.
