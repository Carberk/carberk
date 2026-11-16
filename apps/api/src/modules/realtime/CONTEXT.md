# Realtime

Realtime provides authenticated Socket.IO infrastructure, user rooms, and online/last-seen state. Conversation message, room-access, typing, and watermark behavior belongs to Conversations.

Socket authentication uses the API access-token boundary. A valid socket identity does not itself establish access to a conversation. Transports consume [the public realtime contract](realtime.public.ts) for namespace/room naming and authenticated actor shape; socket authentication stays internal. Other contexts consume PresencePort for presence.

Engine.IO polling and upgrade requests use the same signed gateway attribution verifier and shared replay store as HTTP requests. Direct requests without a proof follow the existing direct ingress policy; Socket.IO bearer authentication and Conversation access checks remain separate.

Presence is process-local. Enabling the Redis Socket.IO adapter distributes traffic but does not turn the in-memory registry into distributed presence. Consider that limitation before scaling API instances or changing online-based push suppression. Nest/Socket.IO owns namespace lifecycle; preserve proper shutdown behavior.

## Start here

- [Module composition](realtime.module.ts)
- [Public transport contract](realtime.public.ts)
- [Server adapter](infrastructure/RealtimeIoAdapter.ts)
- [Socket authentication](infrastructure/SocketAuthMiddleware.ts)
- [Registry and tests](infrastructure/SocketConnectionRegistry.ts)
- [Gateway lifecycle](infrastructure/RealtimeGateway.ts)
- [Presence port](domain/ports/PresencePort.ts)
- [Stack decision](../../../../../docs/adr/0002-stack.md)
- [Schema](../../../../../packages/db/prisma/schema.prisma)
