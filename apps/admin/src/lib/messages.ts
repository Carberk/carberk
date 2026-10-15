export type AdminLocale = "tk" | "ru" | "en";
export function normalizeAdminLocale(value: unknown): AdminLocale {
  return value === "tk" || value === "en" ? value : "ru";
}
export const adminLocaleNames = { tk: "Türkmençe", ru: "Русский", en: "English" };
export const adminLocaleTags = { tk: "tk-TM", ru: "ru-RU", en: "en-GB" };
const messages: Record<string, [string, string]> = {
  "Заблокирован": ["Bloklanan", "Suspended"],
  "Далее": ["Indiki", "Next"],
  "pending_review": ["Barlaga garaşylýar", "Pending review"],
  "rejected": ["Ret edildi", "Rejected"],
  "Загрузка...": ["Ýüklenýär...", "Loading..."],
  "Поиск по номеру, VIN, марке или модели": ["Belgi, VIN, marka ýa-da model boýunça gözleg", "Search by number, VIN, brand or model"],
  "Поиск по имени или номеру пользователя": ["Ulanyjynyň ady ýa-da belgisi boýunça gözleg", "Search by name or user number"],
  "Марка": ["Marka", "Brand"],
  "Регион": ["Sebit", "Region"],
  "Создано с": ["Döredilen senesi, başy", "Created from"],
  "Создано по": ["Döredilen senesi, soňy", "Created through"],
  "Найти": ["Gözle", "Search"],
  "Найдено": ["Tapylan", "Results"],
  "Проверьте параметры поиска.": ["Gözleg maglumatlaryny barlaň.", "Check the search parameters."],

  "Запись удалена или недоступна.": ["Ýazgy pozulan ýa-da elýeterli däl.", "The record was deleted or is unavailable."],
  "Нет записей по выбранным фильтрам.": ["Saýlanan süzgüçlere laýyk ýazgy ýok.", "No records match these filters."],
  "Видео недоступно до подключения разрешённого тестерам просмотра.": ["Synagçylar üçin rugsatly wideo görkezilişi birikdirilýänçä wideo elýeterli däl.", "Video is unavailable until tester-authorized playback is connected."],
  "Дата регистрации": ["Hasaba alnan senesi", "Member since"],
  "Без блокировки": ["Bloklanmadyk", "Not suspended"],
  "Удаление запланировано": ["Pozmak meýilleşdirildi", "Deletion scheduled"],
  "Удаление не запланировано": ["Pozmak meýilleşdirilmedi", "No deletion scheduled"],
  "Удалено": ["Pozulan", "Deleted"],
  "Поколение": ["Nesil", "Generation"],
  "Цвет": ["Reňk", "Color"],
  "Кузов": ["Kuzow", "Body type"],
  "Двигатель": ["Hereketlendiriji", "Engine"],
  "Коробка передач": ["Geçirijiler gutusy", "Transmission"],
  "Привод": ["Ýörediji", "Drive type"],
  "Пробег, км": ["Geçen ýoly, km", "Mileage, km"],
  "Состояние": ["Ýagdaýy", "Condition"],
  "Мощность": ["Kuwwaty", "Power"],
  "Повреждения": ["Zeperler", "Damage"],
  "Да": ["Hawa", "Yes"],
  "Нет": ["Ýok", "No"],
  "Известные проблемы": ["Belli meseleler", "Known issues"],
  "Местоположение": ["Ýerleşýän ýeri", "Location"],
  "Создано": ["Döredildi", "Created"],
  "Обновлено": ["Täzelendi", "Updated"],
  "Опубликовано": ["Ýerleşdirildi", "Published"],
  "Продано": ["Satyldy", "Sold"],
  "Продавец": ["Satyjy", "Seller"],
  "Жалобы на объявление": ["Bildiriş barada şikaýatlar", "Listing complaints"],
  "Жалобы на пользователя": ["Ulanyjy barada şikaýatlar", "User complaints"],
  "Объявления пользователя": ["Ulanyjynyň bildirişleri", "User listings"],
  "Показаны последние 25 объявлений.": ["Soňky 25 bildiriş görkezilýär.", "Showing the latest 25 listings."],
  "draft": ["Garalama", "Draft"],
  "active": ["Işjeň", "Active"],
  "sold": ["Satyldy", "Sold"],
  "archived": ["Arhiwde", "Archived"],
  "banned": ["Bloklanan", "Banned"],
  "used": ["Ulanylan", "Used"],
  "new": ["Täze", "New"],

  "Язык": [
    "Dil",
    "Language"
  ],
  "Рабочее пространство": [
    "Iş meýdançasy",
    "Workspace"
  ],
  "Объявления": [
    "Bildirişler",
    "Listings"
  ],
  "Пользователи": [
    "Ulanyjylar",
    "Users"
  ],
  "Допуск бизнеса": [
    "Işewürlik rugsady",
    "Business admission"
  ],
  "Сервис и поддержка": [
    "Hyzmat we goldaw",
    "Service and Support"
  ],
  "Диагностика": [
    "Diagnostika",
    "Diagnostics"
  ],
  "Улучшения": [
    "Gowulandyrmalar",
    "Improvement"
  ],
  "Доступ определяется текущими полномочиями. Данные разделов появятся после подключения их сервисов.": [
    "Giriş häzirki ygtyýarlyklara baglydyr. Bölümleriň maglumatlary hyzmatlar birikdirilenden soň görkeziler.",
    "Access follows current capabilities. Section data will appear when its service is connected."
  ],
  "Раздел пока недоступен. Данные не загружены.": [
    "Bölüm entek elýeterli däl. Maglumatlar ýüklenmedi.",
    "This section is not available yet. Data has not been loaded."
  ],
  "Открыть очередь модерации": [
    "Moderasiýa nobatyny aç",
    "Open moderation queue"
  ],
  "Жалобы": [
    "Şikaýatlar",
    "Complaints"
  ],
  "Интерес к проверкам": [
    "Barlaglara gyzyklanma",
    "Inspection interest"
  ],
  "Бренды": [
    "Markalar",
    "Brands"
  ],
  "Аудит": [
    "Audit",
    "Audit"
  ],
  "Телефон": [
    "Telefon",
    "Phone"
  ],
  "Вход в панель администратора": [
    "Dolandyryş paneline giriş",
    "Sign in to the admin console"
  ],
  "Введите номер телефона для получения кода подтверждения.": [
    "Tassyklama koduny almak üçin telefon belgiňizi giriziň.",
    "Enter your phone number to receive a verification code."
  ],
  "Двухфакторная аутентификация": [
    "Iki basgançakly tassyklama",
    "Two-factor authentication"
  ],
  "Введите код из приложения-аутентификатора.": [
    "Tassyklama programmasyndaky kody giriziň.",
    "Enter the code from your authenticator app."
  ],
  "Отсканируйте QR-код в приложении-аутентификаторе и введите код.": [
    "QR-kody tassyklama programmasy bilen skanirläň we kody giriziň.",
    "Scan the QR code with your authenticator app and enter the code."
  ],
  "Резервные коды": [
    "Ätiýaçlyk kodlar",
    "Backup codes"
  ],
  "Сохраните эти коды — они больше не будут показаны.": [
    "Bu kodlary saklaň. Olar gaýtadan görkezilmez.",
    "Save these codes. They will not be shown again."
  ],
  "Отправить код": [
    "Kody iber",
    "Send code"
  ],
  "Отправка...": [
    "Iberilýär...",
    "Sending..."
  ],
  "Код подтверждения": [
    "Tassyklama kody",
    "Verification code"
  ],
  "Подтвердить": [
    "Tassykla",
    "Verify"
  ],
  "Проверка...": [
    "Barlanylýar...",
    "Verifying..."
  ],
  "Код из приложения или резервный код": [
    "Programmadaky kod ýa-da ätiýaçlyk kody",
    "Authenticator or backup code"
  ],
  "QR-код для настройки 2FA": [
    "2FA sazlamak üçin QR-kod",
    "QR code for two-factor setup"
  ],
  "Скопировать коды": [
    "Kodlary göçür",
    "Copy codes"
  ],
  "Скопировано": [
    "Göçürildi",
    "Copied"
  ],
  "Продолжить": [
    "Dowam et",
    "Continue"
  ],
  "Назад": [
    "Yza",
    "Back"
  ],
  "Введите код.": [
    "Kody giriziň.",
    "Enter a code."
  ],
  "Введите номер телефона в формате +993XXXXXXXX": [
    "Telefon belgiňizi +993XXXXXXXX görnüşinde giriziň",
    "Enter a phone number in the format +993XXXXXXXX"
  ],
  "Неверный формат номера телефона.": [
    "Telefon belgisiniň görnüşi nädogry.",
    "Invalid phone number format."
  ],
  "Код должен содержать 6 цифр.": [
    "Kod 6 sandan ybarat bolmaly.",
    "The code must contain 6 digits."
  ],
  "Слишком много попыток. Попробуйте позже.": [
    "Synanyşyk gaty köp. Soňrak gaýtadan synanyşyň.",
    "Too many attempts. Try again later."
  ],
  "Слишком много попыток. Подождите и попробуйте снова.": [
    "Synanyşyk gaty köp. Biraz garaşyň we gaýtadan synanyşyň.",
    "Too many attempts. Wait and try again."
  ],
  "Не удалось отправить код. Попробуйте позже.": [
    "Kody ibermek başartmady. Soňrak gaýtadan synanyşyň.",
    "Could not send the code. Try again later."
  ],
  "Не удалось подтвердить код. Попробуйте позже.": [
    "Kody tassyklamak başartmady. Soňrak gaýtadan synanyşyň.",
    "Could not verify the code. Try again later."
  ],
  "Неверный код. Попробуйте ещё раз.": [
    "Kod nädogry. Gaýtadan synanyşyň.",
    "Incorrect code. Try again."
  ],
  "Двухфакторная аутентификация уже настроена.": [
    "Iki basgançakly tassyklama eýýäm sazlanan.",
    "Two-factor authentication is already set up."
  ],
  "Не удалось начать настройку 2FA. Попробуйте позже.": [
    "2FA sazlamasyny başlatmak başartmady. Soňrak gaýtadan synanyşyň.",
    "Could not start two-factor setup. Try again later."
  ],
  "Сессия истекла. Войдите снова.": [
    "Sessiýanyň möhleti gutardy. Täzeden giriň.",
    "Your session expired. Sign in again."
  ],
  "Доступ к панели администратора ограничен. Обратитесь к администратору.": [
    "Dolandyryş paneline giriş çäklendirilen. Dolandyryja ýüz tutuň.",
    "Admin access is restricted. Contact an administrator."
  ],
  "Очередь жалоб": [
    "Şikaýatlar nobaty",
    "Complaint queue"
  ],
  "В ожидании": [
    "Garaşylýar",
    "Pending"
  ],
  "Обработана": [
    "Seredildi",
    "Actioned"
  ],
  "Обработаны": [
    "Seredilen",
    "Actioned"
  ],
  "Отклонена": [
    "Ret edildi",
    "Dismissed"
  ],
  "Отклонены": [
    "Ret edilen",
    "Dismissed"
  ],
  "Статус": [
    "Ýagdaý",
    "Status"
  ],
  "Тип": [
    "Görnüş",
    "Type"
  ],
  "Все": [
    "Ählisi",
    "All"
  ],
  "Объявление": [
    "Bildiriş",
    "Listing"
  ],
  "Пользователь": [
    "Ulanyjy",
    "User"
  ],
  "Сообщение": [
    "Habar",
    "Message"
  ],
  "Применить": [
    "Ulan",
    "Apply"
  ],
  "Причина": [
    "Sebäp",
    "Reason"
  ],
  "Цель": [
    "Nyşana",
    "Target"
  ],
  "Дата": [
    "Sene",
    "Date"
  ],
  "Очередь пуста 🎉": [
    "Nobat boş",
    "Queue is empty"
  ],
  "Нет жалоб в ожидании обработки.": [
    "Seredilmegine garaşýan şikaýat ýok.",
    "No complaints are awaiting review."
  ],
  "Ничего не найдено": [
    "Hiç zat tapylmady",
    "Nothing found"
  ],
  "По выбранным фильтрам нет жалоб.": [
    "Saýlanan süzgüçlere laýyk şikaýat ýok.",
    "No complaints match these filters."
  ],
  "Спам": [
    "Spam",
    "Spam"
  ],
  "Мошенничество": [
    "Aldaw",
    "Scam"
  ],
  "Вводит в заблуждение": [
    "Ýalňyşdyrýan maglumat",
    "Misleading"
  ],
  "Неверная категория": [
    "Nädogry kategoriýa",
    "Wrong category"
  ],
  "Домогательство": [
    "Biynjalyk etmek",
    "Harassment"
  ],
  "Другое": [
    "Başga",
    "Other"
  ],
  "жалоба": [
    "şikaýat",
    "complaint"
  ],
  "жалобы": [
    "şikaýat",
    "complaints"
  ],
  "жалоб": [
    "şikaýat",
    "complaints"
  ],
  "запись": [
    "ýazgy",
    "entry"
  ],
  "записи": [
    "ýazgy",
    "entries"
  ],
  "записей": [
    "ýazgy",
    "entries"
  ],
  "заявка": [
    "ýüz tutma",
    "request"
  ],
  "заявки": [
    "ýüz tutma",
    "requests"
  ],
  "заявок": [
    "ýüz tutma",
    "requests"
  ],
  "Аудит действий": [
    "Hereketleriň auditi",
    "Action audit"
  ],
  "Действие": [
    "Hereket",
    "Action"
  ],
  "Администратор": [
    "Dolandyryjy",
    "Administrator"
  ],
  "Тип цели": [
    "Nyşananyň görnüşi",
    "Target type"
  ],
  "Нет записей": [
    "Ýazgy ýok",
    "No entries"
  ],
  "По выбранным фильтрам аудит пуст.": [
    "Saýlanan süzgüçlere laýyk audit ýazgysy ýok.",
    "No audit entries match these filters."
  ],
  "Блокировка объявления": [
    "Bildirişi petiklemek",
    "Listing ban"
  ],
  "Разблокировка объявления": [
    "Bildirişiň petigini aýyrmak",
    "Listing unban"
  ],
  "Блокировка пользователя": [
    "Ulanyjyny petiklemek",
    "User suspension"
  ],
  "Разблокировка пользователя": [
    "Ulanyjynyň petigini aýyrmak",
    "User reinstatement"
  ],
  "Обработка жалобы": [
    "Şikaýata seretmek",
    "Complaint review"
  ],
  "Удаление фото профиля": [
    "Profil suratyny aýyrmak",
    "Profile photo removal"
  ],
  "Повышение до админа": [
    "Dolandyryjy bellemek",
    "Admin promotion"
  ],
  "Просмотр сообщения по жалобе": [
    "Şikaýat edilen habary görmek",
    "Reported message read"
  ],
  "Действия": [
    "Hereketler",
    "Actions"
  ],
  "Действия с объявлением": [
    "Bildiriş hereketleri",
    "Listing actions"
  ],
  "Действия с пользователем": [
    "Ulanyjy hereketleri",
    "User actions"
  ],
  "Заблокировать объявление": [
    "Bildirişi petikle",
    "Ban listing"
  ],
  "Разблокировать объявление": [
    "Bildirişiň petigini aýyr",
    "Unban listing"
  ],
  "Заблокировать пользователя": [
    "Ulanyjyny petikle",
    "Suspend user"
  ],
  "Разблокировать пользователя": [
    "Ulanyjynyň petigini aýyr",
    "Reinstate user"
  ],
  "Заблокировать автора сообщения": [
    "Habaryň awtoryny petikle",
    "Suspend message sender"
  ],
  "Заблокировать": [
    "Petikle",
    "Suspend"
  ],
  "Разблокировать": [
    "Petigi aýyr",
    "Reinstate"
  ],
  "Отклонить жалобу": [
    "Şikaýaty ret et",
    "Dismiss complaint"
  ],
  "Отклонить": [
    "Ret et",
    "Dismiss"
  ],
  "Обязательно: укажите причину...": [
    "Hökmany: sebäbi görkeziň...",
    "Required: enter a reason..."
  ],
  "Укажите причину (1–1000 символов).": [
    "Sebäbi görkeziň (1–1000 nyşan).",
    "Enter a reason of 1–1000 characters."
  ],
  "Обработка...": [
    "Işlenilýär...",
    "Processing..."
  ],
  "Недостаточно прав.": [
    "Ygtyýar ýeterlik däl.",
    "Insufficient permission."
  ],
  "Действие временно недоступно.": [
    "Hereket wagtlaýyn elýeterli däl.",
    "This action is temporarily unavailable."
  ],
  "Нельзя применять действия к собственной учётной записи.": [
    "Öz hasabyňyza bu hereketi ulanyp bolmaýar.",
    "You cannot perform this action on your own account."
  ],
  "Администраторов нельзя заблокировать.": [
    "Dolandyryjylary petikläp bolmaýar.",
    "Administrators cannot be suspended."
  ],
  "Фото администраторов нельзя удалять.": [
    "Dolandyryjylaryň suratlaryny aýryp bolmaýar.",
    "Administrators' photos cannot be removed."
  ],
  "Не удалось выполнить действие.": [
    "Hereketi ýerine ýetirmek başartmady.",
    "Could not complete the action."
  ],
  "Неизвестная ошибка. Попробуйте позже.": [
    "Nämälim ýalňyşlyk. Soňrak gaýtadan synanyşyň.",
    "Unknown error. Try again later."
  ],
  "Жалоба уже обработана другим администратором. Обновите страницу.": [
    "Şikaýata başga dolandyryjy eýýäm seretdi. Sahypany täzeläň.",
    "Another administrator has reviewed this complaint. Refresh the page."
  ],
  "Жалоба уже обработана другим администратором. Страница обновлена.": [
    "Şikaýata başga dolandyryjy eýýäm seretdi. Sahypa täzelendi.",
    "Another administrator has reviewed this complaint. The page was refreshed."
  ],
  "Состояние цели изменилось. Обновите страницу.": [
    "Nyşananyň ýagdaýy üýtgedi. Sahypany täzeläň.",
    "The target state changed. Refresh the page."
  ],
  "Состояние цели изменилось. Страница обновлена.": [
    "Nyşananyň ýagdaýy üýtgedi. Sahypa täzelendi.",
    "The target state changed. The page was refreshed."
  ],
  "Цель больше не доступна для действия. Обновите страницу.": [
    "Nyşana bu hereket üçin indi elýeterli däl. Sahypany täzeläň.",
    "The target is no longer available for this action. Refresh the page."
  ],
  "Цель больше не доступна для действия. Страница обновлена.": [
    "Nyşana bu hereket üçin indi elýeterli däl. Sahypa täzelendi.",
    "The target is no longer available for this action. The page was refreshed."
  ],
  "Временно недоступно": [
    "Wagtlaýyn elýeterli däl",
    "Temporarily unavailable"
  ],
  "Временно недоступно. Попробуйте ещё раз.": [
    "Wagtlaýyn elýeterli däl. Gaýtadan synanyşyň.",
    "Temporarily unavailable. Try again."
  ],
  "Обновите страницу через несколько секунд. Сессия сохранена.": [
    "Birnäçe sekuntdan sahypany täzeläň. Sessiýa saklandy.",
    "Refresh the page in a few seconds. Your session is preserved."
  ],
  "Попробовать ещё раз": [
    "Gaýtadan synanyş",
    "Try again"
  ],
  "Бренд не найден.": [
    "Marka tapylmady.",
    "Brand not found."
  ],
  "Выберите файл логотипа.": [
    "Logotip faýlyny saýlaň.",
    "Choose a logo file."
  ],
  "Загрузите файл SVG, PNG или WebP.": [
    "SVG, PNG ýa-da WebP faýlyny ýükläň.",
    "Upload an SVG, PNG or WebP file."
  ],
  "Загрузить": [
    "Ýükle",
    "Upload"
  ],
  "Заменить": [
    "Çalyş",
    "Replace"
  ],
  "Удалить фото": [
    "Suraty aýyr",
    "Remove photo"
  ],
  "Удалить фото профиля": [
    "Profil suratyny aýyr",
    "Remove profile photo"
  ],
  "Удалить фото профиля и обработать жалобу?": [
    "Profil suratyny aýryp, şikaýata seredilsinmi?",
    "Remove the profile photo and action the complaint?"
  ],
  "Подтвердить удаление": [
    "Aýyrmagy tassykla",
    "Confirm removal"
  ],
  "Отмена": [
    "Ýatyr",
    "Cancel"
  ],
  "Фото удалено.": [
    "Surat aýryldy.",
    "Photo removed."
  ],
  "Фото профиля": [
    "Profil suraty",
    "Profile photo"
  ],
  "Назначенный аватар": [
    "Bellenen awatar",
    "Assigned avatar"
  ],
  "Фото профиля недоступно.": [
    "Profil suraty elýeterli däl.",
    "Profile photo unavailable."
  ],
  "Файл пустой.": [
    "Faýl boş.",
    "The file is empty."
  ],
  "Файл не читается как изображение.": [
    "Faýly surat hökmünde okap bolmaýar.",
    "The file cannot be read as an image."
  ],
  "Содержимое файла не совпадает с его типом.": [
    "Faýlyň mazmuny onuň görnüşine gabat gelmeýär.",
    "The file content does not match its type."
  ],
  "Логотип должен быть почти квадратным (стороны не больше 1:1,25).": [
    "Logotip inedördüle ýakyn bolmaly (taraplary 1:1,25-den uly däl).",
    "The logo must be nearly square with an aspect ratio no wider than 1:1.25."
  ],
  "Загруженный файл не найден. Попробуйте ещё раз.": [
    "Ýüklenen faýl tapylmady. Gaýtadan synanyşyň.",
    "The uploaded file was not found. Try again."
  ],
  "Не удалось загрузить файл в хранилище. Попробуйте ещё раз.": [
    "Faýly ammara ýüklemek başartmady. Gaýtadan synanyşyň.",
    "Could not upload the file to storage. Try again."
  ],
  "SVG содержит DOCTYPE, элементы с префиксом пространства имён, скрипты, обработчики событий, внешние ссылки или встроенное содержимое.": [
    "SVG-de rugsat berilmeýän DOCTYPE, at giňişligi, skript, waka işleýjisi, daşarky salgylanma ýa-da içerki mazmun bar.",
    "The SVG contains a prohibited DOCTYPE, namespace, script, event handler, external link or embedded content."
  ],
  "Интерес к проверкам Carberk": [
    "Carberk barlaglaryna gyzyklanma",
    "Carberk inspection interest"
  ],
  "Всего заявок": [
    "Ýüz tutmalaryň jemi",
    "Total requests"
  ],
  "Ответов о цене": [
    "Baha jogaplary",
    "Price responses"
  ],
  "Средняя готовность платить": [
    "Tölemäge ortaça taýýarlyk",
    "Average willingness to pay"
  ],
  "Покупатели": [
    "Alyjylar",
    "Buyers"
  ],
  "Продавцы": [
    "Satyjylar",
    "Sellers"
  ],
  "Пока нет заявок": [
    "Entek ýüz tutma ýok",
    "No requests yet"
  ],
  "Автор жалобы:": [
    "Şikaýatçy:",
    "Reporter:"
  ],
  "Автор сообщения:": [
    "Habaryň awtory:",
    "Message sender:"
  ],
  "Всего жалоб от отправителя:": [
    "Şikaýatçynyň şikaýatlarynyň jemi:",
    "Total complaints by reporter:"
  ],
  "Дата обработки:": [
    "Seredilen sene:",
    "Reviewed:"
  ],
  "Дата:": [
    "Sene:",
    "Date:"
  ],
  "Жалоб на цель в ожидании:": [
    "Nyşana boýunça garaşylýan şikaýatlar:",
    "Pending complaints about target:"
  ],
  "Название:": [
    "Ady:",
    "Name:"
  ],
  "Обработал:": [
    "Sereden:",
    "Reviewed by:"
  ],
  "Отправлено:": [
    "Iberilen:",
    "Sent:"
  ],
  "Причина:": [
    "Sebäp:",
    "Reason:"
  ],
  "Роль:": [
    "Rol:",
    "Role:"
  ],
  "Статус объявления:": [
    "Bildirişiň ýagdaýy:",
    "Listing status:"
  ],
  "Тип:": [
    "Görnüş:",
    "Type:"
  ],
  "Есть вложение": [
    "Goşundy bar",
    "Has attachment"
  ],
  "Пользователь удалён": [
    "Ulanyjy öçürilen",
    "User deleted"
  ],
  "Жалоба": [
    "Şikaýat",
    "Complaint"
  ],
  "ID цели": [
    "Nyşananyň ID-si",
    "Target ID"
  ],
  "Страница": [
    "Sahypa",
    "Page"
  ],
  "из": [
    "/",
    "of"
  ],
  "Вперёд": [
    "Öňe",
    "Next"
  ],
  "Удалить": [
    "Aýyr",
    "Remove"
  ],
  "Логотипы:": [
    "Logotipler:",
    "Logos:"
  ],
  ". SVG, PNG или WebP, до": [
    ". SVG, PNG ýa-da WebP, iň köp",
    ". SVG, PNG or WebP, up to"
  ],
  "КБ, почти квадратные. Без логотипа приложение показывает первую букву.": [
    "KB, inedördüle ýakyn. Logotipsiz programma ilkinji harpy görkezýär.",
    "KB, nearly square. Without a logo the app shows the first letter."
  ],
  "Брендов пока нет.": [
    "Entek marka ýok.",
    "No brands yet."
  ],
  "Причина действия": [
    "Hereketiň sebäbi",
    "Action reason"
  ],
  "Действие выполнено успешно.": [
    "Hereket üstünlikli ýerine ýetirildi.",
    "Action completed successfully."
  ],
  "← Назад к очереди": [
    "Nobata dolan",
    "Back to queue"
  ],
  "Объявление будет скрыто из публичного доступа. Новые сообщения и контакты будут заблокированы. Существующие переписки останутся доступными.": [
    "Bildiriş köpçülige görünmez. Täze habarlar we aragatnaşyk petiklener. Öňki söhbetler elýeterli bolar.",
    "The listing will be hidden from public access. New messages and contacts will be blocked. Existing conversations remain available."
  ],
  "Объявление будет восстановлено в статус active. Жалобы автоматически не закрываются.": [
    "Bildiriş active ýagdaýyna gaýtarylar. Şikaýatlar awtomatik ýapylmaýar.",
    "The listing will return to active status. Complaints are not automatically closed."
  ],
  "Действия модерации временно недоступны.": [
    "Moderasiýa hereketleri wagtlaýyn elýeterli däl.",
    "Moderation actions are temporarily unavailable."
  ],
  "Жалоба подана": [
    "Şikaýat iberildi",
    "Complaint submitted"
  ],
  "Цель жалобы": [
    "Şikaýatyň nyşanasy",
    "Complaint target"
  ],
  "Пользователь заблокирован": [
    "Ulanyjy petiklenen",
    "User suspended"
  ],
  "Перейти к действиям →": [
    "Hereketleri aç",
    "Open actions"
  ],
  "Обработка": [
    "Serediliş",
    "Review"
  ],
  "Жалоба будет закрыта без изменения состояния цели.": [
    "Şikaýat nyşananyň ýagdaýyny üýtgetmezden ýapylar.",
    "The complaint will close without changing the target state."
  ],
  "Объявление будет скрыто из публичного доступа. Новые сообщения и контакты будут заблокированы.": [
    "Bildiriş köpçülige görünmez. Täze habarlar we aragatnaşyk petiklener.",
    "The listing will be hidden from public access. New messages and contacts will be blocked."
  ],
  "Объявление уже неактивно или недоступно для блокировки.": [
    "Bildiriş eýýäm işjeň däl ýa-da petiklemek üçin elýeterli däl.",
    "The listing is already inactive or unavailable for banning."
  ],
  "Фото будет удалено, и снова появится назначенный аватар. Жалоба будет обработана.": [
    "Surat aýrylar we bellenen awatar gaýtadan görkeziler. Şikaýata serediler.",
    "The photo will be removed and the assigned avatar will return. The complaint will be actioned."
  ],
  "Пользователь не сможет создавать объявления, отправлять сообщения или совершать другие действия.": [
    "Ulanyjy bildiriş döredip, habar iberip ýa-da başga hereketleri edip bilmez.",
    "The user will be unable to create listings, send messages or perform other actions."
  ],
  "Администраторов нельзя заблокировать через очередь жалоб.": [
    "Dolandyryjylary şikaýat nobatyndan petikläp bolmaýar.",
    "Administrators cannot be suspended through the complaint queue."
  ],
  "Пользователь уже заблокирован или недоступен для блокировки.": [
    "Ulanyjy eýýäm petiklenen ýa-da petiklemek üçin elýeterli däl.",
    "The user is already suspended or unavailable for suspension."
  ],
  "Некорректные параметры пагинации.": [
    "Sahypalama sazlamalary nädogry.",
    "Invalid pagination parameters."
  ],
  "Когда покупатели или продавцы оставят интерес к проверке, он появится здесь.": [
    "Alyjylar ýa-da satyjylar barlaga gyzyklanma bildirende, ol şu ýerde görkeziler.",
    "Buyer or seller inspection interest will appear here."
  ],
  "Пользователь не сможет создавать объявления, отправлять сообщения или совершать другие действия. Существующие переписки останутся доступными.": [
    "Ulanyjy bildiriş döredip, habar iberip ýa-da başga hereketleri edip bilmez. Öňki söhbetler elýeterli bolar.",
    "The user will be unable to create listings, send messages or perform other actions. Existing conversations remain available."
  ],
  "Пользователь будет восстановлен. История блокировки сохранится в аудите.": [
    "Ulanyjynyň girişi dikeldiler. Petikleme taryhy auditde saklanar.",
    "The user will be reinstated. Suspension history remains in the audit."
  ],
  "Dev mode — код:": [
    "Synag tertibi, kod:",
    "Development mode, code:"
  ],
  "Изменить номер": [
    "Belgini üýtget",
    "Change number"
  ],
  "Используйте приложение Google Authenticator, 1Password или аналогичное.": [
    "Google Authenticator, 1Password ýa-da meňzeş programmany ulanyň.",
    "Use Google Authenticator, 1Password or a similar app."
  ],
  "Код из приложения": [
    "Programmadaky kod",
    "Authenticator code"
  ],
  "Код из приложения-аутентификатора": [
    "Tassyklama programmasyndaky kod",
    "Code from authenticator app"
  ],
  "Сохраните эти коды сейчас — они не будут показаны снова.": [
    "Bu kodlary häzir saklaň. Olar gaýtadan görkezilmez.",
    "Save these codes now. They will not be shown again."
  ],
  "Копировать": [
    "Göçür",
    "Copy"
  ]
};
export function translateAdmin(text: string, locale: AdminLocale): string {
  if (locale === "ru") return ({pending_review:"На проверке",rejected:"Отклонено",draft:"Черновик",active:"Активно",sold:"Продано",archived:"В архиве",banned:"Заблокировано",used:"С пробегом",new:"Новое"} as Record<string,string>)[text] ?? text;
  const size = text.match(/^Файл больше (\d+) КБ\.$/);
  if (size) return locale === "tk" ? `Faýl ${size[1]} KB-dan uly.` : `The file exceeds ${size[1]} KB.`;
  const otp = text.match(/^Введите 6-значный код, отправленный на (.+)$/);
  if (otp) return locale === "tk" ? `${otp[1]} belgisine iberilen 6 sanly kody giriziň` : `Enter the 6-digit code sent to ${otp[1]}`;
  return messages[text]?.[locale === "tk" ? 0 : 1] ?? text;
}
