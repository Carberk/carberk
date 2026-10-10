import type { Locale } from "@/i18n/locales";

export interface LegalSection {
  title: string;
  body: string;
}

export interface LegalDocument {
  title: string;
  effectiveDate: string;
  effectiveDateISO: string;
  lastRevised: string;
  lastRevisedISO: string;
  sections: LegalSection[];
}

export const privacyPolicy: Record<Locale, LegalDocument> = {
  en: {
    title: "Privacy Policy",
    effectiveDate: "September 23, 2026",
    effectiveDateISO: "2026-09-23",
    lastRevised: "October 7, 2026",
    lastRevisedISO: "2026-10-07",
    sections: [
      {
        title: "1. What we collect",
        body: `We collect the following information when you use Carberk:

- **Phone number** — used to create or sign in to your account with a code sent by SMS.
- **Email address** — collected when you choose to sign in by email, or when you add or change an email address on your account.
- **Listing contact phone** — the +993 number you choose to show on a listing. It is always a number confirmed by an SMS code.
- **Name and profile photo** — if you choose to add them to your profile.
- **Location** — the region and city you select for your listings or search preferences. We do **not** track your real-time GPS location.
- **Listings** — vehicle details, photos, price, and description of cars you post.
- **Messages** — text content of contact-thread conversations between buyers and sellers.
- **Device information** — device model, operating system, and app version, collected for debugging purposes.
- **IP address** — used for rate limiting and security.
- **Push notification token** — if you allow notifications, the token your device's push service gives the app, used to tell you about new messages.
- **Photo uploads** — images you attach to listings.
- **VIN** — if you voluntarily enter it.

Future collections (if features ship): video uploads, garage vehicle data, blog content, inspection report data.`,
      },
      {
        title: "2. What we do NOT collect",
        body: `- We do **not** track your GPS location in the MLP beta.
- We do **not** store raw GPS coordinates.
- We do **not** use third-party advertising SDKs.
- We do **not** add open tracking, tracking pixels, or tracked links to the emails we send you.
- We do **not** sell your data to anyone.`,
      },
      {
        title: "3. Why we collect it",
        body: "We use your data to: create and maintain your account, display listings, enable search functionality, facilitate communication between users, prevent fraud, and comply with app store policies.",
      },
      {
        title: "4. Who can see it",
        body: `- **Public:** your display name and avatar (if shown), active listings, public listing photos, the city/region of listings, and the contact phone you chose for a listing.
- **Private:** the phone number and email address you use to sign in (unless you also choose that phone number as the contact phone of a listing), contact-thread message content (except for admin moderation), and exact location pin (if a future phase adds map features).`,
      },
      {
        title: "5. Sharing with third parties",
        body: "In the MLP beta, Carberk runs its own sign-in service on servers rented from Railway, a cloud hosting provider, which stores the app's data for us. Sign-in codes sent by email are delivered by an email delivery provider located in the United States: it receives your email address and the message containing the code, and keeps them for 30 days. Push notifications are delivered through Firebase Cloud Messaging (Google), which receives your device token and the notification content. We do not share data with advertisers, data brokers, or other third parties.",
      },
      {
        title: "6. Data retention & account deletion",
        body: `Your data is retained while your account is active. Records of sign-in codes (the phone number or email address, and the IP address of the request) are deleted after 30 days.

Your profile photo is public, and other users can report it. When you replace or remove your profile photo, or a moderator removes it, it stops being shown at once. Its files are then deleted from our storage by a background job that keeps retrying until they are gone, so if our storage is unavailable the deletion finishes later. We cannot delete copies that other people saved or that are held outside our servers.

If you are signed in, you can delete your account in the app: open Cabinet, tap your profile, then tap Delete account at the bottom of the Profile screen. On the public [account deletion page](/en/account/delete) on our website, enter a phone number or email address on the account and confirm the request with a code sent to it.

When you request account deletion:
- Your account enters a **30-day grace period**.
- During this period, your listings are archived, all sessions are revoked, and your phone number and email address remain reserved to you.
- You may recover your account at any time during the grace period by signing in again with either your phone number or your email address. Recovery reactivates your account and republishes archived listings.
- After 30 days, your personal information is removed: your phone number and email address are freed, your display name is cleared, your profile photo is removed and its files are deleted from our storage in the same way, the contact phone is removed from your listings, and records of the sign-in codes sent to you are deleted.
- Your listings, messages, and conversation history are retained with "Deleted user" attribution to preserve counterparties' records and audit trails.
- Moderation reports and audit logs remain intact.`,
      },
      {
        title: "7. Your rights",
        body: "You have the right to: access your data, delete your account (in the app or on our website, with the 30-day grace period described above), correct your profile and listing information, and opt out of marketing notifications if we ever introduce them.",
      },
      {
        title: "8. Children's privacy",
        body: "Carberk is not intended for users under 18 years of age (consistent with vehicle purchase being an adult activity). We do not knowingly collect data from minors.",
      },
      {
        title: "9. Cookies",
        body: "The web admin interface at apps/admin uses HTTP-only session cookies for login. The API accepts bearer token authentication. No analytics cookies are used in the MLP beta.",
      },
      {
        title: "10. Security",
        body: "We use HTTPS for all data in transit. Refresh tokens are hashed with bcrypt. Data is stored on encrypted disks. Until the move to Turkmenistan, servers are hosted by a cloud provider (Railway); they move to Turkmenistan before the app opens to the public. Admin actions are audit-logged.",
      },
      {
        title: "11. Changes to this policy",
        body: "We may update this Privacy Policy. Material changes will be communicated via the app or through our documented beta support channel. The effective date is displayed at the top of this document.",
      },
      {
        title: "12. Contact & jurisdiction",
        body: "For privacy inquiries, contact us at: bagtyyarkowusow.dev@gmail.com\n\nThis Privacy Policy is governed by the laws of Turkmenistan.",
      },
    ],
  },
  ru: {
    title: "Политика конфиденциальности",
    effectiveDate: "23 сентября 2026 г.",
    effectiveDateISO: "2026-09-23",
    lastRevised: "7 октября 2026 г.",
    lastRevisedISO: "2026-10-07",
    sections: [
      {
        title: "1. Какие данные мы собираем",
        body: `- **Номер телефона** — для создания аккаунта или входа по коду из SMS.
- **Адрес электронной почты** — если вы выбираете вход по почте либо добавляете или меняете почту в аккаунте.
- **Контактный телефон объявления** — номер +993, который вы показываете в объявлении. Это всегда номер, подтверждённый кодом из SMS.
- **Имя и фото профиля** — если вы их добавите.
- **Местоположение** — регион и город, выбранные для объявлений или поиска. Мы **не** отслеживаем GPS в реальном времени.
- **Объявления** — данные автомобиля, фото, цена, описание.
- **Сообщения** — текст переписки между покупателями и продавцами.
- **Информация об устройстве** — модель, ОС, версия приложения (для отладки).
- **IP-адрес** — для ограничения частоты запросов и безопасности.
- **Токен push-уведомлений** — если вы разрешите уведомления: токен, который push-сервис устройства выдаёт приложению, чтобы сообщать о новых сообщениях.
- **Загруженные фото** — изображения к объявлениям.
- **VIN** — если вы его введёте добровольно.`,
      },
      {
        title: "2. Что мы НЕ собираем",
        body: `- Мы **не** отслеживаем GPS-локацию.
- Мы **не** храним сырые GPS-координаты.
- Мы **не** используем сторонние рекламные SDK.
- Мы **не** добавляем в наши письма отслеживание открытий, трекинговые пиксели и отслеживаемые ссылки.
- Мы **не** продаём данные.`,
      },
      {
        title: "3. Зачем мы собираем данные",
        body: "Для создания аккаунта, отображения объявлений, поиска, коммуникации между пользователями, предотвращения мошенничества и соблюдения правил магазинов приложений.",
      },
      {
        title: "4. Кто может видеть данные",
        body: `- **Публично:** имя, аватар (если включены), активные объявления, фото, город/регион объявления и контактный телефон, выбранный для объявления.
- **Приватно:** номер телефона и адрес почты, по которым вы входите (если вы не выбрали этот номер контактным телефоном объявления), содержание переписки (кроме модерации), точная точка на карте (если добавим позже).`,
      },
      {
        title: "5. Передача третьим лицам",
        body: "В MLP-бете Carberk использует собственную систему входа на серверах облачного провайдера Railway, который хранит данные приложения по нашему поручению. Письма с кодами входа отправляет сторонний почтовый сервис, расположенный в США: он получает ваш адрес почты и письмо с кодом, а также хранит их 30 дней. Push-уведомления доставляются через Firebase Cloud Messaging (Google): сервис получает токен устройства и текст уведомления. Мы не передаём данные рекламным сетям или брокерам.",
      },
      {
        title: "6. Хранение данных и удаление аккаунта",
        body: `Данные хранятся, пока аккаунт активен. Записи о кодах входа (номер телефона или адрес почты и IP-адрес запроса) удаляются через 30 дней.

Фото профиля видно всем, и другие пользователи могут на него пожаловаться. Когда вы заменяете или удаляете фото профиля либо его удаляет модератор, оно сразу перестаёт показываться. Затем его файлы удаляются из нашего хранилища фоновым заданием, которое повторяет попытки, пока они не будут удалены, поэтому при недоступности хранилища удаление завершается позже. Мы не можем удалить копии, которые сохранили другие люди или которые хранятся вне наших серверов.

Если вы вошли в аккаунт, удалить его можно в приложении: откройте «Кабинет», нажмите на свой профиль и выберите «Удалить аккаунт» внизу экрана «Профиль». На общедоступной [странице удаления аккаунта](/ru/account/delete) на нашем сайте укажите номер телефона или адрес почты из аккаунта и подтвердите запрос кодом, отправленным на выбранный способ входа.

При удалении аккаунта:
- Аккаунт переходит в **30-дневный льготный период**.
- В этот период объявления архивируются, все сессии завершаются, номер телефона и адрес почты остаются зарезервированными за вами.
- Вы можете восстановить аккаунт в любой момент, войдя снова по номеру телефона или по адресу почты. Восстановление активирует аккаунт и возвращает архивные объявления.
- Через 30 дней персональные данные удаляются: номер телефона и адрес почты освобождаются, имя очищается, фото профиля удаляется, а его файлы удаляются из нашего хранилища тем же способом, контактный телефон удаляется из объявлений, а записи об отправленных вам кодах входа удаляются.
- Объявления, сообщения и переписка сохраняются с пометкой «Удалённый пользователь» — чтобы сохранить историю для собеседников и аудита.
- Жалобы и журналы аудита остаются нетронутыми.`,
      },
      {
        title: "7. Ваши права",
        body: "Право на доступ к данным, удаление аккаунта (в приложении или на сайте, с 30-дневным льготным периодом), исправление профиля/объявлений, отказ от маркетинговых уведомлений.",
      },
      {
        title: "8. Дети",
        body: "Приложение предназначено для лиц старше 18 лет. Мы сознательно не собираем данные несовершеннолетних.",
      },
      {
        title: "9. Файлы cookie",
        body: "Веб-админка использует HTTP-only session cookies. API работает с bearer-токенами. Аналитические cookies не используются.",
      },
      {
        title: "10. Безопасность",
        body: "HTTPS в transit. Токены обновления хешируются bcrypt. Диски зашифрованы. До переезда в Туркменистан серверы размещены у облачного провайдера (Railway); они переедут в Туркменистан до открытия приложения для всех. Действия администраторов логируются.",
      },
      {
        title: "11. Изменения политики",
        body: "Материальные изменения будут сообщены через приложение или канал поддержки бета. Дата вступления в силу указана вверху.",
      },
      {
        title: "12. Контакты и юрисдикция",
        body: "bagtyyarkowusow.dev@gmail.com. Законодательство Туркменистана.",
      },
    ],
  },
  tk: {
    title: "Gizlinlik syýasaty",
    effectiveDate: "23-nji sentýabr 2026",
    effectiveDateISO: "2026-09-23",
    lastRevised: "7-nji oktýabr 2026",
    lastRevisedISO: "2026-10-07",
    sections: [
      {
        title: "1. Haýsy maglumatlary ýygnaýarys",
        body: `- **Telefon belgisi** — SMS arkaly gelen kod bilen akkaunt döretmek ýa-da girmek üçin.
- **E-poçta salgysy** — e-poçta arkaly girmegi saýlasaňyz ýa-da akkauntyňyza e-poçta goşsaňyz ýa-da çalyşsaňyz.
- **Bildirişiň habarlaşma belgisi** — bildirişde görkezmek üçin saýlan +993 belgiňiz. Ol hemişe SMS kody bilen tassyklanan belgidir.
- **Ady we profil suraty** — goşsaňyz.
- **Ýerleşýän ýeri** — saýlanan sebit we şäher. GPS-y **gözegçilik etmeyäris**.
- **Bildirişler** — awtoulag maglumatlary, suratlar, baha, düşündiriş.
- **Habarlar** — satyn alyjy bilen satyjynyň arasyndaky çat.
- **Enjama maglumat** — model, OS, programmanyň wersiýasy (ýalňyşlary düzetmek üçin).
- **IP salgysy** — howpsuzlyk we çäklendirme.
- **Push habarnamalarynyň tokeni** — habarnamalara rugsat berseňiz: täze habarlar barada habar bermek üçin enjamyň push hyzmatynyň programma berýän tokeni.
- **Ýüklenen suratlar** — bildirişlere goşulan.
- **VIN** — öziňiz girizen bolsaňyz.`,
      },
      {
        title: "2. Haýsy maglumatlary ÝIGNAMAýARYS",
        body: `- GPS-y gözegçilik etmeyäris.
- GPS koordinatalaryny saklamaýarys.
- Üçünji tarap reklama SDK-laryny ulanmaýarys.
- Size iberýän hatlarymyza açylma yzarlaýşyny, yzarlaýjy piksel ýa-da yzarlanýan salgy goşmaýarys.
- Maglumatlary satmaýarys.`,
      },
      {
        title: "3. Näme üçin ýygnaýarys",
        body: "Akkaunt döretmek, bildirişleri görkezmek, gözleg, ulanyjylar arasynda habarlaşmak, aldamçylygy öňlemek we app store düzgünlerine laýyklyk.",
      },
      {
        title: "4. Kim görüp biler",
        body: `- **Jemgyýetçilik:** ady, awatar (açyk bolsa), işjeň bildirişler, suratlar, şäher/sebit we bildiriş üçin saýlanan habarlaşma belgisi.
- **Şahsy:** girmek üçin ulanýan telefon belgiňiz we e-poçta salgyňyz (şol telefon belgisini bildirişiň habarlaşma belgisi edip saýlamadyk bolsaňyz), çat habarlary (moderasiýadan başga), takyk ýer (soňrak goşulsa).`,
      },
      {
        title: "5. Üçünji taraplara geçirmek",
        body: "MLP betada Carberk öz giriş ulgamyny bulut üpjünçisi Railway-iň serwerlerinde işledýär; ol programmanyň maglumatlaryny biziň tabşyrygymyz bilen saklaýar. E-poçta arkaly iberilýän giriş kodlaryny ABŞ-da ýerleşýän e-poçta eltiş üpjünçisi eltýär: ol siziň e-poçta salgyňyzy we kod ýazylan haty alýar we olary 30 gün saklaýar. Push habarnamalary Firebase Cloud Messaging (Google) arkaly eltilýär: ol enjamyň tokenini we habarnamanyň mazmunyny alýar. Reklama torlaryna ýa-da brokerlere maglumat geçirmeýäris.",
      },
      {
        title: "6. Maglumatlary saklamak we akkaunty pozmak",
        body: `Maglumatlar akkaunt işjeň bolança saklanýar. Giriş kodlarynyň ýazgylary (telefon belgisi ýa-da e-poçta salgysy we haýyşyň IP salgysy) 30 günden soň pozulýar.

Profil suraty hemmelere görünýär we beýleki ulanyjylar ol barada şikaýat edip bilýär. Profil suratyňyzy çalşanyňyzda ýa-da aýranyňyzda, ýa-da ony moderator aýranda, ol derrew görkezilmegini bes edýär. Soňra onuň faýllary saklaýjymyzdan fon işi arkaly pozulýar; faýllar pozulýança synanyşyk gaýtalanýar, şonuň üçin saklaýjy elýeterli bolmasa, pozmak soňrak tamamlanýar. Başga adamlaryň ýatda saklan ýa-da serwerlerimizden daşarda saklanýan nusgalaryny pozup bilmeýäris.

Akkaunta giren bolsaňyz, ony programmada pozup bilersiňiz: «Kabinet» bölümini açyň, profiliňize basyň we «Profil» ekranynyň aşagyndaky «Akkaunty poz» düwmesine basyň. Saýtymyzdaky köpçülige açyk [akkaunt pozmak sahypasynda](/tk/account/delete) akkauntdaky telefon belgini ýa-da e-poçta salgysyny giriziň we şol giriş usulyna iberilen kod bilen haýyşy tassyklaň.

Akkaunty pozan wagtyňyz:
- **30 günlük lýgotly döwr** başlaýar.
- Bu döwürde bildirişler arhiwlenýär, ähli sessiýalar gutarýar, telefon belgiňiz we e-poçta salgyňyz size bellenen galýar.
- Bu döwürde islän wagtyňyz telefon belgiňiz ýa-da e-poçta salgyňyz bilen gaýtadan girip, akkaunty dikeldip bilersiňiz. Dikeltme işjeň edýär we arhiwlenen bildirişleri yzyna getirýär.
- 30 günden soň şahsy maglumatlar aýrylýar: telefon belgisi we e-poçta salgysy boşadylýar, ady arassalanýar, profil suraty aýrylýar we onuň faýllary saklaýjymyzdan şol usul bilen pozulýar, bildirişlerden habarlaşma belgisi aýrylýar we size iberilen giriş kodlarynyň ýazgylary pozulýar.
- Bildirişler, habarlar we çat taryhy «Pozulan ulanyjy» diýip saklanýar — tarapyňyz üçin ýazgylary we audit ýollaryny goraşmak üçin.
- Şikaýatlar we audit gündelikleri galyberýär.`,
      },
      {
        title: "7. Siziň hukuklaryňyz",
        body: "Maglumatlara giriş, akkaunty pozmak (programmada ýa-da saýtda, 30 günlük lýgotly döwür bilen), profil/bildirişleri düzetmek, marketing habarlamalaryndan çykmak.",
      },
      {
        title: "8. Çagalar",
        body: "Programma 18 ýaşdan ulylar üçin. Biz çagalardan maglumat ýygnamaýarys.",
      },
      {
        title: "9. Kukiler",
        body: "Web adminde HTTP-only session kukileri. API bearer token kabul edýär. Analitika kukileri ýok.",
      },
      {
        title: "10. Howpsuzlyk",
        body: "HTTPS transitde. Täzeleme tokenlary bcrypt bilen heşlenýär. Diskler şifrlenen. Türkmenistana geçirilýänçä serwerler bulut üpjünçisinde (Railway) ýerleşýär; programma köpçülige açylmazdan öň Türkmenistana geçirilýär. Admin hereketleri auditlenýär.",
      },
      {
        title: "11. Syýasat üýtgemeleri",
        body: "Esasy üýtgeşmeler programma ýa-da beta goldaw arkaly duýdurylar. Güýje giriş senesi ýokarda görkezilendir.",
      },
      {
        title: "12. Habarlaşmak we yurisdiksiýa",
        body: "bagtyyarkowusow.dev@gmail.com. Türkmenistanyň kanunlary.",
      },
    ],
  },
};

