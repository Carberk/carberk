# Worktree cleanup — 2026-10-19

Local disk was nearly full, mostly from stale git worktrees (each with its own `node_modules`/build output).
Worktrees were removed only after their content was proven recoverable. Nothing was force-unlocked.

## Rules applied
1. **Clean + HEAD already on a remote branch** → removed (recover with `git worktree add <path> <branch-or-sha>`).
2. **Local-only commits / detached HEADs** → pushed to `archive/worktree-cleanup-20261019/*`, then removed.
3. **Dirty (tracked edits or untracked source)** → full snapshot commit (parent = the worktree HEAD) pushed to
   `archive/worktree-cleanup-20261019/dirty-*`, then removed. Snapshots exclude `node_modules`, secrets (`.env*`, keys, keystores, dumps)
   and files over 5 MB; any worktree that had such files was kept instead.
4. **Kept**: worktrees with a `git worktree lock` reason, commits under 48 h old, running processes, and ones holding
   unrecoverable ignored data (DB/media backups, production keystore, native build output).

## Restore
```sh
git fetch origin 'refs/heads/archive/*:refs/remotes/origin/archive/*'
git worktree add ../restored origin/archive/worktree-cleanup-20261019/<name>
```
A `dirty-*` branch tip holds the uncommitted state; its parent is the original HEAD. `git diff HEAD~1` shows only the WIP.

## Archive branches (74)
Pushed unique commits: 24 · dirty snapshots: 50

