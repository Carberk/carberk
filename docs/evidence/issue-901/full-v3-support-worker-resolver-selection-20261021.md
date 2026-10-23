# Selected Support worker ownership resolver, 2026-10-21

Root disposition of the [source decision](full-v3-support-retention-source-decision-20261021.md), after the [reached hosted retention RED](../issue-897/checkpoint-232a66c3-20261021.md). This selects an internal implementation boundary for the existing #901 exact-owned graph requirement. It changes no product audience, retention schedule, record/event cap, schema, History partition or operational authority. No source GREEN or review approval is claimed.

Use a server-owned resolver over the existing namespace-local exact journal keys. Do not add an application ownership column, global directory, caller-selected namespace or principal/session impersonation. The journal remains durable ownership after case identity fields are cleared and after worker restart.

## Classification and admission

- Discover only fixed-grammar `cf_[a-f0-9]{32}` namespaces through PostgreSQL catalogs. Query exact resource keys in their protected `campaign_records`; never infer ownership from synthetic mode, an actor, timestamp, object prefix or a remembered process map. Derive SQL identifiers only from the validated catalog grammar and bind all resource values as parameters.
- Resolve the case/conversation/fence relationship to exactly one claim. Existing deleted journal keys and disposed namespaces remain claims; they cannot make a surviving or stale resource ordinary. Reject competing, partial, corrupt, incompatible or unverifiable claims. Failure to inspect a possible namespace must fail closed, never become an empty-result ordinary fallback. With no claim and no unresolved namespace inspection, preserve ordinary noncampaign behavior.
- Unlocked discovery supplies only a candidate identity. Before case/conversation row locks, acquire the relevant affected table locks in reset-compatible order, then its derived namespace fence. Rediscover and revalidate ownership after those locks. No authoritative cache may survive this reread. Current full serving candidate must match the manifest, full-v3 version/lifecycle must be supported, and schema/contract/record/event hashes and exact OLD row hashes must agree. Stale/disposed/deleted work performs no mutation or storage I/O; malformed or ambiguous authority refuses visibly.
- Prove that the owned resource is a due closed synthetic text Support graph with no foreign inbound/outbound references, attachments, subscriptions or unclassified children. A reopened case is not due. A missing resource after reset is not adopted or recreated. Ownership checks cover keys whose nullable identity linkage is already erased.

## Purge and cleanup

The worker boundary surrounds the existing transaction, preserving case-before-conversation row locking, rechecks, ordinary policy and existing timeouts. Admit only the exact lifecycle transitions listed in the source decision. An ambient setting alone is not authority; each trigger exception must validate the resource, current candidate, exact owned state and permitted OLD/NEW transition under the selected boundary.

Restarted cleanup resolves the exact fence through the same durable conversation/fence journal keys. It reacquires reset-compatible table/namespace authority, rereads epoch/manifest/current hashes and permits only the completed-empty text manifest. Call the real `S3RetiredObjectStore.deleteAndVerify([])` under that serialization, including its versioning inspection, then conditionally complete that exact owned fence. Do not change the store or skip storage checks. If the existing transaction bound prevents completion, preserve the failure and report it rather than widening timeouts.

Track the fence by `{conversationId}` across journal, integrity, foreign-reference checks, inventory and reset. Exact reset requires completed-empty proof and removes the dependent fence before its Restrict-FK conversation. Retained redacted service audits, journal keys, tombstones and lost-response retry neutrality remain required. V1/v2 generated SQL and receipts remain byte-identical.

## Implementation and evidence boundary

The existing source writer owns this implementation; the media writer alone owns the joined acceptance spec. The unchanged retention test remains the same-test GREEN target, with its literal accounting unchanged. Add focused worker/resource-boundary tests for stale candidate, ambiguous/uninspectable ownership, erased-linkage restart resolution, disposed/stale work and storage refusal before authority. Use only external DB/storage/time boundaries, not mocks of repository modules or guard-string-only claims. Source must preserve classification refusals even when the positive passes.

The existing retention positive does not prove foreign due-case isolation or selected-worker/reset/reopen races. Those require additive hosted tests after the resource boundary exists and before operational entry opens. Text-only authority does not grant attachment, History, global synthetic cleanup, push or production activation. A resolver requiring a new schema/directory/partition, unbounded authority fallback or changed product policy returns to root as a materially different design.
