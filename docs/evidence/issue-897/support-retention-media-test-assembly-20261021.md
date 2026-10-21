# Support retention and media test assembly, 2026-10-21

Root assembled from published `1160d80f378cc65e33954a246b22877e212dd1f6`. The [exact hosted receipt](checkpoint-1160d80f-20261021.md) establishes 28/30 full-v3 cases passing, including ordinary media disposal and Support closure/reopening. Reinspection remains RED at 404. Both added media races stopped before seed on a PostgreSQL result type unsupported by Prisma; their product assertions remain UNKNOWN.

| Writer checkpoint | Root commit | Scope |
|---|---|---|
| `7528280944049f75c338db296b41bcbac80aaf51` | `2f12bab2` | One additive Support retention worker-time case and its literal accounting |
| `4494bd45e5caca8597ff8fa01b078a54c5b5af8e` | `7418882e` | Cast the media setup query's regclass result to text, preserving its exact NULL assertion |

Both writers used the exact published base, returned clean pushed checkpoints and are terminal. Root inspected their complete diffs and cherry-picked serially with `-x`. Held selection note `3ed80950` is included. No production source, schema, caps, timeouts, concurrency, authentication or operational gates changed.

The [retention case](../issue-901/full-v3-support-retention-test-20261021.md) uses ordinary coordinator/support/customer sessions, TOTP, grant, case creation, assignment, reply and resolved closure. It calls the real worker at the stored primary `closedAt + 90 days - 1ms` and inclusive deadline, while preserving an ordinarily reopened foreign case. It asserts rollback on a refused purge, exact journal/disposal accounting, retained redacted audits, erasure-fence disposal before its Restrict-FK conversation, lost-response reset retry, terminal stability and no worker resurrection. Primary predictions remain 65/82 to 67/99 to 67/161 records/events; foreign 68/87 to 68/155. Caps remain 128/2048.

The predicted first retention RED is `Unsupported campaign service` on the worker's erasedAt/epoch UPDATE. A setup, count, import, transport or bucket failure is not that behavioral RED. No retention source is authorized before the hosted run reaches its new assertion. This is isolated worker time and reopened-foreign exclusion; future HTTP/auth clocks, general worker isolation, selected-worker concurrency, successful 14-day closure, account deletion and private-byte erasure remain unfinished.

The [media correction](../issue-901/full-v3-media-runtime-races-test-20261021.md#regclass-serialization-prerequisite-2026-10-21) changes only `to_regclass(...)::text`. Neither media race has reached seed in hosted evidence. The existing stream barrier proves SDK body consumption, not that the provider evaluated If-Match before reset. Stronger admitted-write ordering and personal/video proof remain UNKNOWN.

Combined offline verification passed: API TypeScript 7, focused lint with zero warnings, agent-document links/headings/routes, and diff checks. Exact full-file comparison removes only the 167-line retention insertion and the six-character cast, then matches every byte of the published spec. All existing 30 intended cases and helpers are preserved; the new suite has 31 intended cases. Both writers separately passed TypeScript 6 and their syntax/preservation checks; the retention writer also checked static collection and its embedded worker without execution. No local service tests, Docker, CI reruns or CI waiting ran. Root did not repeat unchanged staging boundary tests.

[Recovered Play/EAS facts](play-signing-metadata-recovery-20261021.md) are dated historical provider observations. They do not establish live Play codes, signing certificates, present signing capability or an artifact for this candidate. Final independent review, native/browser/deployed/ops acceptance and latest-main restoration remain open. Refused scoped Railway authority was not retried or bypassed. Reinspection D2/D3, diagnostics bootstrap/qualification and broader graph/capacity decisions remain unresolved. Operational v3 entry points remain closed, and no merge, production or store approval is inferred.

Root publishes this as one batch with the test checkpoints and held evidence. The final pushed SHA and tree are recorded in #897, #901's execution comment and #904. Hosted results for the new SHA start UNKNOWN; the 1160 receipt certifies only its own named assertions.
