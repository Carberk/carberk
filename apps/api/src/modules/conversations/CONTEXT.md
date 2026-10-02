# Conversations

Conversations owns per-listing buyer/seller threads and message behavior. Realtime owns socket infrastructure; Notifications owns push eligibility. Changes to message creation can affect HTTP, sockets, notifications, and audit/report context.

Participant access, listing availability, suspension, and blocking are enforced at the application boundary. Existing history can remain readable when new contact or sends are forbidden. Do not collapse these into one generic availability check.

An existing Conversation stays open for Messages after its Listing is `sold` or `archived` (removed from sale), over HTTP and the socket, so `sendRestriction` is `null` for it. `OpenConversation` still refuses a new Conversation about a Listing that is not `active`. A banned or deleted Listing, chat switched off, a block, a suspension, and a non-participant still refuse a send, and no system Message is written when a Listing is sold. The rule lives in `checkListing` in `ConversationSendPolicy`, which both `authorize` and `restrictionFor` call.

A Conversation summary carries the other participant (`peer`: id and display name, `null` when the User has none or no longer exists) and `blockedByMe`, true only when the viewer blocked the peer; whether the peer blocked the viewer is never exposed. Names and block states for a page come from the identity public port in one batched read each (`application/ConversationPeers.ts`), not one call per row. No phone, email or other Sign-in Method data crosses this boundary.

`GET /api/v1/conversations/:id` (`application/GetConversation.ts`) returns one list-item summary plus `sendRestriction`: `null` when a Message would be accepted, else `blocked_by_me`, `listing_unavailable`, `chat_disabled` or `participant_unavailable`. It is computed by `ConversationSendPolicy.restrictionFor`, which applies the Listing rule and reads the participant-safety facts that `authorize` uses on every send, so the two cannot disagree. A refused send never refuses the read: History stays readable, and the restriction is reported, not thrown. When several apply, `blocked_by_me` comes first so the app can offer Unblock, then the Listing rules, then `participant_unavailable`, which does not say whether a suspension or the other participant's block caused it. The list does not carry `sendRestriction`; it would cost several identity reads per row.

The shared send path preserves idempotence across retries and transports. A repeated client message must not create another message or republish its event. Listing-reference messages retain the original snapshot while read paths compute current availability. Deleted messages are redacted for readers while retained for audit context; deletion has a limited owner window.

Watermarks advance monotonically. HTTP refetch remains authoritative after reconnect. A socket room name does not grant access: conversation joins must validate the participant and applicable restrictions. Keep image staging, message persistence, and fanout as separate failure boundaries.

## Start here

- [Module composition](conversations.module.ts)
- [Shared send policy](application/ConversationSendPolicy.ts)
- [Send path and tests](application/SendConversationMessage.ts)
- [Application behaviors and tests](application)
- [Socket and HTTP integration](presentation)
- [Persistence](infrastructure)
- [Product requirements](../../../../../docs/prd/features/34-conversations.md)
- [Schema](../../../../../packages/db/prisma/schema.prisma)
