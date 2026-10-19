# 20 — Information architecture

The map of every screen, route, and navigation surface. If you can't find where a feature lives in this document, it's either not designed yet or it doesn't belong.

## Mobile (Expo) — bottom tab nav

Five tabs. Center button is the visual "do something" CTA.

| Tab | Label (RU) | Label (TK) | Label (EN) | Default route |
|---|---|---|---|---|
| 1 | Поиск | Gözle | Search | Home (new listings + "Brand, model" entry) |
| 2 | Избранное | Saýlanan | Favorites | Favorites list (saved listings; S8a) |
| 3 | + | + | + | Sell entry point |
| 4 | Сообщения | Çat | Messages | Simple contact threads |
| 5 | Кабинет | Kabinet | Cabinet | Cabinet menu (see [Tab 5](#tab-5--cabinet-menu)) |

### Mobile route map

```
/(tabs)/
  index                Home
  favorites            Favorites list (saved listings; saved searches post-MLP)
  sell                 Sell entry — New listing
  chat                 Simple contact thread list
  services             Cabinet menu

/(auth)/
  phone                Phone entry
  otp                  OTP code entry
  totp                 Admin TOTP (required if admin UI exposed)

/(public)/
  listings/[id]        Listing detail
  dealers/[slug]       Post-MLP dealer showroom
  blog/[id]            Post-MLP blog post

/sell/wizard           Listing wizard (steps 1-7)
/sell/wizard/[step]    Specific step deep link
/me                    Profile (Sign-in Methods, display name and photo, Log out, Delete account)
/me/garage             Post-MLP My Garage
/me/garage/[id]        Post-MLP Garage vehicle detail
/me/listings           My listings
/me/saved-searches     Post-MLP my saved searches
/me/notifications      Notifications (release: device state and a link to system settings; per-category toggles are post-release)
/me/help               Help (email and phone)
/me/about              About (app name and version)
/me/edit               Edit profile
/dealers/me            Post-MLP "My dealership" if user is a member

/chat/[conversationId] Simple text contact thread
```

Route names under `/me` are illustrative; the build tickets settle the file routes. There is no Settings route: language and theme live on the Cabinet menu, and Log out and Delete account live on Profile.

### Tab 1 — category browse surface (multi-vertical seam)

Tab 1 follows the Auto.ru-inspired discovery journey of [ADR-0051](../adr/0051-auto-ru-inspired-mobile-discovery-before-google-play-review.md): **Home** (new listings and a "Brand, model" entry) → Brand picker → Model picker → a separate **Results** screen, with Search (🔍), Sort and a full-screen Search parameters form alongside. The screens, states and rejected patterns are specified in [33 — Search & discovery](features/33-search-discovery.md). ADR-0051 supersedes the "dedicated filter funnel" browse route that [ADR-0035](../adr/0035-multi-vertical-platform-direction.md) and [ADR-0036](../adr/0036-multi-vertical-seam-resolutions-mlp.md) prescribed; their cars-first, multi-vertical direction stays, so a category hub can still slot in front of Home when a second vertical is bet on.

### Tab 5 — Cabinet menu

Tab 5 opens the Cabinet, which is a plain menu rather than a Settings screen. This follows the founder's decisions on [#353](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/353#issuecomment-5946561929) and [#353's slicing answers](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/353#issuecomment-5947334041), recorded in the [screen map amendment](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/344#issuecomment-5947347989). Where it differs from the original [screen map resolution](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/344#issuecomment-5759595278), the amendment wins.

| State | Rows, top to bottom |
|---|---|
| Signed out | Sign in, Language, Theme, Help, Terms of Service, Privacy Policy, Posting rules, About |
| Signed in | Profile row, Notifications, My listings (one row with the total of the User's Listings and drafts), Language, Theme, Help, Terms of Service, Privacy Policy, Posting rules, About |

- Cabinet also has these states: profile loading, profile failed with Retry, and My listings with a number or without one.
- The Profile row opens Profile. Sign-in Methods, Log out and Delete account are on Profile, not on Cabinet ([30 — Identity](features/30-identity.md#profile-screens)).
- Language and Theme open bottom-sheet pickers on Cabinet.
- Notifications opens the release notification screen ([36 — Notifications](features/36-notifications.md#preferences-screen)).
- Help shows an email address and a phone number, signed in or out. There is no support chat in the release.
- Terms of Service and Privacy Policy open the web legal pages. Posting rules opens its own web page ([#527](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/527)). About shows the app name and version.
- There is no gear and no "List a car" row: the Sell tab is the only selling entry.
- Log out and a finished account deletion both land on Cabinet, signed out.
- The My listings tabs (Active, Drafts, Archive) belong to the Sell wizard, drafts and My listings design.

## Mobile navigation patterns

- **Stack navigation** inside each tab via expo-router
- **Modal sheets** for sign-in, Sort and action sheets (cancel-able from anywhere). Search parameters is a full-screen form, not a sheet.
- **Deep linking** opens at the correct nested route (e.g., `/chat/abc-123` lands inside the chat tab stack)
- **Action-gated auth** — tapping any auth-required action triggers the `(auth)/phone` modal stack with intent state; returns to original screen after success

## Admin (Next.js) — at `admin.auto.tm`

Sidebar layout. Top-bar shows admin's name + current TOTP state + logout.

| Route | Purpose |
|---|---|
| `/login` | Phone OTP + TOTP entry |
| `/reports` | MLP report queue |
| `/reports/[id]` | MLP report detail + actions |
| `/listings/[id]` | MLP listing moderation actions |
| `/users/[id]` | MLP user suspension action |
| `/audit` | MLP audit log |
| `/dashboard` | Post-MLP overview: active counts, queues, gateway health |
| `/listings` | Post-MLP listing table with filters |
| `/users` | Post-MLP user search/list |
| `/dealers` | Post-MLP dealership verification |
| `/dealers/[id]` | Post-MLP dealership detail |
| `/notifications` | Post-MLP notification broadcast |
| `/sms` | Post-MLP phone fleet health UI |
| `/catalog` | Post-MLP catalog CRUD UI unless beta-critical |
| `/settings` | Post-MLP admin profile + TOTP re-enroll |

Phase 2 additions:
| `/reports` | Inspection reports — pending, published, drafts |
| `/reports/new/[listingId]` | Create new inspection report |
| `/reports/[id]` | View / edit / publish a report |
| `/rubric` | Rubric template editor (versioned) |

## Public web (Next.js) — at `auto.tm`

Minimal — only what's needed for OG / SEO / share-link landing.

| Route | Purpose |
|---|---|
| `/[lang]` | MLP landing — simple browse/contact CTA |
| `/[lang]/listings/[id]` | Listing detail (server-rendered with full OG) |
| `/[lang]/dealers/[slug]` | Post-MLP dealer showroom (public) |
| `/[lang]/blog/[id]` | Post-MLP blog post (read-only) |
| `/[lang]/legal/privacy` | Privacy policy |
| `/[lang]/legal/terms` | Terms of service |
| `/.well-known/apple-app-site-association` | Post-MLP or beta-required iOS Universal Links manifest |
| `/.well-known/assetlinks.json` | Post-MLP or beta-required Android App Links manifest |

`/<no-lang>/path` redirects to user's preferred locale (default `/ru`).

## Deep link manifest

URLs that open the mobile app via Universal Links / App Links:

| Path | What happens |
|---|---|
| `/listings/*` | Open listing detail in app |
| `/dealers/*` | Post-MLP dealer page in app |
| `/blog/*` | Post-MLP blog post in app |
| `/chat/*` | Open contact thread (auth-gated; redirect to login if not authed) |

URLs that always open in browser (never in app):

| Path | Why |
|---|---|
| `/admin/*` | Admin is web-only |
| `/legal/*` | Legal docs are web canonical |
| `/.well-known/*` | OS-only fetches |

## Notification deep-link targets (post-MLP)

When a push notification is tapped, the app routes to:

| Notification category | Deep link target |
|---|---|
| Direct message | `/chat/<conversationId>` |
| Saved-search match | `/listings/<listingId>` (or `/me/saved-searches` if multi-match digest) |
| Listing activity | `/me/listings/<listingId>` |
| Admin announcement | In-app modal showing the announcement; deep link optional |
| Blog activity | `/blog/<postId>` |
| Marketing | Custom; usually a landing or a specific listing |

## Empty states map

Each major surface has an explicit empty state — see [`ui/75-illustration-style.md`](ui/75-illustration-style.md):

- Feed (anonymous, no recent views): "Find your next car"
- Feed (authed, no preferences): "Personalize your feed" + filter CTA
- Favorites: "Tap ♥ on listings you like"
- Conversations: "Start by messaging a seller"
- Saved searches: "Save searches to get notified" (post-MLP)
- My listings: "List your first car" + Sell CTA
- Garage: "Add a car to your garage" + benefits explainer (post-MLP)
- Notifications feed: "All caught up" (post-MLP)


## Proposed dealer and center extension, 2026-10-14

Target only, pending ADR and screen approval. The current native tab source uses Search, Favorites, Sell, Messages and Cabinet, with internal route names `(search)`, `favorites`, `sell`, `chat`, `services`. Cabinet opens a dealer workspace; there is no sixth main tab or separate dealer app. Business publishing uses the existing wizard, and ordinary detail keeps its Back/contact navigation. See [38](features/38-showroom.md) and [flow 67](flows/67-dealer-workspace-and-sharing.md).

The worker portal is a responsive internal web experience with scoped inspection permissions, not a grant of full admin access. Cars come to centers; first launch has one center in Aşgabat. [50](features/50-reports-tier.md) and [flow 66](flows/66-diagnostic-inspection.md) define private buyer and public listing report journeys. Canonical public hostname, locale routes and HTTPS app associations remain decisions; older route tables illustrate target navigation and do not evidence shipped routes or reserve a new domain.