export const termsOfService: Record<Locale, LegalDocument> = {
  en: {
    title: "Terms of Service",
    effectiveDate: "September 23, 2026",
    effectiveDateISO: "2026-09-23",
    lastRevised: "October 11, 2026",
    lastRevisedISO: "2026-10-11",
    sections: [
      {
        title: "1. Eligibility",
        body: "You must be at least 18 years old to use Carberk. By using the app, you agree to abide by these Terms of Service.",
      },
      {
        title: "2. Account responsibilities",
        body: `You sign in with a code sent to your phone number or to your email address; Carberk does not use passwords. Your account always keeps at least one of these sign-in methods, and you are responsible for maintaining access to them and for keeping your codes to yourself. Carberk will never ask you to share a code.

You are responsible for all content you post on Carberk.`,
      },
      {
        title: "3. Acceptable use",
        body: "Listings must be for real vehicles you own or are authorized to represent. You may not use Carberk for scams, fraud, harassment, illegal content, or intellectual property infringement.",
      },
      {
        title: "4. Listing accuracy and contact phone",
        body: `Sellers represent that their listings are accurate. Misrepresentation may result in account suspension or listing removal.

Every listing shows a contact phone that has been verified. Before you publish or republish a listing, or change its contact phone, that number must be verified: it is either the verified phone number on your account, or another +993 number you confirm with a code sent to it by SMS for this purpose. Confirming a number only allows it to be shown on your listing; it does not make that number a way to sign in to your account. If your account has no phone number, you do not need to add one — you verify a contact phone while creating the listing. Use only a number you are entitled to use: if it belongs to someone else, that person must agree to be contacted about the listing.`,
      },
      {
        title: "5. Prohibited content",
        body: "You may not post: spam, duplicate listings, stolen vehicles, vehicles with active liens (without disclosure), or illegally modified vehicles.",
      },
      {
        title: "6. Communication",
        body: "You agree to receive transactional messages necessary to operate the service: sign-in codes sent by SMS or email, codes that confirm a listing contact phone, and contact-thread messages. Push notifications and marketing communications require separate opt-in if introduced.",
      },
      {
        title: "7. Disclaimer",
        body: "Carberk is a marketplace platform. We do not own, inspect, or warrant the vehicles listed (except where Phase 2 inspection reports explicitly apply). All transactions are solely between users.\n\nBrand names and logos belong to their owners and are used only to identify vehicles. Carberk is not affiliated with them. A brand owner can ask us to remove its logo by writing to the address in section 13.",
      },
      {
        title: "8. Inspection reports (Phase 2)",
        body: "If available, inspection reports represent Carberk's good-faith assessment. They are not a warranty. Buyers should perform independent verification.",
      },
      {
        title: "9. Dealer terms",
        body: "Dealer accounts, PRO badges, and dealership verification are post-MLP features. If introduced, dealers are responsible for the accuracy of all listings under their account.",
      },
      {
        title: "10. Termination & account deletion",
        body: `You may delete your account at any time in the app (in Cabinet, open your profile and tap Delete account), or by requesting deletion on our website with the phone number or email address on your account. Deletion initiates a 30-day grace period during which you may recover your account by signing in again with either your phone number or your email address. After 30 days, your personal data is removed, but your listings and messages are retained with anonymized attribution.

Carberk may suspend accounts that violate these terms.`,
      },
      {
        title: "11. Liability",
        body: "Carberk is not liable for disputes, transactions, or content between users, to the extent permitted by law.",
      },
      {
        title: "12. Modifications",
        body: "We may update these terms. Material changes will be communicated in-app or through the documented beta support channel.",
      },
      {
        title: "13. Governing law & contact",
        body: "These Terms are governed by the laws of Turkmenistan.\n\nFor inquiries: bagtyyarkowusow.dev@gmail.com",
      },
    ],
  },
  ru: {
    title: "Условия использования",
    effectiveDate: "23 сентября 2026 г.",
    effectiveDateISO: "2026-09-23",
    lastRevised: "11 октября 2026 г.",
    lastRevisedISO: "2026-10-11",
    sections: [
      {
        title: "1. Допустимый возраст",
        body: "Вам должно быть не менее 18 лет. Используя приложение, вы соглашаетесь с настоящими Условиями.",
      },
      {
        title: "2. Ответственность за аккаунт",
        body: `Вход выполняется по коду, который приходит на ваш номер телефона или на адрес электронной почты; паролей в Carberk нет. В аккаунте всегда остаётся хотя бы один такой способ входа: вы отвечаете за доступ к нему и за то, чтобы не передавать коды посторонним. Carberk никогда не просит сообщить код.

Вы несёте ответственность за весь контент, который публикуете.`,
      },
      {
        title: "3. Допустимое использование",
        body: "Объявления должны быть о реальных автомобилях, которыми вы владеете или имеете право представлять. Запрещены мошенничество, спам, домогательства, незаконный контент, нарушение интеллектуальной собственности.",
      },
      {
        title: "4. Точность объявлений и контактный телефон",
        body: `Продавец гарантирует достоверность информации. Недостоверные сведения могут привести к блокировке.

В каждом объявлении показывается подтверждённый контактный телефон. Прежде чем вы опубликуете или переопубликуете объявление либо измените его контактный телефон, этот номер должен быть подтверждён: это либо подтверждённый номер телефона вашего аккаунта, либо другой номер +993, который вы подтверждаете кодом, отправленным на него по SMS для этой цели. Подтверждение разрешает только показывать номер в вашем объявлении; оно не делает этот номер способом входа в аккаунт. Если в аккаунте нет номера телефона, добавлять его не нужно — контактный телефон подтверждается при создании объявления. Указывайте только тот номер, которым вы вправе пользоваться: если он принадлежит другому человеку, этот человек должен согласиться на обращения по объявлению.`,
      },
      {
        title: "5. Запрещённый контент",
        body: "Спам, дублирующие объявления, угнанные автомобили, автомобили с обременениями (без указания), незаконные доработки.",
      },
      {
        title: "6. Коммуникации",
        body: "Вы соглашаетесь получать транзакционные сообщения, необходимые для работы сервиса: коды входа по SMS или электронной почте, коды подтверждения контактного телефона объявления и переписку. Push-уведомления и маркетинг — отдельное согласие.",
      },
      {
        title: "7. Ограничение ответственности",
        body: "Carberk — площадка. Мы не владеем, не проверяем и не гарантируем автомобили (кроме случаев с отчётами осмотра Фазы 2). Сделки — между пользователями.\n\nНазвания и логотипы марок принадлежат их владельцам и используются только для обозначения автомобилей. Carberk не связан с ними. Владелец марки может попросить убрать её логотип, написав по адресу из раздела 13.",
      },
      {
        title: "8. Отчёты осмотра (Фаза 2)",
        body: "Если доступны, это оценка добросовестности. Не гарантия. Покупатель должен проверить самостоятельно.",
      },
      {
        title: "9. Условия для дилеров",
        body: "Дилерские аккаунты — после MLP. Дилеры отвечают за точность всех своих объявлений.",
      },
      {
        title: "10. Расторжение и удаление аккаунта",
        body: `Вы можете удалить аккаунт в приложении (в «Кабинете» откройте свой профиль и выберите «Удалить аккаунт») или запросить удаление на нашем сайте, указав номер телефона или адрес почты из аккаунта. Удаление запускает 30-дневный льготный период, в течение которого аккаунт можно восстановить, войдя снова по номеру телефона или по адресу почты. Через 30 дней персональные данные удаляются, объявления и переписка сохраняются с анонимной атрибуцией.

Carberk может приостановить аккаунт за нарушения.`,
      },
      {
        title: "11. Ответственность",
        body: "Carberk не несёт ответственности за споры и сделки между пользователями в пределах, допустимых законом.",
      },
      {
        title: "12. Изменения условий",
        body: "Мы можем обновлять условия. Материальные изменения сообщаются через приложение.",
      },
      {
        title: "13. Право и контакты",
        body: "Законодательство Туркменистана. bagtyyarkowusow.dev@gmail.com",
      },
    ],
  },
  tk: {
    title: "Ulanyş şertleri",
    effectiveDate: "23-nji sentýabr 2026",
    effectiveDateISO: "2026-09-23",
    lastRevised: "11-nji oktýabr 2026",
    lastRevisedISO: "2026-10-11",
    sections: [
      {
        title: "1. Ýaş çägi",
        body: "Iň az 18 ýaş. Programmany ulanmak bilen şertleri kabul edýärsiňiz.",
      },
      {
        title: "2. Akkaunt jogapkärçiligi",
        body: `Siz parol bilen däl-de, telefon belgiňize ýa-da e-poçta salgyňyza iberilen kod bilen girýärsiňiz. Akkauntyňyzda şeýle giriş usullarynyň iň azyndan biri hemişe galýar: oňa elýeterliligi saklamak we kody başga hiç kime bermezlik siziň jogapkärçiligiňiz. Carberk hiç haçan kody paýlaşmagy soramaýar.

Ýazan ähli kontentiňize siz jogapkär.`,
      },
      {
        title: "3. Kabul edilýan ulanyş",
        body: "Bildirişler siziň özüňize degişli ýa-da wakalaşyk berlen hakyky awtoular hakda bolmaly. Aldamçylyk, spam, garsylyk, näkanuny kontent gadagan.",
      },
      {
        title: "4. Bildirişleriň dogrulygy we habarlaşma belgisi",
        body: `Satyjy maglumatlaryň dogrulygyny kepillendirýär. Ýalňyş maglumat akkaunty bloklamaga getirip biler.

Her bildirişde tassyklanan habarlaşma belgisi görkezilýär. Bildirişi çap etmezden, gaýtadan çap etmezden ýa-da onuň habarlaşma belgisini çalyşmazdan öň şol belgi tassyklanmaly: ol ýa akkauntyňyzdaky tassyklanan telefon belgiňizdir, ýa-da şu maksat bilen SMS arkaly iberilen kod bilen tassyklaýan başga bir +993 belgiňizdir. Belgini tassyklamak diňe ony bildirişiňizde görkezmäge rugsat berýär; ol belgi akkaunta girmegiň usulyna öwrülmeýär. Akkauntyňyzda telefon belgisi ýok bolsa, goşmak hökman däl — habarlaşma belgisini bildirişi döredeniňizde tassyklaýarsyňyz. Diňe ulanmaga hakyňyz bolan belgini görkeziň: belgi başga bir adama degişli bolsa, ol adam bildiriş boýunça habarlaşylmagyna razy bolmaly.`,
      },
      {
        title: "5. Gadagan kontent",
        body: "Spam, dublikat bildirişler, ogurlanan maşynlar, girewjisi bolan maşynlar (körkezilmese), näkanuny üýtgeşmeler.",
      },
      {
        title: "6. Habarlaşma",
        body: "Siz hyzmaty işletmek üçin zerur transaksion habarlary almagy kabul edýärsiňiz: SMS ýa-da e-poçta arkaly gelýän giriş kodlary, bildirişiň habarlaşma belgisini tassyklaýan kodlar we çat habarlary. Push we marketing — aýratyn razylyk.",
      },
      {
        title: "7. Jogapkärçiliginiň çäklendirilmesi",
        body: "Carberk — bazar meýdany. Maşynlary eýelemeýäris, barlamayarys, kepillendirmeýäris (2-nji tapgyr barlag hasabatlaryndan başga). Söwda — ulanyjylaryň arasynda.\n\nMarkalaryň atlary we nyşanlary olaryň eýelerine degişlidir we diňe awtoulaglary kesgitlemek üçin ulanylýar. Carberk olar bilen baglanyşykly däl. Markanyň eýesi 13-nji bölümdäki salga ýazyp, nyşanyny aýyrmagy haýyş edip biler.",
      },
      {
        title: "8. Barlag hasabatlary (2-nji tapgyr)",
        body: "Elýeter bolsa, dogry pikirli bahalama. Kepillik däl. Satyn alyjy öz başdan barlamaly.",
      },
      {
        title: "9. Dilowçilik şertleri",
        body: "Dilowçy akkauntlary — MLP-den soň. Dilowçylar ähli bildirişleriň dogrulygyna jogapkär.",
      },
      {
        title: "10. Yzyna çykma we akkaunty pozmak",
        body: `Akkaunty programmada pozup bilersiňiz («Kabinet» bölüminde profiliňizi açyň we «Akkaunty poz» düwmesine basyň) ýa-da saýtymyzda akkauntyňyzdaky telefon belgisi ýa-da e-poçta salgysy bilen pozmagy sorap bilersiňiz. Pozmak 30 günlük lýgotly döwür başlaýar; şol döwürde telefon belgiňiz ýa-da e-poçta salgyňyz bilen gaýtadan girip, akkaunty dikeldip bolýar. 30 günden soň şahsy maglumatlar aýrylýar, bildirişler we çat anonim atanama saklanýar.

Carberk düzgünleri bozýan akkaunty bloklap biler.`,
      },
      {
        title: "11. Jogapkärçilik",
        body: "Kanuna laýyklykda, ulanyjylar arasyndaky çekişmeler we söwdalar üçin Carberk jogapkär däl.",
      },
      {
        title: "12. Şertleriň üýtgemeleri",
        body: "Esasy üýtgeşmeler programma arkaly duýdurylar.",
      },
      {
        title: "13. Kanun we habarlaşmak",
        body: "Türkmenistanyň kanunlary. bagtyyarkowusow.dev@gmail.com",
      },
    ],
  },
};

