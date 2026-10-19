# 88 — Google Play Console submission pack

## Next release scope (founder direction, 2026-10-19)

The founder confirms that the app has already been released on Google Play. This work updates the existing app `com.auto_tm.ynamly`; it is not the first Android release. The exact live version and artifact are not established by this scope record.

The next release must preserve and verify sign-in, vehicle search/Listings, selling and Photos, chat/push, account controls, moderation, legal pages and backend reliability. It must also complete the full [#897 campaign](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/897): dealerships/showrooms, Listing video/views, Vehicle History, Support, diagnostic reports, analytics and operational tooling. Keep the campaign's approved tester restrictions, audiences, rights and service-activation requirements. Missing implementation or acceptance must remain explicit; a smaller marketplace-only release does not satisfy this scope.

Complete and verify this release before the broader review and disposition of remaining issues, PRs and documentation. Work outside the release moves ahead of it only when required to remove a release blocker. The signed Android artifact, deployed environment, applicable CI, native acceptance and store disclosures must agree before readiness is claimed. A GitHub release alone does not establish readiness.

The dated setup receipts and first-submission sequence below are historical. Recheck current signing, versionCode, track and disclosure state for the next artifact; do not treat an old pending step as a current failure or an old pass as current evidence. [#329](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/329) owns the signed-candidate gate. Production promotion, submission and live service activation remain separate release actions.

## Founder decisions (2026-10-06)

**The store release updates the existing Play app `com.auto_tm.ynamly`** (founder decision, 2026-10-06, [#697](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/697)). That app, the Flutter build from a year ago, has completed its closed-test requirements and can apply for production; a new app would have to repeat 12 testers for 14 days. The EAS `production` profile therefore builds package `com.auto_tm.ynamly`. The build refuses to start if the `production` profile has any other package, or if another profile sets one (`validate:eas-env`). This also settles checklist steps 10 and 11: the testing requirement is already met on this app, and the track is its existing closed track. **Before the first `production` build (checklist step 2)** the founder:

1. **Firebase.** In the production Firebase project, add an Android app with package `com.auto_tm.ynamly` (no SHA-1 needed; the app uses push only), download its `google-services.json`, and store it as the `GOOGLE_SERVICES_JSON` file variable of the EAS `production` environment. The worker's service account does not change. **Done (2026-10-06):** `GOOGLE_SERVICES_JSON` is stored in the EAS `production` environment.
2. **Upload key.** The EAS Android credentials for `com.auto_tm.ynamly` must hold the upload key Play has for the app. Upload the Flutter keystore to EAS, or request an upload key reset in Play Console (Setup, App signing) with a key EAS generates. A reset needs the new key's certificate exported as a PEM file, and Play takes up to about 48 hours to accept the new key, so start this first. Do not run a `production` build before this is settled, or EAS generates a keystore Play does not know. **In progress (2026-10-06):** the founder requested an upload key reset in Play Console and is waiting for Google's approval. The new upload certificate's SHA-1 starts `35:AF:4D:C3`. No `production` build runs before Play shows the new key.
3. **Version code.** Find the highest versionCode ever uploaded to the app in Play Console and set the EAS remote version above it (`eas build:version:set --platform android --profile production`). The `production` profile has `autoIncrement`, so each later build takes the next number. **Done (2026-10-06):** the EAS remote version is set to 4, so the first `production` build takes versionCode 5. The app's version name is 2.0.0.
4. **Store listing.** Replace the old title, icon, descriptions, screenshots, Data safety answers and privacy URL with this page's.
5. **Closed track first.** Upload the new build to the existing closed track, let the testers use it for a few days, then apply for production and answer the application's questions about that build.


The founder accepted every recommendation below on 2026-10-06 (recorded on #685). Where a row further down still says **Founder decides**, this list wins.

- **Store title:** `Carberk – Car Marketplace`. **Category:** Auto & Vehicles.
- **Developer contact email:** `bagtyyarkowusow.dev@gmail.com` until Carberk owns a domain (also the privacy and terms contact, PR 689).
- **Approximate location:** declared: collected, not shared, optional, App functionality (the seller's region and city).
- **In-app search history:** not collected. Recent searches stay on the device, and the API request log no longer keeps query strings. Subject to the Railway edge log check in checklist step 9.
- **Device or other IDs:** collected, not shared, App functionality. Required when #874 Listing views activate because its install identifier is independent of notification permission. In a push-only release, optional remains conditional on release audit item 4.
- **Fraud prevention, security, and compliance:** added as a purpose for Phone number and Other in-app messages (code rate limits, moderation of reported messages).
- **Sign-in code records:** deleted after 30 days, and at purge; the privacy policy says so.
- **Contact phone on kept Listings:** removed at purge.
- **Terms acceptance:** the "By continuing, you agree" line with links stays; no checkbox for the reviewer release.
- **Reviewer access:** one fixed code per reserved account, only in Play Console notes; a separate reserved account for deletion testing.
- **`android.allowBackup`:** `false`.
- **Later:** product analytics (#602) must update this page, the privacy policy and the Data safety form in the same change, before it ships.

## Summary

The repository answers for the reviewer-only Google Play submission: store listing copy, Data safety, permissions, App content, URLs, reviewer access, and the founder's Console steps. Each answer cites the code at `origin/main` that supports it. Entering the answers in Play Console is the founder's step, tracked on [#327](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/327) and [#391](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/391).

## How to use this page

- Checked against `origin/main` at `8016387f` on 2026-10-06. If the mobile manifest, SDK list, or a data flow changes after that commit, check the affected answers again before entering them.
- **Founder decides:** marks an answer the code does not settle, with the options. The page recommends an option where it has one, and the founder chooses.
- **Release audit:** marks something to confirm on the EAS-built AAB under [#325](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/325) and [#329](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/329). A local build or `app.config.js` does not prove the shipped manifest.
- This page never holds a reviewer phone number, email address, code, or other credential. Those go only into Play Console's App access form and the operator's secret store.
- Terms follow the [glossary](../../domain/GLOSSARY.md): User, Sign-in Method, Sign-in Code, Display Name, Listing, Verified Contact Phone, Conversation, Message, Content Report. Store copy uses plain words for buyers.

Google sources (read 2026-10-06): [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469), [App content / prepare for review](https://support.google.com/googleplay/android-developer/answer/9859455), [sign-in details for review](https://support.google.com/googleplay/android-developer/answer/15748846), [account deletion](https://support.google.com/googleplay/android-developer/answer/13327111), [UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937), [content ratings](https://support.google.com/googleplay/android-developer/answer/9898843) and [rating requirements](https://support.google.com/googleplay/android-developer/answer/9859655), [target audience](https://support.google.com/googleplay/android-developer/answer/9867159), [Financial features](https://support.google.com/googleplay/android-developer/answer/13849271), [Health apps](https://support.google.com/googleplay/android-developer/answer/14738291), [government information](https://support.google.com/googleplay/android-developer/answer/9514050), [advertising ID](https://support.google.com/googleplay/android-developer/answer/6048248), [photo and video permissions](https://support.google.com/googleplay/android-developer/answer/14115180), [listing text limits](https://support.google.com/googleplay/android-developer/answer/9859152), [listing assets](https://support.google.com/googleplay/android-developer/answer/9866151). Firebase's own disclosure: [Firebase data for Play Data safety](https://firebase.google.com/docs/android/play-data-disclosure).

## 1. Store listing copy

Limits: app name 30 characters, short description 80, full description 4,000 ([listing text limits](https://support.google.com/googleplay/android-developer/answer/9859152)). The counts below are Unicode characters, checked with a script. **The RU and TK texts need a native speaker's read before entry.** The TK text uses "akkaunt" for account, as the founder decided on [#427](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/427) and the 2026-10-04 checkpoint on [#320](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/320). The app's own Turkmen strings still say "Hasaby poz" (`apps/mobile/src/i18n/resources.ts`), so the store text and the app differ until #427's copy change lands.

What the copy is allowed to say, and where the code shows it:

| Claim | Evidence |
|---|---|
| Cars only, Turkmenistan, prices in TMT | Catalog brands/models; `priceTmt` on `Listing` in `packages/db/prisma/schema.prisma` |
| Search by brand and model in RU/EN/TK spellings and years; filters for city, price, year, condition; sort | `apps/mobile/src/listings/CONTEXT.md` (Home, Search, Results) |
| Favorites | `app/(tabs)/favorites.tsx`, `src/api/listings/useFavoriteListing.ts` |
| Messages with text and photos; notification on a new Message if allowed | `app/conversations/[id].tsx`, `src/api/conversations/useSendImageMessage.ts`, `src/notifications/useChatPushTokenRegistration.ts` |
| Call the seller | Contact bar on Listing detail (`app/(public)/listings/[id].tsx`) |
| Report a Listing, a Message or a user; block a user | `src/admin/components/ReportSheet.tsx`, `MessageReportSheet.tsx`, `src/api/identity/useBlockUser.ts` |
| Sell with up to 20 photos, from the gallery or the camera | `src/listings/wizard/Step2Photos.tsx`; posting rules in [83-legal](83-legal.md#posting-rules--required-sections) |
| Publishing needs a +993 contact phone confirmed by SMS code | [ADR-0056](../../adr/0056-listing-contact-phones-are-verified.md); `app/listings/contact-phone.tsx`, `contact-phone-code.tsx` |
| Edit, mark sold, archive, republish | `src/api/listings/useEditListing.ts`, `useMarkSold.ts`, `useArchiveListing.ts`, `useRepublishListing.ts` |
| Sign in with a code by phone or email, no password; browse without an account | `app/(auth)/phone.tsx`, `app/(auth)/email.tsx`, `src/auth/intentStore.ts` |
| Delete the account in the app or on the web | `app/account/delete.tsx`; `apps/web/src/app/[locale]/account/delete/page.tsx` |
| RU, TK, EN | `apps/mobile/src/i18n/resources.ts` |

Do not claim: payments or deals in the app, dealers or dealer pages, VIN decoding or vehicle history ([ADR-0053](../../adr/0053-defer-vin-decoding-until-a-real-decoder-exists.md)), inspection reports (the `InspectionInterestCta` component exists but no screen renders it), sharing (no share code exists in `apps/mobile`, [#495](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/495)), saved searches or alerts, a "phone verified" badge (no such string is in the mobile resources), profile photos until [#643](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/643) ships the screen (the API from [#642](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/642) can set `avatarKey`, but no app screen calls it), or support chat.

**Decided (founder, 2026-10-06):** the store title is `Carberk – Car Marketplace`. The alternative was the brand alone, `Carberk`. Google forbids keyword stuffing in titles; a short descriptor is allowed.

### English

- **App name** (24): `Carberk – Car Marketplace`
- **Short description** (75): `Buy and sell cars in Turkmenistan. Message sellers and save your favorites.`
- **Full description** (1,307):

```text
Carberk is a marketplace for cars in Turkmenistan. Browse cars for sale, contact sellers, and keep the cars you like in Favorites.

Find a car
• Search by brand and model. Russian, Turkmen and English spellings work, and so does a model year.
• Filter by city, price, year and condition, and sort the results.
• Open a listing to see its photos, price in TMT, mileage, gearbox, fuel, city and the seller's description.

Contact the seller
• Call the seller or send a message in the app.
• Send photos in a chat. If you allow notifications, Carberk tells you when a new message arrives.
• Report a listing, a message or a user, and block anyone you don't want to hear from.

Sell your car
• Create a listing with up to 20 photos, taken with the camera or picked from your gallery.
• Publishing needs a Turkmenistan (+993) contact phone, confirmed with an SMS code. Buyers see that number on your listing.
• Edit your listings, mark a car as sold, archive it and publish it again.

Your account
• Sign in with a code sent to your phone or email. There is no password.
• You can browse without an account.
• You can delete your account in the app or on our website.

Carberk is in Russian, Turkmen and English. Carberk does not sell cars and does not take payments. Buyers and sellers agree on the deal themselves.
```

### Russian (needs a native speaker's read)

- **App name** (18): `Carberk – авторынок`
- **Short description** (73): `Покупайте и продавайте авто в Туркменистане. Чат с продавцом и избранное.`
- **Full description** (1,409):

```text
Carberk — площадка для покупки и продажи автомобилей в Туркменистане. Смотрите объявления, связывайтесь с продавцами и сохраняйте понравившиеся машины в избранное.

Найдите машину
• Ищите по марке и модели. Поиск понимает написание на русском, туркменском и английском, а также год выпуска.
• Фильтруйте по городу, цене, году и состоянию, сортируйте результаты.
• В объявлении — фото, цена в манатах, пробег, коробка передач, топливо, город и описание продавца.

Свяжитесь с продавцом
• Позвоните продавцу или напишите ему в приложении.
• Отправляйте фото в чате. Если вы разрешите уведомления, Carberk сообщит о новом сообщении.
• Пожалуйтесь на объявление, сообщение или пользователя и заблокируйте того, от кого не хотите получать сообщения.

Продайте свою машину
• Создайте объявление с фото (до 20): снимите камерой или выберите из галереи.
• Для публикации нужен контактный телефон Туркменистана (+993), подтверждённый кодом из SMS. Покупатели увидят этот номер в объявлении.
• Редактируйте объявления, отмечайте машину проданной, отправляйте в архив и публикуйте снова.

Ваш аккаунт
• Вход по коду, который приходит на телефон или почту. Без пароля.
• Смотреть объявления можно без аккаунта.
• Удалить аккаунт можно в приложении или на нашем сайте.

Carberk работает на русском, туркменском и английском. Carberk не продаёт машины и не принимает платежи. О сделке покупатель и продавец договариваются сами.
```

### Turkmen (needs a native speaker's read)

Play Console has no Turkmen store listing language (founder check, 2026-10-08). **Decided (founder, 2026-10-09):** the Turkmen text, feature graphic and screenshots are entered under the Turkish (`tr-TR`) listing, and that listing is the app's default language; English and Russian are translations. The founder accepts that phones set to Turkish see Turkmen text. This replaces the earlier note that kept the Turkmen text out of the store. The English description still ends with a short Turkmen paragraph. The files are in [`play-console-submission/`](play-console-submission/README.md).

- **App name** (24): `Carberk – awtoulag bazary`
- **Short description** (72): `Türkmenistanda awtoulag satyň we satyn alyň. Satyjy bilen çat, halanlar.`
- **Full description** (1,414):

```text
Carberk — Türkmenistanda awtoulag satmak we satyn almak üçin bazar. Bildirişleri görüň, satyjylar bilen habarlaşyň we halan maşynlaryňyzy Halanlarym bölümine goşuň.

Maşyn tapyň
• Marka we model boýunça gözläň. Gözleg rus, türkmen we iňlis dilindäki ýazylyşy hem-de öndürilen ýyly düşünýär.
• Şäher, baha, ýyl we ýagdaý boýunça süzüň, netijeleri tertiplen.
• Bildirişde suratlar, manatdaky bahasy, geçen ýoly, tizlikler gutusy, ýangyjy, şäheri we satyjynyň beýany bar.

Satyjy bilen habarlaşyň
• Satyja jaň ediň ýa-da programmada hat ýazyň.
• Çatda surat iberiň. Bildirişlere rugsat berseňiz, Carberk täze habar gelende size habar berer.
• Bildiriş, habar ýa-da ulanyjy barada şikaýat ediň we islemeýän adamyňyzy bloklaň.

Maşynyňyzy satyň
• 20-ä çenli surat bilen bildiriş dörediň: kamera bilen surata alyň ýa-da galereýadan saýlaň.
• Çap etmek üçin SMS kody bilen tassyklanan Türkmenistanyň (+993) habarlaşmak telefony gerek. Alyjylar bu belgini bildirişiňizde görer.
• Bildirişleriňizi üýtgediň, maşyny satyldy diýip belläň, arhiwe geçiriň we täzeden çap ediň.

Siziň akkauntyňyz
• Telefonyňyza ýa-da e-poçtaňyza gelen kod bilen giriň. Açar söz ýok.
• Bildirişleri akkauntsyz hem görüp bilersiňiz.
• Akkauntyňyzy programmada ýa-da web sahypamyzda pozup bilersiňiz.

Carberk rus, türkmen we iňlis dillerinde işleýär. Carberk maşyn satmaýar we töleg kabul etmeýär. Alyjy bilen satyjy söwda barada özleri ylalaşýarlar.
```

### Graphics

- Icon and feature graphic follow [#323](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/323) (approved red tile with white `a.`).
- Phone screenshots come from the physical-Android proof in [#345](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/345). **Screenshots and the feature graphic must show no car brand logos** ([#350](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/350), comment on #327). Capture the brand picker and cards from data where brands show the letter mark. The demo inventory seed ([#703](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/703)) uses real photographs of real cars whose badges are visible, so screenshots must be framed or cropped to hide badges, or taken on Listings where none shows. Show no Share control, no real phone numbers, and no reviewer account values.
- **Decided (founder, 2026-10-06):** the app category is Auto & Vehicles. `Shopping` was the alternative.

## 2. Data safety answers

Google's definitions decide each answer ([Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)):

- **Collected** means the data leaves the device, including data sent by SDKs in the app.
- **Shared** means a transfer to a third party. Transfers to a **service provider** that processes data on Carberk's behalf and under its instructions are not sharing. Neither is a transfer the user starts and reasonably expects, such as a Listing or a Message other Users can see.
- **Optional** means the user can use the app without providing it. Browsing needs no account (auth-on-action, `apps/mobile/src/auth/intentStore.ts`), and every account field depends on a choice the User makes. Account data is therefore optional.

### Who receives data, and why none of it is "shared"

| Recipient | What it receives | Code | Answer |
|---|---|---|---|
| Railway (hosting for api, worker, web, admin, Postgres, Redis, MinIO) | Everything Carberk stores | [ADR-0039](../../adr/0039-phased-cloud-first-hosting.md) | Service provider. Not shared. |
| Resend (email delivery, US, 30-day records) | The email address and the message containing the Sign-in Code | `apps/worker/src/queues/email-code.processor.ts`; [ADR-0055](../../adr/0055-resend-sends-sign-in-codes-from-the-worker.md) | Service provider. Not shared. ADR-0055 already records "not shared". |
| Google Firebase Cloud Messaging | The device push token, and a notification whose body carries up to 100 characters of the Message text | `apps/worker/src/queues/notification-fanout.processor.ts`; `apps/api/src/modules/notifications/domain/DirectMessageNotification.ts`, `domain/types.ts` (`DIRECT_MESSAGE_PREVIEW_MAX_LENGTH = 100`) | Service provider. Not shared. |
| Firebase SDK in the app (through `expo-notifications`) | Firebase installation ID, app version, and Firebase user agent (device metadata, OS and SDK versions), sent by the SDK itself | `apps/mobile/package.json` (`expo-notifications`); `ExpoFirebaseMessagingService` in the `expo-notifications` Android manifest; [Firebase disclosure](https://firebase.google.com/docs/android/play-data-disclosure) | Collected. Service provider. Not shared. |
| Other Users | Listings, the Listing contact phone, Display Name, Messages in their own Conversations | Listing detail and Conversation screens | The User publishes or sends these. Not shared. |
| Carberk moderators | Reported Listings, Messages and Users, through the admin app | `apps/admin/src/app/(admin)/reports`; `apps/api/src/modules/admin/application` | Carberk itself. Not a third party. |

No advertising, analytics or crash SDK is a dependency of `apps/mobile/package.json`, `apps/api/package.json`, `apps/worker/package.json` or `apps/web/package.json`. Monitoring comes after the reviewer submission ([#602](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/602), [#608](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/608)). A build that adds one needs a new Data safety review.

### Data types

Every type below is **encrypted in transit**. The production EAS profile refuses API, socket and media URLs that are not `https:` or `wss:` (`apps/mobile/src/config/easBuildProfileValidation.ts`, lines 140–142), and #325 found no cleartext setting in the release manifest. Uploads use presigned URLs from the API. **Release audit:** confirm the presigned upload host in reviewer production is `https`.

Deletion: Users can **request deletion**. In the app it is Cabinet > Profile > Delete account (`apps/mobile/app/account/delete.tsx`). On the web it is the deletion page (`apps/web/src/app/[locale]/account/delete/page.tsx`). After 30 days, `apps/worker/src/jobs/PurgeExpiredAccounts.ts` clears the Sign-in Methods, the Display Name and avatar fields, retires the Profile Photo's upload so that the retired-upload sweep deletes its files (see Gaps, item 7), and deletes sessions, push devices, notification history, favorites, drafts, blocks, Verified Contact Phones and the User's Sign-in Code request rows, and clears the contact phone on the Listings it keeps. The same job deletes every Sign-in Code request row older than 30 days. Listings, Messages, Content Reports and audit rows are kept with "Deleted user" attribution, as the privacy policy says ([83-legal](83-legal.md#privacy-policy--required-sections)). See [Gaps](#gaps-that-could-make-a-declaration-untrue) for data the purge does not reach.

| Category → type | Collect? | What and where | Shared | Optional? | Purposes |
|---|---|---|---|---|---|
| Personal info → **Email address** | Yes | Email Sign-in Method `User.email` (`schema.prisma`), `app/(auth)/email.tsx`, `app/account/add-email.tsx`; Sign-in Code request rows `OtpRequest.destination` | No (Resend is a service provider) | Optional | App functionality, Account management. Not processed ephemerally. This is the #391 answer, matching ADR-0055. |
| Personal info → **Phone number** | Yes | Phone Sign-in Method `User.phone`; Verified Contact Phone and `Listing.contactPhone`, shown on the Listing (`schema.prisma`, `app/listings/contact-phone.tsx`); `OtpRequest.destination` | No | Optional (email-only Users exist; publishing a Listing needs a contact phone) | App functionality, Account management. Also tick Fraud prevention, security, and compliance (founder decision, 2026-10-06), because per-number code limits use it (`OtpAttemptLedger.ts`). |
| Personal info → **Name** | Yes | Display Name the User sets (`app/account/display-name.tsx`, `User.displayName`). A User who sets none shows a Generated Name, which the server makes from a number and is not the person's name. | No | Optional | App functionality |
| Personal info → **User IDs** | Yes | Account ID (`User.id`) tied to sessions, Listings, Conversations and reports | No | Optional | App functionality, Account management |
| Personal info → Address, race, beliefs, orientation, other | No | — | — | — | — |
| Location → **Approximate location** | Yes (founder decision, 2026-10-06) | The seller picks the Listing's city and region and may type an area (`Listing.cityId`, `regionId`, free-text `locationText` up to 200 characters, `src/listings/wizard/Step6Location.tsx`). Search sends a chosen city as a filter. The app has no location permission or SDK. IP addresses are stored for rate limiting (`OtpRequest.ip`, `apps/api/src/common/client-ip.ts`) and are not used to infer location. | No | Optional | App functionality |
| Location → Precise location | No | No location permission (section 3). **Release audit:** see the photo metadata item in Gaps. | — | — | — |
| Photos and videos → **Photos** | Yes | Listing photos (`src/listings/wizard/Step2Photos.tsx`, compressed by `src/listings/uploadStaging/compressor.ts`); chat images (`src/conversations/components/MessageComposer.tsx`, `src/conversations/upload/chatImageUpload.ts`). Profile Photos join this row when #643 ships the screen; they use the Listing photo upload route. Stored in MinIO on Railway. | No | Optional | App functionality |
| Photos and videos → Videos, audio, voice, music | No | `RECORD_AUDIO` is blocked and there is no video upload in the app (`app.config.js`) | — | — | — |
| Messages → **Other in-app messages** | Yes | `Message.body` and image metadata (`schema.prisma`); copies attached to Message reports (`ContentReport.messageContext`); push preview text | No (FCM is a service provider) | Optional | App functionality. Also tick Fraud prevention, security, and compliance (founder decision, 2026-10-06), because moderators read reported Messages. |
| Messages → Emails, SMS or MMS | No | The app reads no SMS or email. The Sign-in Code emails Carberk sends are not user messages the app collects. | — | — | — |
| App activity → **Other user-generated content** | Yes | Listing fields (description, price, mileage, optional VIN, area text), Content Report reason and details (`ContentReport`) | No | Optional | App functionality. Fraud prevention, security, and compliance for reports. |
| App activity → **Other actions** | Yes | Favorites (`Favorite`), blocks (`BlockedUser`), Conversation read watermarks and mutes (`src/api/conversations/useUpdateWatermark.ts`, `useMuteConversation.ts`) | No | Optional | App functionality |
| App activity → **In-app search history** | No (founder decision, 2026-10-06) | Recent searches stay on the device ([#344](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/344) decision). No table stores searches. The API's request logger (`apps/api/src/common/requestLogging.ts`) writes each request path without its query string or parsed query, so no search term reaches the API request log; `requestLogging.spec.ts` proves it on the Nest Fastify stack. Railway's own edge HTTP log records a path per request and is outside the app: check one typed search, `GET /api/v1/catalog/search?q=…`, there before submission (founder checklist). | No | Optional | — |
| App activity → **App interactions** | Yes when Listing views activate under #874 | Full Listing detail view signal, deduplicated per install/Listing/Ashgabat day. Only daily salted fingerprints retained for two days; durable daily/lifetime counts. No analytics SDK. | No | Required when the feature is enabled | App functionality |
| App activity → Installed apps | No | No installed-app inventory is collected. | — | — | — |
| App info and performance → Crash logs, Diagnostics, other | No | No crash or performance SDK. `components/ErrorBoundary.tsx` only writes to the device console. Play's Android vitals are Google's own collection, not the app's. | — | — | — |
| Device or other IDs | Yes | #874 random install ID when Listing views are enabled, sent only in the dedicated view header and persisted server-side only as a two-day salted fingerprint; FCM device token (`FcmDevice.token`, registered only after the notification permission is granted, `src/notifications/useChatPushTokenRegistration.ts`); Firebase installation ID sent by the Firebase SDK | No | Required when #874 activates; push-only release optional conditional on release audit item 4 | App functionality |
| Financial info, Health and fitness, Contacts, Calendar, Web browsing, Files and docs | No | No such feature or permission | — | — | — |

**Decided (founder, 2026-10-06): Approximate location is declared: collected, not shared, optional, App functionality** (the seller's region and city). That matches the privacy policy, which lists "Location: the region and city you select" (`apps/web/src/app/[locale]/legal/content.ts`, line 33), and Google rejects mismatches between the privacy policy and the form. The alternative was not to declare it, treating the city as a fact about the car the seller describes rather than the User's location.

**In-app search history (decided, founder, 2026-10-06: not declared).** Option A is to declare it as collected, optional, for App functionality, because search URLs stay in Railway logs. Option B is to stop logging query strings before submission (a code change on its own issue) and declare nothing. Recommended: B, then not declared. Until B ships, A is the truthful answer. **Decided: B, and B has shipped** (PR 690, completed by PR 692), so nothing is declared, subject to the Railway edge log check above.

**Push-only release decision (founder, 2026-10-06): Device or other IDs is optional, conditional on release audit item 4. When #874 Listing views activate, the random install ID makes Device or other IDs required for that build, independently of notification permission.** Carberk registers the token only after the User grants notifications. By default, though, Firebase Messaging may fetch a token and installation ID when the app starts, whatever the permission. If the release audit shows a token or installation ID is fetched before the User grants notification permission, the answer must be "required" instead.

Other form questions:

- Does the app collect or share any of the required user data types? **Yes.**
- Is all user data encrypted in transit? **Yes** (above).
- Account creation: Users create accounts by phone number or email with a one-time code. There is no password and no third-party sign-in. Pick the Console option that matches. Its wording is account-specific.
- Do you provide a way for users to request that their data be deleted? **Yes.** Delete account URL: section 5.
- Independent security review: **No.**

## 3. Permissions declaration

Sources: `apps/mobile/app.config.js` (`android.permissions: ["CAMERA"]`, `blockedPermissions`, plugin options), guarded by `apps/mobile/src/config/easBuildConfig.spec.ts` ("keeps Play-restricted media, audio, and overlay permissions out of the Android build"). Library manifests at the installed versions: `expo-image-picker` 55.0.24, `expo-camera` 55.0.23, `expo-notifications` 55.0.27, `expo-file-system` 55.0.26, `@react-native-community/netinfo` 11.5.2. The merged list is the one #325 recorded from a local release build of `469b5dc`.

| Permission | Source | Why | Play declaration |
|---|---|---|---|
| `CAMERA` | `app.config.js`; `expo-camera`, `expo-image-picker` | Take a photo of the car in the Sell wizard (`launchCameraAsync`, `Step2Photos.tsx`) | None. Runtime prompt only. |
| `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` | React Native, netinfo | API calls; offline state for the upload queue | None |
| `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (`maxSdkVersion=32`) | `expo-image-picker`, `expo-file-system` | Picking photos on Android 12L and below | None. Not the restricted `READ_MEDIA_*` permissions. |
| `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` | `expo-notifications` | New-Message notifications; asked after the first chat action | None |
| `WAKE_LOCK`, `com.google.android.c2dm.permission.RECEIVE` | Firebase Messaging | Receive FCM messages | None |
| `VIBRATE`, launcher badge permissions | `expo-notifications` | Notification behaviour | None |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | `expo-secure-store` (androidx.biometric) | Pulled in by the library. The app stores tokens in SecureStore and asks for no biometric. | None |
| `BIND_GET_INSTALL_REFERRER_SERVICE` | Install referrer library (#325) | No app code calls an install-referrer API (`apps/mobile` has no `getInstallReferrer` or `expo-application` use) | None |
| `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | androidx.core | Library internal | None |

Blocked in `app.config.js`: `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`. Photo selection uses the system photo picker, so the [photo and video permissions](https://support.google.com/googleplay/android-developer/answer/14115180) declaration does not apply. Nothing requests location, contacts, SMS, call log, or accessibility. No foreground service type is declared in these library manifests.

**Release audit (#325 on the EAS AAB, then #329):**

1. The merged manifest has none of `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_VISUAL_USER_SELECTED`, `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `ACCESS_*_LOCATION`, `ACCESS_MEDIA_LOCATION`, or any `FOREGROUND_SERVICE*`.
2. `com.google.android.gms.permission.AD_ID` is absent. Then the [advertising ID](https://support.google.com/googleplay/android-developer/answer/6048248) answer is "No". If it is present, find which library adds it and remove it with `tools:node="remove"` on its own issue, or answer truthfully.
3. Name the library that adds `BIND_GET_INSTALL_REFERRER_SERVICE`.
4. Record whether Firebase Messaging auto-init sends a token request, or the Firebase SDK sends an installation ID, before notification permission is granted. That settles the Device IDs optional question.
5. `android:allowBackup="true"` was the Expo default (#325, finding 1). It does not change a Data safety answer, because backup goes to the User's own Google account. **Resolved**: `allowBackup` is now `false` (founder decision, 2026-10-06).
6. `expo-camera` is installed but no app code imports it (#325, finding 2). It adds `CAMERA`, which `expo-image-picker` needs anyway.

The UI polish PR ([#696](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/696)) may add native packages or upgrade the Expo SDK. If it merges before submission, recheck this section and the release audit on the build that includes it.

## 4. App content answers

| Form | Answer | Evidence |
|---|---|---|
| Privacy policy | URL in section 5 | `apps/web/src/app/[locale]/legal/privacy/page.tsx`; linked in the app from Cabinet (`app/(tabs)/services.tsx`) and the sign-in screen (`components/auth/AuthEntryScreen.tsx`) |
| Ads | **No ads** | No ad SDK in `apps/mobile/package.json`; AD_ID absent in #325's merged list (recheck in the release audit) |
| App access | Some functionality is restricted; give instructions (section 6) | Selling, Messages, Favorites and Cabinet need sign-in |
| Content rating | Questionnaire inputs below | — |
| Target audience | **18 and over only.** Not designed for children. No appeal to children in the listing or the app. | Terms: "must be at least 18" (`apps/web/src/app/[locale]/legal/content.ts`, line 280); privacy: not intended for under-18s (line 84) |
| News apps | **No** | No news or editorial content in the app. Bortzhurnal is not built. |
| COVID-19 apps | **No** | — |
| Data safety | Section 2 | — |
| Government apps | **No.** Not developed by or for a government. | — |
| Financial features | **The app provides no financial features.** | No payments, loans, trading or wallets. Sellers can mark a Listing as accepting exchange or installments (`installmentAvailable`, `acceptsExchange` in `src/listings/wizard/Step5Price.tsx`), but that is a seller's offer, and the app offers no credit or payment. |
| Health apps | **No health features** | — |
| Advertising ID | **No** (pending release audit item 2) | — |

### Content rating questionnaire inputs

The questionnaire asks about the app's content and its interactive features ([rating requirements](https://support.google.com/googleplay/android-developer/answer/9859655)). The exact questions appear in Console. These are the facts to answer them with:

- Category: a reference, utility or other non-game app. Not a game.
- No violence, sexual content, profanity, drugs, gambling or simulated gambling produced by Carberk.
- **Users can interact and exchange content: yes.** Users write to each other in Conversations with text and photos, and publish Listings with photos and free text.
- **Shares the user's location with other users: no** as a device location. A Listing shows the city the seller picked.
- **Digital purchases: no.**
- **Unrestricted internet access** (a browser): no. The app opens only its own legal pages in the system browser (`src/config/publicWebUrl.ts`).
- Personal information visible to other users: the Display Name and the Listing contact phone the seller chose.

### User-generated content

| UGC requirement ([policy](https://support.google.com/googleplay/android-developer/answer/9876937)) | Carberk | Evidence |
|---|---|---|
| Users accept the terms before creating UGC | Sign-in entry screen: "By continuing, you agree to the Terms and Privacy Policy", with links. Signing in is needed before posting or sending. The Check step links the posting rules before Publish. | `components/auth/AuthEntryScreen.tsx`; `src/listings/wizard/CheckAndPublish.tsx` (line 345); [83-legal consent UX](83-legal.md#consent-ux-in-auth) |
| Objectionable content defined and prohibited | Terms (prohibited content) and posting rules | `apps/web/src/app/[locale]/legal/terms/page.tsx`, `legal/posting-rules/page.tsx` |
| In-app reporting of content and users | Report a Listing (spam, scam, misleading, wrong category, other), a user (spam, scam, misleading, harassment, other), or a Message | `src/admin/components/ReportSheet.tsx` (lines 38–52), `MessageReportSheet.tsx`; used in `app/(public)/listings/[id].tsx` and `app/conversations/[id].tsx` |
| Blocking for one-to-one interaction | Block and unblock in a Conversation; blocked Users cannot send | `app/conversations/[id].tsx` (lines 153–256), `src/api/identity/useBlockUser.ts` |
| Ongoing moderation | Admin app with reports queue, report detail, block or unblock a Listing, suspend or unsuspend a User, audit log. Admin actions need TOTP. | `apps/admin/src/app/(admin)/reports`, `users/[id]`, `listings/[id]`, `audit`; `apps/api/src/modules/admin/application/BanListing.ts`, `SuspendUser.ts`, `DismissReport.ts` |
| Posting rules URL | Section 5 | — |

**Decided (founder, 2026-10-06):** the implicit "By continuing, you agree" line stays, with no checkbox for the reviewer release. 83-legal chose implicit agreement unless legal review asks for recorded acceptance, and Google's wording asks only that users accept before creating UGC.

## 5. URLs

Hosts come from [83-legal](83-legal.md#where-they-live) and `eas.json` (`production` and `production-smoke`: `EXPO_PUBLIC_WEB_URL = https://autotm.bagtyyar.dev`). The app builds the links in `apps/mobile/src/config/publicWebUrl.ts` (`legalPageUrl`).

**Hosts the store build talks to** ([#700](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/700), founder decision 2026-10-06): the production API on `api.autotm.bagtyyar.dev` and media on `media.autotm.bagtyyar.dev`, custom domains on the Railway production services. The `production` build refuses any host outside `autotm.bagtyyar.dev` or `auto.tm`, and any Railway-generated host. Before the first `production` build the founder:

1. Brings the production API up on current `main` ([#375](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/375)). **Done (2026-10-06):** the production API, worker, web and admin are deployed on current `main`; `https://api.autotm.bagtyyar.dev/readyz` answers 200 and the account deletion page answers 200. Earlier on 2026-10-06 the production `api` and `admin` services had no active deployment, so both API domains answered "Application not found". Then confirm that both custom domains show a valid certificate in Railway and that `https://media.autotm.bagtyyar.dev/minio/health/live` answers 200. The media domain must target MinIO's S3 port 9000, not the console on 9001. `/readyz` reaches MinIO over the private endpoint, so it says nothing about the media host.
2. Sets `MINIO_PUBLIC_URL=https://media.autotm.bagtyyar.dev` on the Railway **production** API service (the worker does not read it) and redeploys. **Done (2026-10-06):** `MINIO_PUBLIC_URL` is set on the production API. Presigned uploads are signed against this host, so a wrong value breaks every upload while existing photos still load: after the switch, check that a Listing photo loads, and that one Listing photo and one chat image upload succeed. No CORS change is needed: the API enables no HTTP CORS, and the app's socket is websocket-only, which `SOCKET_IO_CORS_ORIGIN` does not gate.
3. Sets the EAS `production` environment variables `EXPO_PUBLIC_API_URL=https://api.autotm.bagtyyar.dev/api/v1`, `EXPO_PUBLIC_WS_URL=wss://api.autotm.bagtyyar.dev/ws/chat` and `EXPO_PUBLIC_MEDIA_URL=https://media.autotm.bagtyyar.dev`. **Done (2026-10-06):** the three `EXPO_PUBLIC_*` URLs are set in the EAS `production` environment.

| Console field | URL | Status |
|---|---|---|
| Privacy policy | `https://autotm.bagtyyar.dev/en/legal/privacy` | Must load from an outside network before submission ([#496](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/496)) |
| Terms (store listing website or description link, if used) | `https://autotm.bagtyyar.dev/en/legal/terms` | Must load from an outside network before submission (#496) |
| Posting rules (UGC evidence) | `https://autotm.bagtyyar.dev/en/legal/posting-rules` | Must load from an outside network before submission (#496) |
| Delete account URL (Data safety) | `https://autotm.bagtyyar.dev/en/account/delete` | Must load from an outside network before submission (#496) |

Check the `ru` and `tk` versions of each path the same way. The deletion page must name Carberk and show the deletion steps prominently ([account deletion](https://support.google.com/googleplay/android-developer/answer/13327111)).

**Decided (founder, 2026-10-06):** the developer contact email on the store listing is `bagtyyarkowusow.dev@gmail.com` until Carberk owns a domain (also the privacy and terms contact, PR 689). The app's Help screen reads its support contacts from `apps/mobile/src/config/supportContacts.ts`; the store contact should match it or replace it on purpose.

## 6. Reviewer access instructions template

Google requires sign-in details that work at all times, from any location, in English, and that get past one-time codes ([sign-in details](https://support.google.com/googleplay/android-developer/answer/15748846)). Carberk's reviewer bypass does this. With `REVIEW_DEMO_ACCOUNT_ENABLED`, `REVIEW_DEMO_ACCOUNTS_JSON` holds three to five reserved accounts. Each has a `+993` phone, an email and a fixed six-digit code (`apps/api/src/env.schema.ts`, lines 226–308). Production has five reserved accounts (2026-10-06). The template lists three roles — buyer, seller and a deletion test — and the remaining reserved accounts are spares that are not listed for reviewers.

- For a reserved **email**, the API stores a request with the fixed code and sends no email (`RequestOtp.ts`, lines 108–139). The request still counts against the limit of **5 code requests per address per 24 hours** and 10 per IP address per hour, and the email code expires after 10 minutes (`OtpAttemptLedger.ts`, `SignInCodeDestination.ts`). Reserved emails have no exemption ([ADR-0055](../../adr/0055-resend-sends-sign-in-codes-from-the-worker.md)).
- For a reserved **phone**, the request returns without an issued code row or a daily request limit, and the fixed code signs in outside a temporary verification lock. Five failed attempts within 15 minutes lock that destination for 15 minutes from the fifth failure. Correct codes are also refused during that lock; retrying or tapping Resend does not extend or clear it. The shared Redis budget survives API instance changes. See `RequestOtp.ts`, `VerifyOtp.ts` and [ADR-0092](../../adr/0092-temporary-failure-limits-for-fixed-code-phone-sign-in.md).
- The bypass signs in only existing buyer or seller accounts. It never authorizes deletion by code, a Sign-in Method change, or a Listing contact-phone code (`apps/api/src/modules/identity/CONTEXT.md`).
- The reserved accounts must exist, seeded, before review. The seller account needs a phone Sign-in Method so it can use that number as its Listing contact phone without an SMS. The seller's own sign-in phone passes the publish check (`apps/api/src/modules/listings/domain/ContactPhonePolicy.ts`, [ADR-0081](../../adr/0081-contact-phone-confirmation-api-for-listings.md)). Contact-phone codes never use the reviewer bypass, and SMS is mocked on Railway, so a reviewer cannot confirm any other number.

Paste into Console > App access, replacing every `<...>` from the operator's secret store. Keep the real values out of git and issues.

```text
Carberk is a car marketplace for Turkmenistan. Browsing needs no account. Selling, messages, favorites and the profile need sign-in. Sign-in uses a one-time code; there is no password. These accounts work from any country.

MAIN SIGN-IN: EMAIL
1. Open the Cabinet tab and tap Sign in (or tap any action that needs an account).
2. Choose Email and enter: <REVIEWER_BUYER_EMAIL>
3. Tap Send code. No email is sent to this reserved address. Enter the code: <REVIEWER_BUYER_CODE>
Please reuse this account's code for its later sign-ins; each account has its own code. Each "Send code" counts toward a limit of 5 per address per 24 hours, so do not tap Resend repeatedly. If the limit is reached, use the phone sign-in below for the same account.

ALTERNATIVE SIGN-IN: PHONE
Choose Phone and enter <REVIEWER_BUYER_PHONE> (Turkmenistan +993). Enter the code <REVIEWER_BUYER_CODE>. This path has no daily code-request limit. After five failed sign-in attempts, wait 15 minutes before trying this phone again. Repeated retries or Resend will not clear the temporary lock. You may use the email option within its limits, or another account listed below.

ACCOUNTS
- Buyer: email <REVIEWER_BUYER_EMAIL>, phone <REVIEWER_BUYER_PHONE>, code <REVIEWER_BUYER_CODE>
- Seller: email <REVIEWER_SELLER_EMAIL>, phone <REVIEWER_SELLER_PHONE>, code <REVIEWER_SELLER_CODE>
- Account deletion test: email <REVIEWER_DELETION_EMAIL>, phone <REVIEWER_DELETION_PHONE>, code <REVIEWER_DELETION_CODE>

WHAT TO TRY
- As the buyer: search for a car, open a listing, add it to Favorites, tap Message and send text and a photo.
- As the seller: open Messages and reply. Open Sell to create a listing; the seller's phone is already confirmed as its contact phone.
- Report and block: in a conversation, open the menu to report a message or the user, or block the user. On a listing, use Report.
- Delete account: use only the deletion test account. Cabinet > Profile > Delete account. Signing in again within 30 days restores it.
- Notifications: allow them when asked after the first message to receive new-message notifications.

Public sign-up is closed during review, so a new email or phone will not create an account. Legal pages: <PRIVACY_URL>, <TERMS_URL>. Account deletion on the web: <DELETE_ACCOUNT_URL>.
```

**Founder decisions (2026-10-06):**

- **Decided:** one fixed code per reserved account, only in Play Console notes. The config allows either that or one shared code; the template uses the per-account placeholders above.
- **Decided:** a separate reserved account is kept for deletion testing. Without one, a reviewer who deletes the buyer or seller account schedules the deletion of an account the instructions still offer.
- Verify that "Public sign-up is closed" is true in reviewer production (`SIGNUPS_ENABLED=false`, checked in `VerifyOtp.ts`, line 121) before keeping that sentence. A staging probe on 2026-10-06 returned 403 FEATURE_DISABLED, which confirms it on staging only; production is still to check.

## 7. Founder checklist

Do these in order. Record non-secret evidence only: no codes, account values, Console screenshots with secrets, or signing material.

1. **Hosting and URLs.** From a network outside the workstation proxy, load the four URLs in section 5 in `en`, `ru` and `tk` over valid TLS. Evidence on **#496**: date, network, HTTP status, certificate issuer.
2. **Release audit.** Build the EAS `production` AAB and run the release audit items in section 3. If the audit shows a token or installation ID is fetched before the notification permission is granted, the Device or other IDs answer must be "required" instead of optional. Evidence on **#325**: AAB hash, versionCode, targetSdk, merged permission list, AD_ID result, install referrer source, Firebase auto-init result.
3. **Founder decisions.** Settle every "Founder decides" item on this page. Evidence on **#327**: one line per decision.
4. **Native reads.** Get the RU and TK listing text read by native speakers. Evidence on **#327**: who read it (role, not contact details), date, and the edits.
5. **Store listing.** Enter the name, short and full descriptions in EN, RU and TK, the category, contact details, icon, feature graphic and screenshots (no brand logos). Evidence on **#327**: confirmation that the text matches this page or a link to the edited text.
6. **Privacy policy URL.** Evidence on **#327**.
7. **App access.** Enter the section 6 instructions with real values from the secret store, then sign in once with each reserved account by email and by phone from outside Turkmenistan. Evidence on **#327**: pass or fail per account and path, no values. Evidence on **#391**: the email path is the main login and phone is the alternative.
8. **Ads, content rating, target audience, News, COVID-19, Government, Financial features, Health, Advertising ID.** Enter the section 4 answers. Evidence on **#327**: the rating Console issued, and the answers given.
9. **Data safety.** First open Railway's HTTP logs for the reviewer production API, find one typed search (`GET /api/v1/catalog/search?q=…`, which the app sends when a User types in Search), and confirm the logged path carries no query string; if it does, declare In-app search history as collected instead. If the release audit showed a token or installation ID fetched before the notification permission, answer Device or other IDs as "required" instead of optional. Then enter section 2, including the Firebase SDK data, and the Delete account URL. Evidence on **#391**: Email address collected yes, shared no, not ephemeral, optional, App functionality and Account management, encrypted, deletable. Evidence on **#327**: the full set of answers as entered.
10. **Testing gate.** The release updates the existing app `com.auto_tm.ynamly`, whose closed-test requirement is already met (founder decisions above); the 12-testers-for-14-days rule would apply only to a new app ([#324](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/324)). Confirm in Play Console that the app shows no outstanding testing requirement before applying for production. Evidence on **#327**.
11. **Candidate freeze.** Upload the signed AAB to the app's existing closed track (founder decisions above, step 5), check the Console's pre-launch report, and compare the Console's permission list with step 2. Evidence on **#329**: AAB hash, versionCode, track, and that the Console list matches.
12. **Final review and submit.** The founder reviews the exact listing, binary and declarations together, then submits. Evidence on **#329** and **#327**: submission date and review outcome.

## Gaps that could make a declaration untrue

Found while checking the answers above against `origin/main`. Each needs its own issue or a founder decision before step 9.

1. **The privacy policy calls push "future".** `apps/web/src/app/[locale]/legal/content.ts` (lines 41 and 62, with the RU and TK equivalents) says push tokens and FCM apply "if native push notifications ship later". The app registers FCM tokens and the worker sends Message previews through FCM. Data safety will declare Device or other IDs, and the policy has to say the same before submission. The 83-legal "Future collections" row has the same problem. Owner: the legal text ([#390](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/390) or a new issue). **Resolved** by PR 686.
2. **Sign-in Code request rows outlive deletion.** `PurgeExpiredAccounts.ts` clears `User.phone` and `User.email` but never touches `otp_requests`. Those rows keep the phone or email (`destination`) and the IP address with no retention job. The only delete is the manual `packages/db/scripts/clear-otp-rate-limit.ts`. "Deleted on request" and the policy's "PII removed" are not fully true until those rows are deleted or purged by age. **Resolved**: the purge deletes them, and the purge job deletes every record older than 30 days (PR for #685 decisions).
3. **Archived Listings keep the contact phone.** After the purge, a kept Listing still holds `Listing.contactPhone`. The policy says Listings are kept. It does not say a phone number stays inside them. **Resolved**: the purge clears it (same PR).
4. **API request logs.** `pinoHttp` with default serializers logs every request's URL (search terms included), remote address and headers to Railway logs. That bears on search history (section 2), and until PR 684 the logged headers also included `Authorization` bearer tokens; PR 684 redacts credential headers. **Resolved**: PR 684 redacts credential headers; the request log now drops query strings (same PR as above), and a sign-in code request's log line carries neither the remote address nor the forwarding headers, so no request IP outlives the 30-day sign-in code records (PR for #694).
5. **Photo location metadata is unproven.** Listing and chat photos are re-encoded by `expo-image-manipulator` before upload, which should drop EXIF GPS, and the Android photo picker hides location without `ACCESS_MEDIA_LOCATION`. No test proves it. Check an uploaded photo from a GPS-tagged original on the physical device (#345) before answering "Precise location: No" with confidence. **Resolved** on the server: Listing photo originals (PR 687) and chat images ([#688](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/688)) are re-encoded without metadata before another User can load them, each with a test that feeds a GPS-tagged JPEG through the stored path. Chat images are cleaned when the Message is sent, so an image that was uploaded and never sent, or sent before #688 shipped, keeps what the app uploaded; for those the answer still rests on the app's own re-encode, and the device check (#345) stays worth doing.
6. **The privacy policy says device info is collected "for debugging".** `content.ts` line 36 says device model, OS and app version are collected. The app sends only a fixed device label ("Android app", `app/(auth)/otp.tsx`, line 121) and the HTTP user agent, stored on `Session`. This over-states rather than under-states, so it is not a Play risk, but the policy and the form should agree.
7. **Profile Photo files after removal.** Shipped: the app side (#643) and the server side (#642, [ADR-0088](../../adr/0088-exclusive-upload-adoption-and-retirement.md)). A Profile Photo is public User content and is moderated through the existing User report: a moderator removes it with `POST /api/v1/admin/users/:id/remove-photo`, which writes a `USER_PHOTO_REMOVE` audit entry, and the admin browser has no button for it yet. Replacement, removal by the User, removal by a moderator and the day-30 purge each stop publishing the key and record deletion work in the same transaction; the worker then deletes the original and its eight variants and retries after a failure, so deletion is not instant and the policy says so. The original and variants are re-encoded without EXIF or GPS, by the same code path as Listing photos (item 5). What stays true and must not be over-claimed: copies cached or saved outside Carberk's storage are not erased; an upload the User presigned and never set as a photo is not swept; and whether the deployed storage provider honours conditional writes with versioning off is a release check a person runs ([worker overview](../../../apps/worker/CONTEXT.md)).

## References

- [83 — Legal documents](83-legal.md), [84 — Launch plan](84-launch-plan.md)
- [ADR-0039](../../adr/0039-phased-cloud-first-hosting.md), [ADR-0054](../../adr/0054-phone-or-email-sign-in-share-one-user.md), [ADR-0055](../../adr/0055-resend-sends-sign-in-codes-from-the-worker.md), [ADR-0056](../../adr/0056-listing-contact-phones-are-verified.md)
- Issues: [#320](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/320), [#324](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/324), [#325](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/325), [#327](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/327), [#329](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/329), [#391](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/391), [#496](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/496)

## Campaign #874 disclosure amendment

Before shipping the install identifier for Listing views, replace conflicting no-App-interactions/conditional-push-only answers for this collection: App interactions and Device or other IDs are collected, not shared, for app functionality. Views identifier collection is part of the feature, not conditional notification permission. Keep independent Firebase findings accurate. Privacy text in EN/RU/TK and verified two-day fingerprint cleanup are release prerequisites. Do not equate raw random install ID transport with permanent storage, or claim no collection because the server hashes it. No advertising identifier or analytics SDK is added by #874. Record actual submitted answers at release; this documentation candidate does not operate Play Console.
