# Erased predecessor current readers — bounded writer

Base `b7411ba51ae4a5a77f3b5d1fb87cb388bf08499d`, tree `15476ec5116bf44d992850be0805f5d440f1bab0`; branch `agent/issue-914-erased-predecessor-readers-20261023`; host worktree `/Users/bagtyyar/.t3/worktrees/carberk/t3-e6278560` (scaffold `t3/e6278560` remains at base). Sole source writer for #914/#897, parent integrates through draft PR904. No child tasks or issue PR.

## RED checkpoint

Seams authorized by the task: real public report/document adapters and real artifact worker/renderer, database and exact-object storage boundary fakes only. Database fake implements CRUD/filter/CAS, not privacy rules, erasure SQL or transaction/lock semantics. PDF assertions extract real embedded-font PDF text using `pdftotext`. These are offline behavioral regressions, not hosted SQL/storage acceptance.

Logs `/tmp/issue-914-erased-readers-20261023/`:

- `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/api exec vitest run src/modules/diagnostics/infrastructure/ErasedPredecessorReaders.spec.ts` → two genuine failures (`api-red.log`): public JSON `successorOf` retains A; held storage read resolves with A-bearing bytes instead of rejecting.
- `AUTO_TM_TEST_DATABASES=off pnpm --filter @auto-tm/worker exec vitest run src/jobs/diagnostics/ErasedPredecessorArtifacts.spec.ts` → two genuine failures (`worker-red.log`): TK/RU/EN actual PDF text retains A, EN retains original artifact identity, and held PUT is adopted ready after A erasure.

An initial API import-path setup failure was corrected before the genuine RED run; it is not behavioral evidence. Configured contracts and DB builds (including Prisma generation) used `DATABASE_URL=postgresql://test:test@127.0.0.1:1/test`; no local service was opened.

The supplied hosted RED run39897093363/API120229988882 remains acceptance evidence, never GREEN. Current public transfer file and all protected full-v3 test bodies/assertions/budgets will remain unchanged. Exact retry receipts and previously issued EN row/bytes are explicitly immutable in the protected suite; current readers must fence rather than rewrite that historical receipt. No blanket retention or cleanup policy is introduced.

Implementation and GREEN evidence pending. Parent owns normal hosted HTTP/SQL/storage acceptance, independent Standards/Spec reviews and release gates. Public automatic admission and Support/media reset defects remain outside this task.