/**
 * Every rule here maps to something the product or its moderators enforce today:
 * the Listing publish checks, the media upload limits, the Listing report reasons,
 * and the admin moderation actions (block a Listing, suspend an account).
 * Do not add a rule that nothing enforces.
 */
export const postingRules: Record<Locale, LegalDocument> = {
  en: {
    title: "Posting rules",
    effectiveDate: "October 2, 2026",
    effectiveDateISO: "2026-10-02",
    lastRevised: "October 2, 2026",
    lastRevisedISO: "2026-10-02",
    sections: [
      {
        title: "1. What you may list",
        body: `- Each listing is for a real vehicle that you own or are allowed to sell.
- **One vehicle, one listing.** Do not post the same vehicle more than once. Moderators block duplicate listings.
- Choose the brand, model and year that match the vehicle. They cannot be changed after you publish, and neither can the VIN.`,
      },
      {
        title: "2. Photos",
        body: `- Use photos of the actual vehicle you are selling. Do not use photos of another vehicle, stock images, or photos copied from other listings.
- A listing needs at least 3 and up to 20 photos.
- Photos must be JPEG or WebP, up to 5 MB each. The app resizes and compresses your photos before upload.`,
      },
      {
        title: "3. Price, description and contact",
        body: `- **Price:** give the real asking price, in TMT, USD or AED. The price must be above zero. A placeholder price is misleading information.
- **Description:** write a true and complete description, up to 2,000 characters. Say whether the vehicle has been damaged; the app asks you this before you publish. For a used vehicle, give the mileage.
- **Contact:** keep calls, chat or both turned on, so buyers can reach you. Show only a phone number that you are entitled to use and that reaches you or the person selling the vehicle.`,
      },
      {
        title: "4. What is not allowed",
        body: `These are the reasons buyers can choose when they report a listing:

- **Spam**: the same vehicle posted again, or a listing that advertises something other than the vehicle.
- **Scam or fraud**: a listing for a vehicle that does not exist or that you cannot sell, or an attempt to take money from a buyer without a real sale.
- **Misleading information**: a wrong price, year, mileage or condition, hidden damage, or photos of another vehicle.
- **Wrong category**: a listing that is not a vehicle for sale, or that names the wrong brand or model.

The [Terms of Service](/en/legal/terms) also forbid stolen vehicles, vehicles with active liens that you do not disclose, and illegally modified vehicles.`,
      },
      {
        title: "5. What happens when a listing breaks the rules",
        body: `A listing appears as soon as you publish it; there is no review before that. Moderators review the listings that people report.

- If a listing breaks these rules, moderators can block the listing. A blocked listing disappears from search, other people can no longer open it, and you can no longer edit it.
- For serious or repeated breaches, moderators can suspend the account. While an account is suspended, it cannot publish, edit or republish listings, start chats, or send reports.

Moderators record a reason for every decision. If you think a decision is wrong, contact support.`,
      },
      {
        title: "6. Reporting a listing and contacting support",
        body: `To report a listing, open it in the app and tap **Report**, or open the menu at the top of the listing and choose **Report**. Pick a reason and send the report. If you choose **Other**, add a short description. You can report listings that are for sale, but not your own.

To contact support:

- Email: bagtyyarkowusow.dev@gmail.com
- Phone: +993 63 98 94 04`,
      },
    ],
  },
  ru: {
    title: "Правила размещения",
    effectiveDate: "2 октября 2026 г.",
    effectiveDateISO: "2026-10-02",
    lastRevised: "2 октября 2026 г.",
    lastRevisedISO: "2026-10-02",
    sections: [
      {
        title: "1. Что можно размещать",
        body: `- Каждое объявление — для реального автомобиля, который принадлежит вам или который вы вправе продавать.
- **Один автомобиль — одно объявление.** Не размещайте один и тот же автомобиль несколько раз. Модераторы блокируют повторные объявления.
- Укажите марку, модель и год, которые соответствуют автомобилю. После публикации их нельзя изменить, как и VIN.`,
      },
      {
        title: "2. Фотографии",
        body: `- Используйте фотографии именно того автомобиля, который продаёте. Не используйте фотографии другого автомобиля, стоковые изображения или фотографии из чужих объявлений.
- В объявлении должно быть от 3 до 20 фотографий.
- Фотографии — в формате JPEG или WebP, не больше 5 МБ каждая. Приложение само уменьшает и сжимает фотографии перед загрузкой.`,
      },
      {
        title: "3. Цена, описание и контакты",
        body: `- **Цена:** укажите реальную цену продажи в TMT, USD или AED. Цена должна быть больше нуля. Условная цена считается информацией, вводящей в заблуждение.
- **Описание:** напишите правдивое и полное описание, до 2000 символов. Укажите, был ли автомобиль повреждён; приложение спросит об этом перед публикацией. Для автомобиля с пробегом укажите пробег.
- **Контакты:** оставьте включёнными звонки, чат или и то и другое, чтобы покупатели могли с вами связаться. Указывайте только номер телефона, которым вы вправе пользоваться и по которому можно связаться с вами или с тем, кто продаёт автомобиль.`,
      },
      {
        title: "4. Что запрещено",
        body: `Это причины, которые покупатели могут выбрать, когда жалуются на объявление:

- **Спам**: тот же автомобиль, размещённый повторно, или объявление, которое рекламирует что-то кроме автомобиля.
- **Мошенничество**: объявление об автомобиле, которого нет или который вы не можете продать, либо попытка получить деньги с покупателя без настоящей продажи.
- **Вводящая в заблуждение информация**: неверные цена, год, пробег или состояние, скрытые повреждения или фотографии другого автомобиля.
- **Неверная категория**: объявление, которое не о продаже автомобиля, или с неверной маркой или моделью.

[Условия использования](/ru/legal/terms) также запрещают угнанные автомобили, автомобили с действующим залогом, о котором вы не сообщили, и незаконно переделанные автомобили.`,
      },
      {
        title: "5. Что происходит при нарушении правил",
        body: `Объявление появляется сразу после публикации; предварительной проверки нет. Модераторы рассматривают объявления, на которые пожаловались.

- Если объявление нарушает эти правила, модераторы могут заблокировать объявление. Заблокированное объявление пропадает из поиска, другие пользователи больше не могут его открыть, а редактировать его больше нельзя.
- При серьёзных или повторных нарушениях модераторы могут приостановить аккаунт. Пока аккаунт приостановлен, с него нельзя публиковать, редактировать и повторно публиковать объявления, начинать чаты и отправлять жалобы.

Модераторы указывают причину каждого решения. Если вы считаете решение ошибочным, свяжитесь с поддержкой.`,
      },
      {
        title: "6. Как пожаловаться на объявление и связаться с поддержкой",
        body: `Чтобы пожаловаться на объявление, откройте его в приложении и нажмите **Пожаловаться** или откройте меню вверху объявления и выберите **Пожаловаться**. Выберите причину и отправьте жалобу. Если вы выбрали **Другое**, добавьте короткое описание. Пожаловаться можно на объявления, которые продаются, но не на свои.

Связаться с поддержкой:

- Эл. почта: bagtyyarkowusow.dev@gmail.com
- Телефон: +993 63 98 94 04`,
      },
    ],
  },
  tk: {
    title: "Ýerleşdirme düzgünleri",
    effectiveDate: "2-nji oktýabr 2026",
    effectiveDateISO: "2026-10-02",
    lastRevised: "2-nji oktýabr 2026",
    lastRevisedISO: "2026-10-02",
    sections: [
      {
        title: "1. Näme ýerleşdirip bolýar",
        body: `- Her bildiriş size degişli ýa-da satmaga hakyňyz bolan hakyky ulag hakda bolmaly.
- **Bir ulag — bir bildiriş.** Şol bir ulagy birnäçe gezek ýerleşdirmäň. Moderatorlar gaýtalanýan bildirişleri bloklaýarlar.
- Ulaga laýyk gelýän markany, modeli we ýyly saýlaň. Çap edeniňizden soň olary, şeýle hem VIN-i üýtgedip bolmaýar.`,
      },
      {
        title: "2. Suratlar",
        body: `- Satýan ulagyňyzyň öz suratlaryny ulanyň. Başga ulagyň suratlaryny, stok suratlary ýa-da başga bildirişlerden göçürilen suratlary ulanmaň.
- Bildirişde azyndan 3, iň köp 20 surat bolmaly.
- Suratlar JPEG ýa-da WebP görnüşinde, her biri 5 MB-dan köp bolmaly däl. Programma suratlary ýüklemezden öň özi kiçeldýär we gysýar.`,
      },
      {
        title: "3. Baha, düşündiriş we habarlaşmak",
        body: `- **Baha:** hakyky satuw bahasyny TMT, USD ýa-da AED-de görkeziň. Baha noldan uly bolmaly. Şertli baha ýalňyş maglumat hasaplanýar.
- **Düşündiriş:** dogry we doly düşündiriş ýazyň, 2000 nyşana çenli. Ulaga zeper ýetip-ýetmändigini görkeziň; programma muny çap etmezden öň soraýar. Ulanylan ulag üçin geçen ýoluny görkeziň.
- **Habarlaşmak:** jaňlary, çaty ýa-da ikisini hem açyk goýuň, alyjylar siz bilen habarlaşyp bilsinler. Diňe ulanmaga hakyňyz bolan we size ýa-da ulagy satýan adama ýetýän telefon belgisini görkeziň.`,
      },
      {
        title: "4. Näme gadagan",
        body: `Alyjylar bildiriş barada şikaýat edenlerinde şu sebäpleri saýlap bilýärler:

- **Spam**: şol bir ulagyň gaýtadan ýerleşdirilmegi ýa-da ulagdan başga zady mahabatlandyrýan bildiriş.
- **Galplyk**: bar bolmadyk ýa-da satyp bilmeýän ulagyňyz hakda bildiriş, ýa-da hakyky satuwsyz alyjydan pul almaga synanyşyk.
- **Ýalňyş maglumat**: nädogry baha, ýyl, geçen ýol ýa-da ýagdaý, gizlenen zeper ýa-da başga ulagyň suratlary.
- **Nädogry kategoriýa**: ulag satmak hakda däl bildiriş ýa-da nädogry markaly ýa-da modelli bildiriş.

[Ulanyş şertleri](/tk/legal/terms) mundan başga-da ogurlanan ulaglary, aýdylmadyk girewdäki ulaglary we kanunsyz üýtgedilen ulaglary gadagan edýär.`,
      },
      {
        title: "5. Düzgünler bozulanda näme bolýar",
        body: `Bildiriş çap edilen badyna görünýär; öňünden barlag ýok. Moderatorlar şikaýat edilen bildirişlere seredýärler.

- Bildiriş bu düzgünleri bozýan bolsa, moderatorlar bildirişi bloklap bilerler. Bloklanan bildiriş gözlegden aýrylýar, beýleki ulanyjylar ony indi açyp bilmeýärler we ony indi redaktirläp bolmaýar.
- Çynlakaý ýa-da gaýtalanýan bozulmalarda moderatorlar akkaunty togtadyp bilerler. Akkaunt togtadylan wagty ondan bildiriş çap edip, redaktirläp ýa-da gaýtadan çap edip, çat başlap we şikaýat iberip bolmaýar.

Moderatorlar her karar üçin sebäbini ýazýarlar. Karar nädogry diýip pikir edýän bolsaňyz, goldaw bilen habarlaşyň.`,
      },
      {
        title: "6. Bildiriş barada şikaýat etmek we goldaw bilen habarlaşmak",
        body: `Bildiriş barada şikaýat etmek üçin ony programmada açyň we **Şikaýat et** düwmesine basyň ýa-da bildirişiň ýokarsyndaky menýuny açyp, **Şikaýat et** saýlaň. Sebäbi saýlaň we şikaýaty iberiň. **Başga** saýlasaňyz, gysga düşündiriş goşuň. Satuwdaky bildirişler barada şikaýat edip bolýar, ýöne öz bildirişleriňiz barada däl.

Goldaw bilen habarlaşmak:

- E-poçta: bagtyyarkowusow.dev@gmail.com
- Telefon: +993 63 98 94 04`,
      },
    ],
  },
};
