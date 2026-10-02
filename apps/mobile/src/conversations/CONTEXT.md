# Mobile conversations

This area holds the Messages list, the Conversation screen's parts, the chat socket client and chat image uploads. The Conversation route, `app/conversations/[id].tsx`, wires them together. Server rules for who may send, what a Listing card shows and how blocking works belong to [API Conversations](../../../api/src/modules/conversations/CONTEXT.md); the approved screen is in [PRD 34](../../../../docs/prd/features/34-conversations.md).

## Boundaries that matter

**Loading by ID.** The Conversation route reads only `id` and an optional `draft` from its params. Everything it shows about the Conversation, from the other participant and roles to the Listing card, mute and watermarks, comes from `useConversation`, which reads `GET /conversations/:id` under `queryKeys.conversations.detail(id)`. A screen that already holds a summary (a Messages row, or an open from Listing detail's Message or Ask the seller) calls `seedConversationDetail` before navigating, so the header and Listing strip draw at once; the seeded entry is marked stale and the screen still refreshes it. With nothing seeded, the hook starts from the list cache when the Conversation is there. Don't add route params for Conversation data: a push or deep link carries only the ID, and every entry must work from it. A seeded summary has no `sendRestriction` until the read answers.

**Call.** The header's Call is for the buyer only, while the Listing is active and allows calls. It dials the Listing contact phone read from the Listing detail request (`useConversationCallPhone`), never a participant's Sign-in Method phone, and the seller never sees it ([ADR-0056](../../../../docs/adr/0056-listing-contact-phones-are-verified.md), founder answer Q2 on #352).

**The socket complements HTTP.** HTTP queries own the cached state; `useConversationSocket` sends with acknowledgements, falls back to HTTP when not connected, and patches or invalidates the messages, list and by-ID caches when events arrive. A cache change that matters on the Conversation screen, such as mute, a watermark or a new Message, must reach the by-ID entry as well as the list.

**Local pending and failed Messages.** The route keeps optimistic Messages in local state, keyed by a client message ID, and drops each one once the server copy with that ID arrives. Failed ones stay local until Retry; they never enter the query cache.

**Push entry.** `src/notifications/useDirectMessagePushRouting.ts` turns a direct-message notification tap into a push of `/conversations/[id]` with the ID alone. It is wired once in the root layout and holds no Conversation data.

**Messages list.** `ConversationList` renders the summaries from `useConversations` in server order and refetches when its screen regains focus, so a row's unread badge clears after the Conversation is read. The row's tick and the Conversation's bubbles share one sent / delivered / read rule, `outgoingStatus.ts`.

**Screen structure.** The route holds orchestration. `ConversationHeader` (Back, the participant, Call, the ⋯ menu), `ConversationListingCard` (the Listing strip) and `ConversationFooter` (blocked banner, typing indicator, composer) render from props and have their own rendered tests.

## Start here

- [Conversation route](../../app/conversations/[id].tsx)
- [Read by ID and seeding](../api/conversations/useConversation.ts)
- [Socket hook and tests](socket/useConversationSocket.ts)
- [Screen tests](../../test/screens/conversation-by-id.spec.tsx)
- [Parent application](../../CONTEXT.md)
