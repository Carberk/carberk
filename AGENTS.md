# Carberk agent instructions

Carberk is the public product name. AutoTM identifiers, packages and domains remain. Use pnpm workspaces; configuration owns commands and versions.

Read the request and acceptance criteria, then [CONTEXT-MAP.md](CONTEXT-MAP.md), the owning overview, source and tests. Source and runtime evidence establish current behavior; the specification establishes intended behavior. Use the [glossary](docs/domain/GLOSSARY.md) for domain terms. Read roadmap and sprint plans only for scheduling or sprint scope.

Every delivery follows [coding workflow](docs/agents/coding-workflow.md). It owns roles, review, verification, recovery and the approved exception. Repository skills live only in [.claude/skills](.claude/skills); open linked skills manually when the host cannot discover them. [ADR-0098](docs/adr/0098-integration-delivery-with-shared-staging-and-concise-agent-guidance.md) establishes this workflow. Staging automation and direct promotion remain gated by operational readiness.

| When changing | Read before editing |
|---|---|
| Domain logic, ownership or documentation | [Domain guidance](docs/agents/domain.md) |
| New or changed modules, behavior or tests; Standards review | [Coding standards](docs/agents/coding-standards.md) |
| External dependency or service | [Documentation lookups](docs/agents/documentation-lookups.md) |
| Mobile dependencies, native sessions or runtime | [Mobile/Expo checks](docs/agents/mobile-expo.md) |
| Mobile styling/components or API/cache | [NativeWind](docs/agents/nativewind-v4.md) or [data fetching](docs/agents/mobile-data-fetching.md) |
| Mobile screens/navigation/discovery | [UI readiness](.claude/skills/run-issue/UI-MODE.md) and the affected approved design |
| TypeScript imports, exports or shared runtime | [Runtime boundaries](docs/agents/typescript-runtime.md) |
| Deployed acceptance or staging mutation | [Deployment runbook](docs/prd/ops/80-deployment-runbook.md) and [staging reservation](docs/agents/shared-staging.md) |

Write only in your owned worktree or `/tmp`; follow [worktree lifecycle](docs/agents/worktree-lifecycle.md). Preserve unrelated changes and report host guard refusals without retrying through another tool.
