# Service messaging

This context owns private Support cases and vehicle-history requests, their service conversations, scoped assignment, exact private attachments and fulfilment records. Ordinary Listing Conversations remain in Conversations. Identity supplies current Session, staff capability and business authority; a marketplace-admin role does not imply access to private service records.

The HTTP controller and `/ws/services` Socket.IO gateway share `PrismaServiceMessaging` authorization and lifecycle checks. History operations and report artifacts use the adjacent `infrastructure/history` adapters. Attachment download checks stored purpose, audience and rights expiry before releasing bytes; a storage hold alone never expands the reader audience. Account purge fences current linkage and durable exact-key cleanup through the worker helper. Retained vehicle knowledge has separate permitted-use rules, rather than inheriting Support's schedule.

The admin `/services` workspace uses the same API, server-only tokens and private file proxy. Provider purchases, real payment execution and live service opening require their separate operating evidence; a synthetic fulfilment fixture establishes none of them. Inspect the runtime gate and current assignment checks before enabling an action. A full-v3 staging campaign principal can reach only Support open, list, read, text send, assignment and read state through [campaign admission](infrastructure/campaignServiceAdmission.ts). It is derived from the stored roster email and serving candidate, then proven by the reservation's contract-hashed authority under its fence. History, attachments, push, files, Support commands and the staff queue keep the ordinary runtime gate.

## Start here

- [Composition](service-messaging.module.ts) and [public port](domain/ports/ServiceMessagingPort.ts)
- [Service access](domain/serviceAccess.ts), [rights](domain/ServiceRights.ts) and [history policy](domain/history/HistoryPolicy.ts)
- [Persistence and authority](infrastructure/PrismaServiceMessaging.ts), [history adapters](infrastructure/history)
- [HTTP/storage acceptance](presentation/ServiceMessaging.e2e.spec.ts) and [socket acceptance](presentation/ServiceGateway.e2e.spec.ts)
- [Lifecycle worker](../../../../worker/src/jobs/ExpireServiceContent.ts) and [account erasure](../../../../worker/src/jobs/serviceAccountErasure.ts)
- [Admin workspace](<../../../../admin/src/app/(admin)/services/ServiceWorkspace.tsx>)
