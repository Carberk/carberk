# AutoTM agent instructions

AutoTM is a vehicle marketplace monorepo. Its public product name is Carberk ([ADR-0093](docs/adr/0093-carberk-is-the-public-product-name.md)): user-visible text says Carberk, while packages, identifiers, domains and older documents keep AutoTM. Use pnpm workspaces; workspace scripts and configuration are the source for commands and installed versions. This policy applies to Codex desktop, Claude Code desktop, and the `claude-kimi` CLI.

## Start with the task

Read the request or issue and its acceptance criteria. Find the owning area through [CONTEXT-MAP.md](CONTEXT-MAP.md), read its short overview, then inspect the relevant source and tests. Load linked requirements and decisions when they govern the change. Read the roadmap and sprint plan for scheduling or sprint scope, not as universal startup material.

Use the [glossary](docs/domain/GLOSSARY.md) when interpreting or changing domain terms. A definition does not establish implementation or scope. Source and runtime evidence establish current behavior; the issue and product specification establish intended behavior.

## Follow the relevant route

| Task | Read before changing it |
|---|---|
| Shape, ticket, implement, resume, or review an issue | [Coding workflow](docs/agents/coding-workflow.md) and its linked skill |
| Work a founder-ordered queue or explicitly delegated outcome from one orchestrator session | [`run-queue`](.claude/skills/run-queue/SKILL.md), then the coding workflow |
| Implement a batch of issues in this session (ADR-0094 trial) | [`run-batch`](.claude/skills/run-batch/SKILL.md) |
| Small fix without an issue, or a fix for a review finding | [Small changes](docs/agents/coding-workflow.md#small-changes-adr-0065) ([ADR-0065](docs/adr/0065-small-changes-skip-the-issue-ceremony.md)) |
| API domain logic, cross-context ownership, or domain documentation | [Domain guidance](docs/agents/domain.md) |
| External library, framework, SDK, API, CLI, or cloud service | [Documentation lookups](docs/agents/documentation-lookups.md); resolve and query Context7 before relying on library APIs |
| Mobile work, especially packages, Metro, or native runtime failures | [Mobile/Expo checks](docs/agents/mobile-expo.md) |
| Mobile styling or components | [NativeWind conventions](docs/agents/nativewind-v4.md) |
| Mobile API calls or caching | [Mobile data fetching](docs/agents/mobile-data-fetching.md) |
| Mobile screen, navigation, or discovery | [ADR-0051](docs/adr/0051-auto-ru-inspired-mobile-discovery-before-google-play-review.md), then the affected approved UI specification |
| TypeScript imports, package exports, or shared runtime packages | [Runtime boundaries](docs/agents/typescript-runtime.md) |
| New modules, new tests, or a Standards review | [Coding standards](docs/agents/coding-standards.md); advisory and new lines only until the first store release |
| Document roles, new PRDs, or decision/sprint changes | [Domain documentation policy](docs/agents/domain.md#document-authority) |

## Guardrails

- Keep domain code framework-free. Cross-context calls use injected ports or events. Prisma rows stay behind infrastructure boundaries. Use one use-case per file and test business behavior in domain/application tests.
- Commit schema changes as migrations. `db push` is localhost-only. Store timestamps in UTC. Never commit secrets or plaintext refresh tokens; refresh state belongs to Session, not User.
- External service egress needs an approved decision. Existing push and sign-in email delivery run in the worker. Hosting follows [ADR-0039](docs/adr/0039-phased-cloud-first-hosting.md); preserve the future TM deployment constraints.
- Preserve `.npmrc` hoisting and mobile media limits. Follow the mobile gate before changing package resolution or compression.
- Keep merged ADRs immutable, started sprint plans locked, and retros append-only. [ADR-0060](docs/adr/0060-source-first-agent-context-and-task-scoped-guidance.md) replaces exhaustive code mirrors with selective orientation. Update an overview when its documented boundary, constraint, ownership, or limitation changes.

## Finish with evidence

Run focused checks during implementation. Before final review, run the repository test and typecheck gates, affected lint, and applicable build, runtime, integration, and UI checks. A checkpoint commit preserves recoverable work; it does not claim final verification. Recheck evidence affected by later changes, and report unavailable gates as missing evidence. The hosted required `pr` check evidences container-backed tests ([ADR-0075](docs/adr/0075-railway-pr-backends-for-agent-native-sessions.md)); run non-container gates locally. Issue work requires a pushed reservation branch, early draft PR, durable Execution state, one fixed-commit independent review round, and a green required `pr` check before merge. See the coding workflow for the exact contract.

Repository skills live only in [.claude/skills](.claude/skills). If the host does not discover them, open the workflow's linked `SKILL.md` and follow it manually with available tools. For Kimi implementation and review, follow [ADR-0059](docs/adr/0059-kimi-code-as-a-third-interactive-coding-agent.md) through the coding workflow. Never query provider quota before starting work; `run-batch` reads plan usage only at batch start, after each issue's checkpoint and at merge, to measure the [ADR-0094](docs/adr/0094-one-orchestrator-implements-batched-pull-requests-trial.md) trial and time its handoff, never to decide whether to start.