- [`agent-batch-5-sell-photos`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/agent-batch-5-sell-photos)
- [`agent-issue-471`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/agent-issue-471)
- [`agent-issue-472`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/agent-issue-472)
- [`agent-issue-506`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/agent-issue-506)
- [`agent-issue-535`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/agent-issue-535)
- [`agent-issue-536`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/agent-issue-536)
- [`agent-issue-718`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/agent-issue-718)
- [`agent-issue-758`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/agent-issue-758)
- [`agent-issue-841`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/agent-issue-841)
- [`codex-reviewer-native-integration-20261003`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/codex-reviewer-native-integration-20261003)
- [`detached-23b9e892e`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/detached-23b9e892e)
- [`detached-4a844e10c`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/detached-4a844e10c)
- [`detached-4f3dd3366`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/detached-4f3dd3366)
- [`detached-631495535`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/detached-631495535)
- [`detached-83d1b6094`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/detached-83d1b6094)
- [`detached-8f5203843`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/detached-8f5203843)
- [`detached-92b867b7d`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/detached-92b867b7d)
- [`detached-afa339d3c`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/detached-afa339d3c)
- [`detached-b9449a7db`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/detached-b9449a7db)
- [`detached-c79c1a409`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/detached-c79c1a409)
- [`detached-d5fbb6888`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/detached-d5fbb6888)
- [`dirty-agent-a10f63ade7a876f8d-detached-d47c5a03-d47c5a0`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a10f63ade7a876f8d-detached-d47c5a03-d47c5a0)
- [`dirty-agent-a12b19beb7148b9f1-detached-13e0429d-13e0429`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a12b19beb7148b9f1-detached-13e0429d-13e0429)
- [`dirty-agent-a1dba7895a7a21db4-detached-0a0fd35e-0a0fd35`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a1dba7895a7a21db4-detached-0a0fd35e-0a0fd35)
- [`dirty-agent-a239ef1cb823a258f-agent-issue-504-3309977`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a239ef1cb823a258f-agent-issue-504-3309977)
- [`dirty-agent-a33f7c7ef4d1843a6-detached-18229b8a-18229b8`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a33f7c7ef4d1843a6-detached-18229b8a-18229b8)
- [`dirty-agent-a4448f370b799346e-detached-8009b3c5-8009b3c`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a4448f370b799346e-detached-8009b3c5-8009b3c)
- [`dirty-agent-a4b52a8a71e34261f-detached-143947fa-143947f`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a4b52a8a71e34261f-detached-143947fa-143947f)
- [`dirty-agent-a558338d297a15128-detached-ca80979a-ca80979`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a558338d297a15128-detached-ca80979a-ca80979)
- [`dirty-agent-a582adab835d77627-detached-4ebac694-4ebac69`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a582adab835d77627-detached-4ebac694-4ebac69)
- [`dirty-agent-a5a9309ed457c457e-detached-9c2f1f5b-9c2f1f5`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a5a9309ed457c457e-detached-9c2f1f5b-9c2f1f5)
- [`dirty-agent-a5dd9bcf564dd6eb2-detached-e58f4218-e58f421`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a5dd9bcf564dd6eb2-detached-e58f4218-e58f421)
- [`dirty-agent-a62ec5e8ba14f8867-detached-e2e81d76-e2e81d7`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a62ec5e8ba14f8867-detached-e2e81d76-e2e81d7)
- [`dirty-agent-a6f7e9c7c3af920ea-detached-8402d60c-8402d60`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a6f7e9c7c3af920ea-detached-8402d60c-8402d60)
- [`dirty-agent-a7698a472271f4ccf-detached-214bc9c6-214bc9c`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a7698a472271f4ccf-detached-214bc9c6-214bc9c)
- [`dirty-agent-a7d0e5586d2a9e141-agent-issue-455-4b6e064`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a7d0e5586d2a9e141-agent-issue-455-4b6e064)
- [`dirty-agent-a8ff37191e1b8ffe8-agent-issue-502-3309977`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a8ff37191e1b8ffe8-agent-issue-502-3309977)
- [`dirty-agent-a913f09f863ee6106-detached-36d28919-36d2891`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-a913f09f863ee6106-detached-36d28919-36d2891)
- [`dirty-agent-aab5f77fbf1b65d71-detached-eaa1b20b-eaa1b20`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-aab5f77fbf1b65d71-detached-eaa1b20b-eaa1b20)
- [`dirty-agent-abcd768684f28d271-agent-issue-695-e729eae`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-abcd768684f28d271-agent-issue-695-e729eae)
- [`dirty-agent-abef30b15bd65c126-agent-issue-518-31574b5`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-abef30b15bd65c126-agent-issue-518-31574b5)
- [`dirty-agent-ac64aef5e96fdb822-agent-issue-503-22784d9`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-ac64aef5e96fdb822-agent-issue-503-22784d9)
- [`dirty-agent-ad76e300b01b6c000-detached-e58f4218-e58f421`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-ad76e300b01b6c000-detached-e58f4218-e58f421)
- [`dirty-agent-ae216f000e1f05805-reconcile-353-93ee62b`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-ae216f000e1f05805-reconcile-353-93ee62b)
- [`dirty-agent-af4002918b20dde44-agent-issue-640-42021e2`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-af4002918b20dde44-agent-issue-640-42021e2)
- [`dirty-agent-af71f31ef7a5331cc-detached-0a0fd35e-0a0fd35`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-af71f31ef7a5331cc-detached-0a0fd35e-0a0fd35)
- [`dirty-agent-af97872a70f909094-agent-issue-368-c8417be`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-af97872a70f909094-agent-issue-368-c8417be)
- [`dirty-agent-afafe0831fec67ea3-prototype-sell-wizard-3309977`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-afafe0831fec67ea3-prototype-sell-wizard-3309977)
- [`dirty-agent-afcac7fbc05f5f657-agent-issue-377-4018122`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-agent-afcac7fbc05f5f657-agent-issue-377-4018122)
- [`dirty-auto.tm-rewrite-detached-a64e60a0-a64e60a`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-auto.tm-rewrite-detached-a64e60a0-a64e60a)
- [`dirty-autotm-368-fix-0930a-detached-763af228-763af22`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-autotm-368-fix-0930a-detached-763af228-763af22)
- [`dirty-autotm-ui717-20261007-agent-issue-717-917b0e4`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-autotm-ui717-20261007-agent-issue-717-917b0e4)
- [`dirty-carberk-866-native-20261014-detached-b33aaa18-b33aaa1`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-carberk-866-native-20261014-detached-b33aaa18-b33aaa1)
- [`dirty-carberk-founder-ios-20261014-detached-2e1bcb97-2e1bcb9`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-carberk-founder-ios-20261014-detached-2e1bcb97-2e1bcb9)
- [`dirty-carberk-workflow-docs-20261014-writer-73-detached-2e1bcb97-2e1bcb9`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-carberk-workflow-docs-20261014-writer-73-detached-2e1bcb97-2e1bcb9)
- [`dirty-codex-848-compact-login-20261013-detached-d03c8811-d03c881`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-codex-848-compact-login-20261013-detached-d03c8811-d03c881)
- [`dirty-codex-launch-polish-agent-issue-833-07178be`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-codex-launch-polish-agent-issue-833-07178be)
- [`dirty-codex-webp-media-agent-issue-823-3ca4ed8`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-codex-webp-media-agent-issue-823-3ca4ed8)
- [`dirty-evidence-572-detached-ed436a2e-ed436a2`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-evidence-572-detached-ed436a2e-ed436a2)
- [`dirty-issue-712-agent-issue-712-36aebd0`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-issue-712-agent-issue-712-36aebd0)
- [`dirty-kimi-issue-542-agent-issue-542-ba9ed9c`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-kimi-issue-542-agent-issue-542-ba9ed9c)
- [`dirty-kimi-issue-593-agent-issue-593-ce26bd2`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-kimi-issue-593-agent-issue-593-ce26bd2)
- [`dirty-kimi-pr660-spec-detached-3d80370a-3d80370`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-kimi-pr660-spec-detached-3d80370a-3d80370)
- [`dirty-orchestration-handoff-7ce258-claude-orchestration-handoff-7ce258-5264344`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-orchestration-handoff-7ce258-claude-orchestration-handoff-7ce258-5264344)
- [`dirty-orchestration-handoff-prototypes-7daa9e-claude-review-session-d8a31d-664cfc3`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-orchestration-handoff-prototypes-7daa9e-claude-review-session-d8a31d-664cfc3)
- [`dirty-pr-558-screenshots-027f3b-detached-012993e7-012993e`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-pr-558-screenshots-027f3b-detached-012993e7-012993e)
- [`dirty-pr555-screens-detached-b6e9f00c-b6e9f00`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-pr555-screens-detached-b6e9f00c-b6e9f00)
- [`dirty-root-823-proof-detached-c56ac5ae-c56ac5a`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-root-823-proof-detached-c56ac5ae-c56ac5a)
- [`dirty-root-rc-204-release-2.0.4-rc-96f088f`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-root-rc-204-release-2.0.4-rc-96f088f)
- [`dirty-t3code-5366f6a7-detached-faf1c253-faf1c25`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-t3code-5366f6a7-detached-faf1c253-faf1c25)
- [`dirty-t3code-6e9fa951-shape-dealer-showroom-diagnostics-cf452fd`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/dirty-t3code-6e9fa951-shape-dealer-showroom-diagnostics-cf452fd)
- [`docs-play-store-screenshots`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/docs-play-store-screenshots)
- [`evidence-release-emulator-pass-2`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/evidence-release-emulator-pass-2)
- [`fix-chat-date-separator-vin-clear`](https://github.com/bagtyyarkovusov/auto.tm-rewrite/tree/archive/worktree-cleanup-20261019/fix-chat-date-separator-vin-clear)

## Once confident, delete the archive branches
```sh
git push origin --delete $(git ls-remote origin 'refs/heads/archive/worktree-cleanup-20261019/*' | sed 's#.*refs/heads/##')
```
