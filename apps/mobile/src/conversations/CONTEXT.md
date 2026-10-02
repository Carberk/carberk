# Mobile conversations

This area holds the Messages list, the Conversation screen's parts, the chat socket client and chat image uploads. The Conversation route, `app/conversations/[id].tsx`, wires them together. Server rules for who may send, what a Listing card shows and how blocking works belong to [API Conversations](../../../api/src/modules/conversations/CONTEXT.md); the approved screen is in [PRD 34](../../../../docs/prd/features/34-conversations.md).

## Boundaries that matter

**Loading by ID.** The Conversation route reads only `id` and an optional `draft` from its params. Everything it shows about the Conversation, from the other participant and roles to the Listing card, mute and watermarks, comes from `useConversation`, which reads `GET /conversations/:id` under `queryKeys.conversations.detail(id)`. A screen that already holds a summary (a Messages row, or an open from Listing detail's Message or Ask the seller) calls `seedConversationDetail` before navigating, so the header and Listing strip draw at once; the seeded entry is marked stale and the screen still refreshes it. With nothing seeded, the hook starts from the list cache when the Conversation is there. Don't add route params for Conversation data: a push or deep link carries only the ID, and every entry must work from it. A seeded summary has no `sendRestriction` until the read answers.

**Call.** The header's Call is for the buyer only, while the Listing is active and allows calls. It dials the Listing contact phone read from the Listing detail request (`useConversationCallPhone`), never a participant's Sign-in Method phone, and the seller never sees it ([ADR-0056](../../../../docs/adr/0056-listing-contact-phones-are-verified.md), founder answer Q2 on #352).

**The socket complements HTTP.** HTTP queries own the cached state; `useConversationSocket` sends with acknowledgements, falls back to HTTP when not connected, and patches or invalidates the messages, list and by-ID caches when events arrive. A cache change that matters on the Conversation screen, such as mute, a watermark or a new Message, must reach the by-ID entry as well as the list.

**Local pending and failed Messages.** The route keeps optimistic Messages in local state, keyed by a client message ID, and drops each one once the server copy with that ID arrives. Failed ones stay local until Retry; they never enter the query cache.

**Quick replies.** `showQuickReplies` is the one rule for the chips above the composer: the buyer sees them until the seller has sent a Message (D7), never the seller, and not while loading, in an error state, while older history is unloaded, or whenever the viewer cannot send (blocked, or a `sendRestriction` that is set or not yet known). A tap only fills the composer (Q4). Change the rule there, not in the route.

**Bubble footer and history.** Every bubble shows its time; own Messages add ✓ (sent) or ✓✓ (delivered or read) in one style, and only the last own Message carries the "Read" label (D6). `buildMessageRows` decides the day separators and that label from the newest-first list, so both stay right when an older page is appended; the list asks for older pages through `onLoadOlder` and shows a loading row above the oldest Message while one loads. A failed older page keeps the loaded Messages with an inline Retry; only a first load with nothing to show replaces the screen with `ErrorState`.

**Push entry and Back.** `src/notifications/useDirectMessagePushRouting.ts`, wired once in the root layout, turns a direct-message notification tap (cold start, background or foreground) into `navigate` to Messages when the root tabs are focused, or `dismissTo` Messages when a screen is above the tabs, followed by a push of `/conversations/[id]` with the ID alone. Back and the Android back gesture from a push-opened Conversation therefore land on the Messages list with the Messages tab selected (D9 on [#352](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/352)); a tap for the Conversation already on screen does nothing. A Conversation opened from the Messages list, a Favorites card or Listing detail is pushed normally and goes back to where it was opened. Hrefs and the route test live in `conversationRoutes.ts`. Real push delivery and the device cold-start path are proved on a device in [#345](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/345), not by unit tests.

**Signed out and not found.** The route reads nothing until a User is signed in. While auth hydration is unresolved, it uses an empty read ID and shows loading, even for a seeded Conversation. This deliberately delays the cache-first header paint until identity is known so a cached private Conversation is not exposed during session hydration. Signed out, it shows "Sign in to view messages" with a Sign in button whose `intentStore` intent returns to the same Conversation; cancelling returns to the signed-out state. An expired session on this route is not redirected by the root layout's global sign-in redirect, so the screen can offer its own. A 404 or 403 from the Conversation or Messages read shows "Conversation not found" with a button to Messages and drops any cached header, Listing strip and composer.

**Messages list.** `ConversationList` renders the summaries from `useConversations` in server order and refetches when its screen regains focus, so a row's unread badge clears after the Conversation is read. The row's tick and the Conversation's bubbles share one sent / delivered / read rule, `outgoingStatus.ts`.

**Blocked by the viewer.** Whether the viewer blocked the other participant comes from the loaded Conversation (`blockedByMe`, or `sendRestriction` of `blocked_by_me`), never from a separate block request. Block and Unblock patch the by-ID entry so the footer switches at once, then refresh it and the list. While blocked, the footer is only the banner with Unblock: no composer, attach, quick replies or typing indicator (#352 D3). Messages stay readable. That the other participant blocked the viewer is not shown.

**Screen structure.** The route holds orchestration. `ConversationHeader` (Back, the participant, Call, the ⋯ button that opens `ConversationMenuSheet`), `ConversationListingCard` (the Listing strip) and `ConversationFooter` (blocked banner, or typing indicator and composer) render from props and have their own rendered tests. The menu holds Mute, Report and Block only (#352 D2); Report opens `ReportSheet` as a User report of the other participant and is hidden when `reportEntryEnabled` is false, as on Listing detail.

## Start here

- [Conversation route](../../app/conversations/[id].tsx)
- [Read by ID and seeding](../api/conversations/useConversation.ts)
- [Socket hook and tests](socket/useConversationSocket.ts)
- [Screen tests](../../test/screens/conversation-by-id.spec.tsx)
- [Parent application](../../CONTEXT.md)
