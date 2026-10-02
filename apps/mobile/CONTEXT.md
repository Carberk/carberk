# Mobile application

Mobile is the primary marketplace client. The route tree, API hooks, feature modules, and colocated tests establish current behavior. Use the [Listings overview](src/listings/CONTEXT.md) for create/edit, upload staging, and discovery state.

## Boundaries that matter

- External legal and listing links use `src/config/publicWebUrl.ts` and `EXPO_PUBLIC_WEB_URL`. EAS profiles select the staging or reviewer-production public web origin; the native account deletion action still opens its in-app route.
- In-app account deletion (`app/account/delete.tsx`) uses the session alone, never a code, and needs the "I understand" tick ([ADR-0032](../../docs/adr/0032-account-deletion-grace-period.md)). The API does not return the deletion date, so the app shows today plus 30 days. Success clears the session and query cache, then shows `app/account/deletion-scheduled.tsx` over signed-out Cabinet, so no Back returns to a signed-in screen. Failure keeps the User signed in on the screen.
- Support contacts live only in `src/config/supportContacts.ts`. Help, `/help`, is the only screen that shows them; there is no support chat.
- All API calls go through `src/api/client.ts`; it owns single-flight refresh, both after a 401 and before sending when the stored token has passed its lifetime ([ADR-0063](../../docs/adr/0063-mobile-refreshes-an-expired-access-token-before-sending.md)). It clears the session only on a 401 from `/auth/refresh` or a 2xx JSON body that breaks the contract; a 5xx, network failure or unreadable answer keeps it ([ADR-0077](../../docs/adr/0077-mobile-keeps-the-session-when-a-token-refresh-fails-without-a-rejection.md)). Hooks use shared contracts and query-key factories. Keep session isolation and cache cleanup when identity changes. Follow the [data-fetching guide](../../docs/agents/mobile-data-fetching.md) before changing this boundary.
- Mobile components use React Native Reusables under `components/ui`. Shared browser components are not native components. Follow the [styling guide](../../docs/agents/nativewind-v4.md); actual tokens, utilities, and fonts are in the app configuration and theme sources.
- Sign-in Methods and listing contact phones have different meanings. Preserve auth-on-action for anonymous browsing, and use the glossary when changing identity/contact flows.
- `components/auth/CodeEntryForm.tsx` is the one Sign-in Code screen for sign-in and for adding or changing a Sign-in Method. A request refused with `RATE_LIMITED` and `details.reason = "destination_limit"` (`src/auth/requestOtpError.ts`) is the daily limit: the entry screens say so, and the code screen hides Resend, stops taking digits and offers Contact support, its only link to Help. Other refusals keep the wait-a-moment copy.
- Auth-on-action stores a serializable pending action in `src/auth/intentStore.ts`. Screens replay it with `useReplayAuthAction`, or, for a screen-level consumer such as Home's feed, `useReplayAuthActionOfKind` while focused.
- Cabinet, `/(tabs)/services`, is the menu; there is no Settings screen. Its rows use `components/account/MenuRow.tsx` and never wait for the network, except the profile row, which waits for `/me`. Log out and Delete account sit at the bottom of Profile, and logging out lands on Cabinet, signed out.
- Profile changes a held Sign-in Method only after a confirm sheet, and adds a missing one directly; nothing removes one. A value another User holds is refused after the code with its own screen, `/account/sign-in-method-taken`, opened on top of Profile; it never offers to switch or merge accounts. The entry screens refuse the value the User already holds before sending a code. The code screen hands Profile its "Added" or "Changed" line through `src/auth/signInMethodNotice.ts`, shown in the page rather than as a toast so it covers no control.
- Home is the Search tab's stack root, `/(tabs)/(search)`. Import `HOME_HREF` from `src/navigation/homeHref.ts` for every "go home" navigation instead of writing the literal.
- The locked five-tab navigation and Auto.ru structural discovery reference follow [ADR-0051](../../docs/adr/0051-auto-ru-inspired-mobile-discovery-before-google-play-review.md). Read the affected approved screen specification before UI work. Do not treat an old Kolesa reference as authority for discovery.
- Chat sockets complement HTTP state. Push uses native FCM/APNS tokens; provider setup and device delivery require runtime evidence, not just passing hook tests.
- Cabinet's Notifications screen (`/notifications`, signed in only) states the device notification permission (`granted` is On; anything else is Off) and links to the app's system settings. It re-reads the permission on focus and on return to the foreground, never prompts for it, and has no category switches; the prompt stays after the first chat action.

## Native verification

Read [mobile/Expo checks](../../docs/agents/mobile-expo.md) before packages, Metro, navigation, or runtime changes. Keep `.npmrc` hoisting and explicit native dependencies. Expo Go cannot run the full app's push integration; runtime verification uses a development build. Preserve store permission restrictions and bundled native/JS release configuration rather than silently introducing an update channel.

For listing media, preserve client compression and staging safeguards in the local overview. New screens must retain localized copy, accessibility, loading/empty/error states, and theme behavior. Do not copy route inventories or old bug plans into this file.

Component tests use a test-only native host adapter with real i18n and Query
providers. See the [mobile testing guide](../../docs/agents/mobile-testing.md)
for supported queries, shared helpers and native runtime limitations.

## Start here

- [Routes and root providers](app)
- [API client and tests](src/api/client.ts)
- [Query keys](src/api/queryKeys.ts)
- [Native configuration and tests](src/config)
- [App configuration](app.config.js)
- [Native UI components](components/ui)
- [Theme utilities](tailwind.config.js)
- [Listing feature boundary](src/listings/CONTEXT.md)
