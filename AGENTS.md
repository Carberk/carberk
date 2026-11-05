# Carberk agent instructions

Carberk is the public product name. AutoTM identifiers, packages and domains remain. Use pnpm workspaces; configuration owns commands and versions.

Read the request and acceptance criteria, then [CONTEXT-MAP.md](CONTEXT-MAP.md), the owning overview, source and tests. Source, types, tests, and runtime evidence establish current behavior; the issue establishes the delivery slice. Use the [glossary](docs/domain/GLOSSARY.md) for terms, the [ADR index](docs/adr/README.md) for durable decisions, and task-scoped guides for specialized work. Read the roadmap only for scheduling.

Every change follows the [delivery workflow](docs/agents/coding-workflow.md): one issue, one small PR from current `main`, reviewed by `sol-loop` and merged only on "full send" or founder approval ([ADR-0108](docs/adr/0108-small-prs-with-full-send-replace-integration-delivery.md)). The [environment guide](docs/agents/environment.md) says what exists (local Docker, simulators, CI, GitHub, Railway, EAS) and what you may change without asking. Repository skills live only in [.claude/skills](.claude/skills); `.agents/skills` is a symlink to it for Codex. Open linked skills manually when the host cannot discover them.

| When changing | Read before editing |
|---|---|
| Domain logic, ownership or documentation | [Domain guidance](docs/agents/domain.md) |
| New or changed modules, behavior or tests; Standards review | [Coding standards](docs/agents/coding-standards.md) |
| External dependency or service | [Documentation lookups](docs/agents/documentation-lookups.md) |
| Mobile dependencies, native sessions or runtime | [Mobile/Expo checks](docs/agents/mobile-expo.md) |
| Mobile styling/components or API/cache | [NativeWind](docs/agents/nativewind-v4.md) or [data fetching](docs/agents/mobile-data-fetching.md) |
| Mobile screens/navigation/discovery | The affected source, tests, and approved issue or prototype; review the interaction with the installed `ux-heuristics`, `design-everyday-things`, and `impeccable` skills when available |
| TypeScript imports, exports or shared runtime | [Runtime boundaries](docs/agents/typescript-runtime.md) |
| Choosing a model or effort for agent work, delegates or reviews | [Models and effort](docs/agents/models.md) |
| Running the app, the iOS Simulator, or signing in to the app or Admin locally | [Local testing](docs/agents/local-testing.md) |
| Devices, CI, Railway, staging or deploys | [Environment guide](docs/agents/environment.md) and [deployment runbook](docs/prd/ops/80-deployment-runbook.md) |

Write only in your own worktree or `/tmp`, and remove your worktree after its PR merges. Preserve unrelated changes and report host guard refusals without retrying through another tool.

## Agent skills

Third-party skills and their pinned sources are listed in the [notices](.claude/skills/THIRD-PARTY-NOTICES.md).

Work lives in GitHub Issues on `Carberk/carberk`. Read and write it with `pnpm agent:github`; [GitHub operations](docs/agents/github-operations.md) owns complete issue reads, separate PR feedback surfaces, pagination and file-based writes. Ticket shape and labels: [issue tracker](docs/agents/issue-tracker.md) and [triage labels](docs/agents/triage-labels.md).

Implemented behavior remains in source and tests; do not create a second implementation mirror.
