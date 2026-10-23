# Safe replacement scheduling timeout attribution, 2026-10-23

Checkpoint: `f1286808ddd4965cd72f7548841d23a3658b60a0` (tree `28f3af32fa6b90a2808ffe5c7939de0d5e3f1b0d`), branch `agent/issue-914-scheduling-test-cost-20261023`. Parent PR remains #904.

The scheduling spec now registers Vitest 5.0.4 `onTestFailed`. The hook runs after Vitest marks a 5,000ms test timeout and emits one bounded stderr record per failed locale. Records have a fixed field count and contain only locale, numeric elapsed fields, fixed phase names, and capped completed-phase durations; they contain no IDs, PDF bytes, or personal data. No timers, background work, retries, timeout changes, concurrency changes, or product edits were added.

A transport probe replaced the maintenance await with an unresolved promise while retaining the 5,000ms budget. It proved the hook survives timeout and identifies the active phase:

```text
[safe-replacement-phase] {"locale":"tk","elapsedMs":5008.1,"lastPhase":"maintenance","lastPhaseElapsedMs":4860,"completedMs":{"fixture-fonts":1.8,"issued-generation":58.2,"issued-read-parse":4,"backlog-erasure":0.3,"pending-locales":84}}
[safe-replacement-phase] {"locale":"ru","elapsedMs":5000.9,"lastPhase":"maintenance","lastPhaseElapsedMs":4821.3,"completedMs":{"fixture-fonts":0.7,"issued-generation":85.1,"issued-read-parse":4.6,"backlog-erasure":0.2,"pending-locales":89}}
[safe-replacement-phase] {"locale":"en","elapsedMs":5001.4,"lastPhase":"maintenance","lastPhaseElapsedMs":4893.7,"completedMs":{"fixture-fonts":0.2,"issued-generation":39.9,"issued-read-parse":1.4,"backlog-erasure":0.2,"pending-locales":65.9}}
```

The transport probe log SHA-256 is `519e5ad78d8be87b833e07a041f6d6ffe755e96753b1c82994465cb73c842531`.

Final verification after restoring the real maintenance call:

- Focused scheduling, erasure, renderer and purge tests: **24 passed**; log `e982d73ec91dbc5562d034510e3b6cec219962b12e413fccc4a96ab9fbb4cc40`.
- Worker lint: **pass**; log `960f1eb37ac4d28430af9bef2c98f32333254854ffde619330f53d373ce0f632`.
- Worker typecheck: **pass**; log `8366207267355d3e3d5bf3bf6e8c94c5f93f6078c34f08973fa2b38cdda6cc92`.
- Baseline worker behavioral RED: all three locale cases failed with `pending` instead of `ready`; log `37306c48181efcf17209751477222ad903aa64292d11c9f9e48f17414110a46e`.
- Offline repository unit gate: **10/10 tasks passed**, including worker **297 tests**; log `56a84185d73a60ca4d704468c00d73f003fd3f563f0cf64228e990e2552a1c61`.
- An earlier separate root native-session run had one occupied-port failure; that result is superseded by the later complete 10/10 offline gate and is retained only as historical evidence.

Hosted timeout attribution remains **UNKNOWN** pending the next hosted run with this diagnostic hook. The original hosted log SHA-256 is `2628b84aa0b789847d20a9d066a3c117ef8d591c2f0f3398deaafcb2a29db763`.
