# 34 — Conversations (chat)

## Summary

Buyer-to-seller contact scoped to a Listing. The release ships the Messages tab and the Conversation screen approved on 2026-10-02 for the Google Play review build ([#352](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/352), prototype `prototype/favorites-conversations` at `b1cbd61`, Support entry B). The app already carries text and image Messages, listing-reference Messages, read state, typing, presence, Socket.IO realtime and push delivery; this document states the behaviour those surfaces are held to. Support chat is not part of the release (see [Support](#support)).

## Why it exists

Phone calls don't leave a trail. Telegram conversations get lost across channels. Scams are easier when there's no audit. A native, Listing-scoped chat:

- Keeps the conversation about the car (pinned listing card at top)
- Surfaces seller credibility (tenure, PRO badge; a response-time hint is a post-release candidate, see [Out of scope](#out-of-scope))
- Allows post-card sharing (Aman sends Maral "this car too?")
- Provides scam protection (admins can review reported conversations)
- Lets us measure: how many buyers contact sellers? how fast does the seller respond?

## What it does (user-visible behavior)

### Starting a conversation

1. Buyer taps "Message" on a listing detail
2. (If not authed) Login modal triggers; resume after OTP
3. Buyer enters first message OR taps a quick-reply chip
4. Conversation created in DB; `ConversationStarted` event fires
5. Both buyer and seller now see this Conversation in their Messages tab

Starting a **new** Conversation about a sold Listing stays closed (see [Closed and sold Listings](#closed-and-sold-listings)).

### Messages list

- **Row:** thumbnail of the Listing, the other participant's name, the Listing title and price, a preview of the last Message, the time and a tick for the last own Message.
- **Marks:** an unread badge, a Sold label when the Listing is sold, and muted and blocked marks.
- **Other participant:** shown by display name, with their avatar where a surface has room for one. Every account has a display name and a profile photo or library avatar ([#353](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/353)); this document does not design them.
- **Order:** by `lastMessageAt`, newest first. Muted Conversations show a 🔕 mark next to the name and are not dimmed.
- **Not on the list:** no Support row and no ads (D8).
- **Messages tab badge:** the tab shows the unread count (founder answer Q1 on #352).
- **States:** loading, empty, error with Retry, signed out (see [Screens / states](#screens--states)).

### Inside a Conversation

- **Pinned listing card** at the top of the thread (Brand Model, Year, Price, thumb) — tapping it opens the listing. A sold Listing shows a Sold badge on it.
- **Header:** the other participant's name and presence, the Conversation menu (⋯), and **Call**. Call is for buyers only, while the Listing is active and allows calls; a buyer's phone number is never shown (Q2).
- Message list scrolls (newest at bottom)
- Composer at bottom: text input, attach (image), send button
- **Quick replies** appear above the composer (see below)
- Typing indicator: "Илья is typing…" below messages
- **Read state (D6):** ticks under your own sent Messages (sent / delivered / read), and a "Read" label under the last own Message once it is read. Sent ✓ and delivered ✓✓ are grey; read ✓✓ are blue, in the chat and on the Chats list, so read is not mistaken for delivered (#821).
- Last-seen: "был(а) в 14:32" under seller's name in header
- **Back (D9):** from a Conversation opened by a push notification, Back goes to the Messages list, not out of the app or to a previous tab.

### Conversation menu (⋯)

- **Mute** (and Unmute) notifications for this Conversation.
- **Report** the other participant (a User report; the existing report path for Users).
- **Block** (and Unblock) the other participant.
- There is **no Delete conversation** (D2).
- There is **no Contact support** item (see [Support](#support)).

### Block and report

- **Block:** no further Messages can be sent in either direction; existing history is preserved for moderation. The blocking participant sees the blocked banner in place of the composer (D3): "User blocked", a line saying they cannot send Messages to this User, and an Unblock button.
- **Report (User):** from the Conversation menu. Goes to the admin queue; original Messages stay; admin can act.
- **Report (Message):** long-press another participant's Message and choose **Report** (D4); see [Long-press a Message](#long-press-a-message). A reported Message shows "Reported" for the reporter.
- Conversations owns Message and report context, deleted-message behavior and surrounding-Message excerpts; Admin owns queue display, resolution and audit.

### Long-press a Message

Long-press opens a sheet (D4):

- On another participant's Message: **Copy** and **Report**.
- On your own Message: **Copy**, and **Delete** while it is within 5 minutes of sending.

Copy takes the Message text only. Listing Share and Copy link stay removed.

### Delete a message

- Long-press own message → "Delete" in the same sheet
- Only allowed within 5 min of sending
- Renders as "Message deleted" placeholder (not silently removed)

### Failed Message

A Message that could not be sent stays on its bubble with "Failed to send" and an inline **Retry** (D5). No sheet is needed to retry.

### Quick replies

Four system-defined intents, localized, shared with Ask the seller on Listing detail:

- Is it still available?
- Can I see it? (when can I see the car)
- What is the final price?
- What is the condition of the car?

Behaviour (D7, Q4):

- Shown to the **buyer** above the composer until the seller replies. Once the seller has sent a Message, they disappear.
- Not shown when the Conversation is blocked, or when the Listing is sold or removed from sale. The composer stays on in the Listing cases, but the chips do not return. They are also absent wherever a notice or the blocked banner replaces the composer.
- Tapping a chip fills the composer; the buyer edits it and presses Send. It is never sent by the tap alone.

### Closed and sold Listings

The Conversation stays readable in every case. What changes is whether the composer is on.

| Case | Conversation screen |
|---|---|
| Listing **sold** (D1) | Sold badge on the Listing card and an inline banner: the car is sold, the Conversation can continue, and the Listing is no longer available. The banner links to other cars of the same model (Results filtered by brand and model; a plain filter, not a recommendation). The composer stays on and both participants can keep sending. |
| Listing **removed from sale** (`archived`) | The same as sold: Removed from sale badge, the banner and link, composer on (Q3). |
| Listing **banned** or **deleted** | A one-line notice replaces the composer (Q3). |
| **Chat switched off** on the Listing | A one-line notice replaces the composer (Q3). |
| **Blocked by the other participant** | A one-line notice replaces the composer (Q3). The blocker's own view is the blocked banner with Unblock (D3). |
| A participant is **suspended** | A generic unavailable notice replaces the composer, as for the cases above. |

Rules:

- **New contact stays closed:** a Listing that is sold, removed from sale, banned or deleted accepts no new Conversation. The Message button and Ask the seller are hidden on those Listings ([32 — Listings](32-listings.md#listing-states)).
- **Existing Conversations** are the only place a sold or removed Listing keeps accepting Messages. A Listing status of `sold` or `archived` no longer refuses a Message; blocking, suspension, the chat switch and a banned or deleted Listing still do.
- **Notice wording:** one short line per case, set with the implementing slice and localized in RU, EN and TK. Turkmen drafts ship and are corrected during the device proof (Q5).
- **A sold or removed Listing never produces a notice on its own.** Only the cases in the table above replace the composer.

### Support

For the release there is no support entry in Messages or in a Conversation:

- no Support row in the Messages list;
- no "Need help?" link in the empty or error states of Messages (or Favorites);
- no Contact support item in the Conversation menu.

Support is reached from **Cabinet → Help**, which shows the AutoTM email address and phone number (Cabinet is specified in [#353](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/353)). An in-app support chat with an AutoTM admin account ([#500](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/500)) comes after the release and store review. This follows the founder decision recorded on #352 that replaced D10.

### Cache + offline behavior

- TanStack Query owns conversation lists, message history pages, unread counts, and quick replies.
- Socket.IO owns realtime delivery. Incoming `message:new` / `message:read` events patch or invalidate the TanStack Query cache; reconnect triggers a reconciliation refetch.
- Typing and presence are ephemeral in-memory/socket state, not TanStack Query data and not persisted offline.
- Chat keeps a small durable outbox for messages/images that were already accepted by the composer but not confirmed by the server. It does not store full chat history offline in Phase 1.
- If the app is clearly offline, new sends are disabled. If a send was already attempted and then fails, it stays in the outbox with retry.
- Image attachments use the media upload path into the `chat-attachments` bucket. The local image is staged for preview/retry until the message is sent or discarded.

### Message types

- **Text** — up to 1000 chars, auto-link URLs
- **Image** — single image per message, ≤5 MB, client-compressed
- **Post-card** — embeds a Listing reference; tapping opens that listing. Auto-created when user shares a listing into the chat.
- **System** — server-generated Messages. The sold state of a Listing is shown by the badge and banner, not by a system Message.

## Screens / states

| Screen | State | Notes |
|---|---|---|
| Messages list | Loading | Skeleton rows of the same shape |
| Messages list | Empty | "No conversations yet"; Browse listings button |
| Messages list | Has Conversations | Sorted by `lastMessageAt` desc; unread badge; muted Conversations show 🔕 next to the name, not dimmed; Sold label on rows for sold Listings |
| Messages list | Error | "Could not load" with Retry; no support link |
| Messages list | Signed out | Sign in prompt; no support contact block |
| Conversation | New (0 messages) | Quick-reply chips above composer |
| Conversation | Buyer, seller not yet replied | Quick-reply chips stay above the composer until the seller replies; not shown when blocked or when the Listing is sold or removed from sale |
| Conversation | Many messages | Infinite scroll up to load history |
| Conversation | Other side typing | Dots animation under last message |
| Conversation | Network offline | Yellow banner; new sends disabled; already-pending outbox items retry on reconnect |
| Conversation | Loading, error, signed out | Skeleton; error with Retry; Sign in prompt |
| Conversation | Listing sold or removed from sale | Badge on the Listing card and inline banner linking to other cars of the same model; composer on |
| Conversation | Listing banned or deleted | One-line notice replaces the composer. Existing history remains readable. |
| Conversation | Chat switched off | One-line notice replaces the composer |
| Conversation | Participant suspended | Generic unavailable/account-restricted notice replaces the composer. Existing history remains readable. |
| Conversation | Blocked by the other participant | One-line notice replaces the composer |
| Conversation | You blocked this user | Banner replaces the composer: "User blocked" + Unblock button |
| Conversation | Reported | Reporter side: "Reported" under the reported Message |
| Message | Long-press | Sheet: Copy / Report (peer Message); Copy / Delete within 5 min (own Message) |
| Message | Read | Ticks, plus "Read" under the last own Message |
| Composer | Image attached | Preview thumbnail + remove × |
| Composer | Sending | Spinner on send button; disabled |
| Composer | Send failed | "Failed to send" with inline Retry on the bubble |

## Data references

- `apps/api/src/modules/conversations/CONTEXT.md`
- `apps/api/src/modules/listings/CONTEXT.md` (post-card resolves via ListingsReadPort)
- `apps/api/src/modules/identity/CONTEXT.md` (block check via IdentityReadPort)
- WebSocket protocol: see Conversations CONTEXT events table

## Decisions

- [ADR-0001](../../adr/0001-architecture.md) — Conversations as bounded context
- [ADR-0002](../../adr/0002-stack.md) — Socket.IO via NestJS Gateway
- [ADR-0009](../../adr/0009-notifications.md) — Offline → FCM/APNS push
- [ADR-0027](../../adr/0027-mlp-beta-scope.md) — MLP beta scope; simple text contact first
- [#352](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/352) — founder approval of the Favorites and Conversations prototype (D1–D9, Q1–Q5, Support entry B), 2026-10-02
- Moderation decision: S7 listing bans and user suspensions do not auto-close conversations. They make the affected listing/thread read-only for contact/message sends while preserving existing conversation history. Send/contact checks are synchronous against current listing status and user suspension state. S7 moderation events are not consumed by conversations, and S7 emits no conversation system messages from moderation.
- Sold and removed Listings are different from banned and deleted ones: a sold or removed Listing keeps an existing Conversation open for Messages (D1, Q3), while a banned or deleted Listing closes the composer. Only a Listing status check differs; blocking, suspension and the chat switch apply to all of them.
- Message reports use the generic `ContentReport` with a `message` target, owned by `admin/`. Conversations owns the Message context and deleted-message behavior.

## Phase

**Phase 1, Google Play review build.** The Messages list, Conversation screen, realtime, read state, typing, presence, image Messages, Message and User reports, block, mute and push delivery ship. The support chat is a post-release bet.

## Out of scope

- Voice messages (not in MVP)
- Video messages (not in MVP)
- Group chat (3+ participants) — never planned
- E2E encryption — explicitly rejected (moderation > confidentiality for marketplace)
- Message reactions / emoji react — Phase 2 if users demand
- Auto-translate between locales — Phase 3 if ever
- Pinning specific messages within a thread — defer
- Voice / video calls — out of scope, never planned
- Delete conversation — rejected (D2)
- Support row, support links and in-app support chat in the release (see [Support](#support))
- Ads and promoted rows in the Messages list (D8)
- Post-release candidate, not in the release: a "Seller usually responds within 1 hour" hint in the Conversation header, shown once the seller has 5+ past conversations. It exists in neither the app nor the approved prototype.

## Open questions

- Listing-card preview rendering in the WhatsApp share — handled via OG meta in public web (Feature 38)
- Post-release: response time SLA shown on seller profile — what threshold gets the "fast responder" badge?
