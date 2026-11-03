import { useTranslation } from "react-i18next";

const en = {
  title: "Listing video upload prototype", dev: "Dev / reviewer · local only",
  intro: "Synthetic storyboards and descriptor data. No encoded video, upload or service calls.",
  deniedTitle: "Review prototype unavailable", denied: "This prototype is disabled in production builds.",
  empty: "Empty slot", selection: "Library selection", preview: "Preview", trim: "Trim", poster: "Poster",
  preparing: "Preparing", uploading: "Uploading", paused: "Paused", processing: "Processing", failed: "Failed", ready: "Ready",
  state: "Video state: {{state}}", photos: "Photos preserved: {{count}} required photos",
  fields: "Listing description: {{value}}", description: "Synthetic Listing", publishable: "Required photos are publishable",
  pending: "Optional video pending", failedOptional: "Optional video failed", readyOptional: "Active video ready", noVideo: "No optional video",
  active: "Current ready video", replacement: "Pending replacement", add: "Add video from library", another: "Choose another video",
  library: "Synthetic library", eligible: "Eligible", ineligible: "Ineligible", permission: "Permission denied",
  scenario: "Synthetic access: {{state}}", setEligible: "Use eligible scenario", setIneligible: "Use ineligible scenario", setPermission: "Deny synthetic permission",
  ineligibleHelp: "This synthetic account cannot select video. Photos and fields remain available.",
  permissionHelp: "Library permission is denied. Photos, fields and the previous video selection are preserved.",
  choose: "Choose {{seconds}}-second clip", closeLibrary: "Return to preserved selection", restore: "Restore synthetic access",
  trimOptional: "Trim is optional for this clip.", trimRequired: "Choose an interval of at most 90 seconds. The first 90 seconds are selected.",
  trimAction: "Trim video", posterAction: "Continue to poster", use: "Use video and prepare locally",
  duration: "Selected: {{start}}s to {{end}}s · {{duration}}s / 90s maximum", posterAt: "Poster at {{seconds}}s",
  start: "Video start", end: "Video end", decrease: "{{handle}} minus 1 second", increase: "{{handle}} plus 1 second",
  timeline: "Synthetic thumbnail timeline", frame: "Synthetic frame at {{seconds}}s", chooseFrame: "Choose poster at {{seconds}}s",
  posterEarlier: "Poster minus 1 second", posterLater: "Poster plus 1 second", editTrim: "Edit trim",
  interval: "Select an interval inside the source.", tooLong: "Selection exceeds the 90-second maximum.", invalidPoster: "Choose a poster inside the selected interval.",
  finishPrepare: "Finish local preparation", prepareHelp: "Only the selected interval is represented. The original is never an upload fallback.",
  prepared: "Prepared synthetic descriptor: {{bytes}} bytes", descriptor: "Descriptor SHA-256: {{hash}}", sourceHash: "Source descriptor SHA-256: {{hash}}",
  upload: "Upload next simulated chunk", progress: "Confirmed upload progress: {{percent}}%", pause: "Pause upload", resume: "Resume upload",
  process: "Start processing", finish: "Finish processing", retry: "Retry", failPrepare: "Simulate preparation failure", failUpload: "Simulate upload failure", failProcess: "Simulate processing failure",
  preparationError: "Local preparation failed. Retry preserves trim and poster.", uploadError: "Local upload failed. Confirmed progress is preserved.", processingError: "Local processing failed. Retry processing without re-uploading.",
  cancel: "Cancel and discard staged output", remove: "Remove video", removeActive: "Remove current ready video", replace: "Choose a replacement",
  continue: "Continue with photos", returnVideo: "Return to video", review: "Photo publication review", pausedHelp: "Explicitly paused. Returning from photos will not resume upload.", reset: "Reset prototype",
};
type Copy = Record<keyof typeof en, string>;
const ru: Copy = {
  title: "Прототип загрузки видео объявления", dev: "Для разработки и проверки · локально",
  intro: "Синтетические кадры и данные описания. Без кодирования видео, загрузки и сервисов.",
  deniedTitle: "Прототип недоступен", denied: "Прототип отключён в производственных сборках.",
  empty: "Пустое место", selection: "Выбор из галереи", preview: "Просмотр", trim: "Обрезка", poster: "Обложка",
  preparing: "Подготовка", uploading: "Загрузка", paused: "Приостановлено", processing: "Обработка", failed: "Ошибка", ready: "Готово",
  state: "Состояние видео: {{state}}", photos: "Сохранено обязательных фото: {{count}}",
  fields: "Описание объявления: {{value}}", description: "Синтетическое объявление", publishable: "Обязательные фото готовы к публикации",
  pending: "Необязательное видео ожидается", failedOptional: "Ошибка необязательного видео", readyOptional: "Текущее видео готово", noVideo: "Без необязательного видео",
  active: "Текущее готовое видео", replacement: "Ожидаемая замена", add: "Добавить видео из галереи", another: "Выбрать другое видео",
  library: "Синтетическая галерея", eligible: "Доступно", ineligible: "Недоступно", permission: "Нет разрешения",
  scenario: "Синтетический доступ: {{state}}", setEligible: "Сценарий с доступом", setIneligible: "Сценарий без доступа", setPermission: "Отклонить синтетическое разрешение",
  ineligibleHelp: "Этому синтетическому аккаунту недоступен выбор видео. Фото и поля сохранены.",
  permissionHelp: "Доступ к галерее запрещён. Фото, поля и предыдущий выбор видео сохранены.",
  choose: "Выбрать ролик на {{seconds}} с", closeLibrary: "Вернуться к сохранённому выбору", restore: "Восстановить синтетический доступ",
  trimOptional: "Обрезка этого ролика необязательна.", trimRequired: "Выберите отрезок до 90 секунд. Выбраны первые 90 секунд.",
  trimAction: "Обрезать видео", posterAction: "Выбрать обложку", use: "Использовать и подготовить локально",
  duration: "Выбрано: от {{start}} с до {{end}} с · {{duration}} с / максимум 90 с", posterAt: "Обложка на {{seconds}} с",
  start: "Начало видео", end: "Конец видео", decrease: "{{handle}} минус 1 секунда", increase: "{{handle}} плюс 1 секунда",
  timeline: "Синтетическая шкала кадров", frame: "Синтетический кадр на {{seconds}} с", chooseFrame: "Обложка на {{seconds}} с",
  posterEarlier: "Обложка на 1 секунду раньше", posterLater: "Обложка на 1 секунду позже", editTrim: "Изменить обрезку",
  interval: "Выберите отрезок внутри исходного ролика.", tooLong: "Выбранный отрезок длиннее 90 секунд.", invalidPoster: "Выберите обложку внутри отрезка.",
  finishPrepare: "Завершить локальную подготовку", prepareHelp: "Описывается только выбранный отрезок. Исходник никогда не заменяет подготовленный файл.",
  prepared: "Подготовленное синтетическое описание: {{bytes}} байт", descriptor: "SHA-256 описания: {{hash}}", sourceHash: "SHA-256 описания исходника: {{hash}}",
  upload: "Следующая имитация части загрузки", progress: "Подтверждённый прогресс загрузки: {{percent}}%", pause: "Приостановить загрузку", resume: "Продолжить загрузку",
  process: "Начать обработку", finish: "Завершить обработку", retry: "Повторить", failPrepare: "Имитировать сбой подготовки", failUpload: "Имитировать сбой загрузки", failProcess: "Имитировать сбой обработки",
  preparationError: "Сбой локальной подготовки. Повтор сохраняет обрезку и обложку.", uploadError: "Сбой локальной загрузки. Подтверждённый прогресс сохранён.", processingError: "Сбой локальной обработки. Повтор без повторной загрузки.",
  cancel: "Отменить и удалить подготовленный результат", remove: "Удалить видео", removeActive: "Удалить текущее готовое видео", replace: "Выбрать замену",
  continue: "Продолжить с фото", returnVideo: "Вернуться к видео", review: "Проверка публикации фото", pausedHelp: "Загрузка приостановлена вручную. Возврат из фото не возобновляет её.", reset: "Сбросить прототип",
};
const tk: Copy = {
  title: "Bildirişiň wideosyny ýüklemek nusgasy", dev: "Işläp düzmek we barlamak üçin · ýerli",
  intro: "Emeli kadrlar we düşündiriş maglumatlary. Wideo kodlanmaýar, ýüklenmeýär we hyzmat çagyrylmaýar.",
  deniedTitle: "Nusga elýeterli däl", denied: "Bu nusga önümçilik wersiýalarynda öçürilen.",
  empty: "Boş orun", selection: "Galereýadan saýlamak", preview: "Öňünden görmek", trim: "Kesmek", poster: "Daşky surat",
  preparing: "Taýýarlanýar", uploading: "Ýüklenýär", paused: "Saklandy", processing: "Işlenýär", failed: "Ýalňyşlyk", ready: "Taýýar",
  state: "Wideonyň ýagdaýy: {{state}}", photos: "Hökmany suratlar saklandy: {{count}}",
  fields: "Bildirişiň düşündirişi: {{value}}", description: "Emeli bildiriş", publishable: "Hökmany suratlary çap etmek mümkin",
  pending: "Goşmaça wideo garaşylýar", failedOptional: "Goşmaça wideoda ýalňyşlyk", readyOptional: "Häzirki wideo taýýar", noVideo: "Goşmaça wideo ýok",
  active: "Häzirki taýýar wideo", replacement: "Çalyşjak wideo garaşylýar", add: "Galereýadan wideo goşmak", another: "Başga wideo saýlamak",
  library: "Emeli galereýa", eligible: "Elýeterli", ineligible: "Elýeterli däl", permission: "Rugsat berilmedi",
  scenario: "Emeli elýeterlilik: {{state}}", setEligible: "Elýeterli ssenariý", setIneligible: "Elýeterli däl ssenariý", setPermission: "Emeli rugsady ret etmek",
  ineligibleHelp: "Bu emeli hasap wideo saýlap bilmeýär. Suratlar we meýdanlar saklanýar.",
  permissionHelp: "Galereýa rugsat berilmedi. Suratlar, meýdanlar we öňki wideo saýlawy saklanýar.",
  choose: "{{seconds}} sekuntlyk wideony saýlamak", closeLibrary: "Saklanan saýlawa dolanmak", restore: "Emeli elýeterliligi dikeltmek",
  trimOptional: "Bu wideony kesmek hökmany däl.", trimRequired: "90 sekuntdan uzyn bolmadyk bölegi saýlaň. Ilkinji 90 sekunt saýlandy.",
  trimAction: "Wideony kesmek", posterAction: "Daşky surata geçmek", use: "Wideony ýerli taýýarlamak",
  duration: "Saýlandy: {{start}} s bilen {{end}} s aralygy · {{duration}} s / iň köp 90 s", posterAt: "Daşky surat {{seconds}} s-da",
  start: "Wideonyň başy", end: "Wideonyň soňy", decrease: "{{handle}} 1 sekunt yza", increase: "{{handle}} 1 sekunt öňe",
  timeline: "Emeli kadrlar zolagy", frame: "{{seconds}} s-daky emeli kadr", chooseFrame: "{{seconds}} s-daky daşky suraty saýlamak",
  posterEarlier: "Daşky surat 1 sekunt yza", posterLater: "Daşky surat 1 sekunt öňe", editTrim: "Kesmegi üýtgetmek",
  interval: "Başlangyç wideonyň içinden bölek saýlaň.", tooLong: "Saýlanan bölek 90 sekuntdan uzyn.", invalidPoster: "Saýlanan bölegiň içinden daşky surat saýlaň.",
  finishPrepare: "Ýerli taýýarlygy tamamlamak", prepareHelp: "Diňe saýlanan bölek beýan edilýär. Taýýarlamak şowsuz bolsa başlangyç wideo ýüklenmeýär.",
  prepared: "Taýýar emeli düşündiriş: {{bytes}} baýt", descriptor: "Düşündirişiň SHA-256: {{hash}}", sourceHash: "Başlangyç düşündirişiň SHA-256: {{hash}}",
  upload: "Indiki emeli bölegi ýüklemek", progress: "Tassyklanan ýükleme: {{percent}}%", pause: "Ýüklemäni saklamak", resume: "Ýüklemäni dowam etmek",
  process: "Işlemäge başlamak", finish: "Işlemegi tamamlamak", retry: "Gaýtadan synanyşmak", failPrepare: "Taýýarlyk ýalňyşlygyny döretmek", failUpload: "Ýükleme ýalňyşlygyny döretmek", failProcess: "Işleme ýalňyşlygyny döretmek",
  preparationError: "Ýerli taýýarlyk şowsuz. Kesilen bölek we daşky surat saklanýar.", uploadError: "Ýerli ýükleme şowsuz. Tassyklanan ösüş saklanýar.", processingError: "Ýerli işleme şowsuz. Täzeden ýüklemezden gaýtadan synanyşyň.",
  cancel: "Ýatyrmak we taýýarlanan netijäni aýyrmak", remove: "Wideony aýyrmak", removeActive: "Häzirki taýýar wideony aýyrmak", replace: "Çalyşjak wideony saýlamak",
  continue: "Suratlar bilen dowam etmek", returnVideo: "Wideo dolanmak", review: "Suratlaryň çap edilişini barlamak", pausedHelp: "Ýükleme el bilen saklandy. Suratlardan dolanmak ýüklemäni dowam etmeýär.", reset: "Nusgany täzeden başlamak",
};

const bundles = { en, ru, tk };

/** Register only this feature's namespace on the app's existing i18n instance. */
export function usePrototypeCopy() {
  const { i18n } = useTranslation();
  for (const [locale, copy] of Object.entries(bundles)) {
    if (!i18n.hasResourceBundle(locale, "videoPrototype")) i18n.addResourceBundle(locale, "videoPrototype", copy);
  }
  return i18n.getFixedT(i18n.resolvedLanguage ?? i18n.language, "videoPrototype");
}
