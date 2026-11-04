# Domain and documentation guidance

## Working in a domain

Use the [glossary](../domain/GLOSSARY.md) for project meanings and avoided synonyms. In particular, a Verified Contact Phone is not a Sign-in Method. A term can exist before its feature ships.

Find the owning area in [CONTEXT-MAP.md](../../CONTEXT-MAP.md). Read that area's overview and follow its source/test links. Inspect callers and neighboring boundaries when the change crosses contexts. Use the issue and any linked temporary specification for expected behavior; do not infer capability from a table, glossary entry, roadmap, or historical sprint label.

API contexts have framework-free `domain/` rules, `application/` use-cases, `infrastructure/` adapters, and `presentation/` transports. Keep Nest and Prisma out of domain code; map database rows at the infrastructure boundary. Cross-context calls go through injected ports or events rather than importing another context's internal domain/application code. Other modules import identity only through `identity/identity.public.ts` (plus `identity.module.ts` and `profile-photo.module.ts` for Nest composition); `apps/api` lint enforces this. Keep one use-case per file with one job, and verify business rules with domain/application tests.

## Data and operational constraints

Commit schema changes as migrations; `db push` is localhost-only. Store timestamps in UTC. Keep secrets and plaintext refresh tokens out of committed data; refresh state belongs to Session, not User. External service egress requires an approved decision. Push and sign-in email delivery run in the worker. Hosting follows [ADR-0039](../adr/0039-phased-cloud-first-hosting.md), including future TM deployment constraints.

## Document authority

[ADR-0109](../adr/0109-source-first-documentation-and-design-workflow.md) supersedes ADR-0020's document hierarchy. [ADR-0060](../adr/0060-source-first-agent-context-and-task-scoped-guidance.md) defines short local overviews; [ADR-0042](../adr/0042-domain-glossary-authority-and-mutability.md) governs vocabulary. Historical ADRs retain their original text; consult the [ADR index](../adr/README.md) for supersession.

| Question | Read or update |
|---|---|
| What does a term mean? | [Glossary](../domain/GLOSSARY.md), governed by [ADR-0042](../adr/0042-domain-glossary-authority-and-mutability.md) |
| What is implemented? | Source, schema, tests, and runtime evidence |
| Where should I look and what boundary matters? | Map and owning CONTEXT.md |
| What should a capability do? | GitHub issue and any linked temporary specification |
| What must this task deliver? | GitHub issue acceptance criteria and any linked temporary specification |
| Why was this chosen? | Relevant ADR or durable decision |
| What is scheduled? | Roadmap and open GitHub issues |
| What did this change finish? | The PR description and its linked issue |

For a new durable decision, write a superseding ADR; merged ADRs are immutable. Use an issue or disposable prototype for temporary planning. Semantic vocabulary changes and ownership changes follow ADR-0042; routine definitions go into the glossary. User-facing copy belongs to the issue, code, and i18n resources that ship it.

For user-facing UI work, apply the installed `ux-heuristics`, `design-everyday-things`, and `impeccable` skills to the affected interaction. If a skill is unavailable, disclose that and review clarity, accessibility, state feedback, and error prevention/recovery without claiming the skill ran.

## Writing local overviews

Keep only material that helps someone choose the right code or avoid a non-obvious mistake:

- What this area owns and where its responsibility ends.
- Current constraints or important limitations, with links to evidence.
- The few source, test, specification, or decision entry points needed to investigate it.

Headings are optional; do not create empty sections. Do not inventory every field, method, route, event payload, dependency version, or file. Do not copy resolved bugs, task progress, tutorials, or future specifications into an overview.

Update an overview in the same PR when its documented ownership, boundary, constraint, or important limitation changes. Routine internal changes do not independently require prose updates. Update the map when context ownership or locations change. Keep source links accurate; documentation cannot replace inspecting implementation.

Generic domain-modeling skills sometimes call their glossary CONTEXT.md. In AutoTM, route those writes to `docs/domain/GLOSSARY.md`; our local CONTEXT.md files are orientation notes. Do not introduce a second glossary or copy global skills into the repo.
