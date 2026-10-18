# Context map

Find the owning area, read its short overview, then inspect source and tests. These documents orient a task; they do not inventory implementation or establish product scope. [AGENTS.md](AGENTS.md) routes workflows and specialized guidance. [The glossary](docs/domain/GLOSSARY.md) owns vocabulary. [ADR-0060](docs/adr/0060-source-first-agent-context-and-task-scoped-guidance.md) defines the overview contract.

## Apps

| Workspace | File | Owns |
|---|---|---|
| API service | [`apps/api/CONTEXT.md`](apps/api/CONTEXT.md) | NestJS bounded contexts, HTTP + WS endpoints |
| Admin (Next.js) | [`apps/admin/CONTEXT.md`](apps/admin/CONTEXT.md) | Internal admin UI, moderation, user mgmt |
| Public web (Next.js) | [`apps/web/CONTEXT.md`](apps/web/CONTEXT.md) | Localized landing, legal and trust pages; inspect routes for shipped scope |
| Mobile (Expo) | [`apps/mobile/CONTEXT.md`](apps/mobile/CONTEXT.md) | Android + iOS app, the primary user surface |
| SMS gateway | [`apps/sms-gateway/CONTEXT.md`](apps/sms-gateway/CONTEXT.md) | HTTP send scaffold; fleet delivery is not implemented |
| Phone agent | [`apps/phone-agent/CONTEXT.md`](apps/phone-agent/CONTEXT.md) | Kotlin service/client scaffold for future phone delivery |
| Worker | [`apps/worker/CONTEXT.md`](apps/worker/CONTEXT.md) | Push delivery, sign-in email, account purge; other processors are placeholders |

## Bounded contexts (inside `apps/api/src/modules/`)

| Context | File | Owns |
|---|---|---|
| identity | [`identity/CONTEXT.md`](apps/api/src/modules/identity/CONTEXT.md) | User, Dealership, DealershipMember, OTP, Sessions, Garage, BlockedUser |
| catalog | [`catalog/CONTEXT.md`](apps/api/src/modules/catalog/CONTEXT.md) | Brand, Model, Generation, Color, BodyType, Region, City |
| listings | [`listings/CONTEXT.md`](apps/api/src/modules/listings/CONTEXT.md) | Listing, ListingMedia, Favorite, Draft |
| subscriptions | [`subscriptions/CONTEXT.md`](apps/api/src/modules/subscriptions/CONTEXT.md) | SavedSearch schema; matching/fanout not implemented |
| conversations | [`conversations/CONTEXT.md`](apps/api/src/modules/conversations/CONTEXT.md) | Per-listing rich chat, messages, participant watermarks, mute, delete, report context |
| realtime | [`realtime/CONTEXT.md`](apps/api/src/modules/realtime/CONTEXT.md) | Authenticated Socket.IO adapter, user rooms, online/last-seen presence port |
| notifications | [`notifications/CONTEXT.md`](apps/api/src/modules/notifications/CONTEXT.md) | Native device tokens, direct-message push decision/history, worker enqueue |
| content | [`content/CONTEXT.md`](apps/api/src/modules/content/CONTEXT.md) | BlogPost schema; publishing not implemented |
| reports | [`reports/CONTEXT.md`](apps/api/src/modules/reports/CONTEXT.md) | InspectionInterest demand capture and admin aggregates |
| diagnostics | [`diagnostics/CONTEXT.md`](apps/api/src/modules/diagnostics/CONTEXT.md) | Synthetic inspection intake, staff authoring/review, immutable releases and private/public readers |
| service messaging | [`service-messaging/CONTEXT.md`](apps/api/src/modules/service-messaging/CONTEXT.md) | Private Support and Vehicle History conversations, assignment, fulfilment and protected artifacts |
| diagnostic telemetry | [`telemetry-diagnostics/CONTEXT.md`](apps/api/src/modules/telemetry-diagnostics/CONTEXT.md) | Strict synthetic diagnostic relay, current staff admission and bounded collector transport |
| operations | [`operations/CONTEXT.md`](apps/api/src/modules/operations/CONTEXT.md) | Current scoped operational health reads and bounded technical counters |
| measurement infrastructure | [`measurement/CONTEXT.md`](apps/api/src/modules/measurement/CONTEXT.md) | Strict first-party intake and public emitter ports; durable identity/ledger composition pending |
| admin | [`admin/CONTEXT.md`](apps/api/src/modules/admin/CONTEXT.md) | Audit log, listing/user/message reports, moderation |

## Mobile feature modules (inside `apps/mobile/src/`)

| Module | File | Owns |
|---|---|---|
| listings | [`listings/CONTEXT.md`](apps/mobile/src/listings/CONTEXT.md) | Create `sell` reducer + staging queue vs edit-route shell; uploads, autosave, wizard documentation |
| measurement | [`measurement/CONTEXT.md`](apps/mobile/src/measurement/CONTEXT.md) | Bounded client queue and first-party sender; feature/identity host not composed |
| conversations | [`conversations/CONTEXT.md`](apps/mobile/src/conversations/CONTEXT.md) | Conversation screen loaded by ID, socket and HTTP caches, local pending Messages, push entry |

## Packages

| Package | File | Owns |
|---|---|---|
| Database | [`packages/db/CONTEXT.md`](packages/db/CONTEXT.md) | Prisma schema, migrations, seed data |
| Contracts | [`packages/contracts/CONTEXT.md`](packages/contracts/CONTEXT.md) | Zod schemas, OpenAPI exporter |
| UI | [`packages/ui/CONTEXT.md`](packages/ui/CONTEXT.md) | Design tokens, shared shadcn components |

## Maintenance

Update links when ownership or locations change. Add an overview when a real area needs orientation, not speculatively for a future feature. Verify documented limitations against source; use the roadmap and owning PRD for delivery scope.
