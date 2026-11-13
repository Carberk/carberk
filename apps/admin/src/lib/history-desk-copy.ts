export const deskCopy = {
  tk: {
    title: "Awtoulag taryhy", desk: "Taryh iş ýeri", requests: "Ýüz tutmalar", actor: "Häzirki işgär",
    synthetic: "Diňe synag üçin", empty: "Entek ýüz tutma ýok",
    emptyBody: "Bu iş ýeri diňe emeli synag maglumatlary üçin. Hakyky müşderi ýüz tutmalary we tölegler entek elýeterli däl.",
    loading: "Rugsat barlanýar…", loadingBody: "Iş ýeri açylýar. Biraz garaşyň.",
    denied: "Bu iş ýerine rugsat ýok", deniedBody: "Awtoulag taryhy üçin häzirki işgär rugsady we tassyklanan sessiýa gerek. Gaýtadan giriň ýa-da esaslandyryja ýüz tutuň.",
    error: "Iş ýeri açylmady", errorBody: "Baglanyşygy barlaň we gaýtadan synanyşyň.",
    refresh: "Täzele", retry: "Gaýtadan synanyş", signIn: "Gaýtadan gir", language: "Dil", skip: "Mazmuna geç",
  },
  ru: {
    title: "История автомобиля", desk: "Рабочее место", requests: "Обращения", actor: "Текущий сотрудник",
    synthetic: "Только для тестирования", empty: "Обращений пока нет",
    emptyBody: "Рабочее место предназначено для синтетических данных. Реальные обращения клиентов и платежи пока недоступны.",
    loading: "Проверяем доступ…", loadingBody: "Открываем рабочее место. Подождите немного.",
    denied: "Нет доступа к рабочему месту", deniedBody: "Нужны действующий доступ к истории автомобиля и подтверждённая сессия. Войдите снова или обратитесь к основателю.",
    error: "Не удалось открыть рабочее место", errorBody: "Проверьте соединение и попробуйте ещё раз.",
    refresh: "Обновить", retry: "Попробовать ещё раз", signIn: "Войти снова", language: "Язык", skip: "Перейти к содержимому",
  },
  en: {
    title: "Vehicle History", desk: "History desk", requests: "Requests", actor: "Current operator",
    synthetic: "Synthetic only", empty: "No requests yet",
    emptyBody: "This workspace is for synthetic data. Real customer requests and payments are not available yet.",
    loading: "Checking access…", loadingBody: "Opening the desk. Please wait.",
    denied: "Desk access denied", deniedBody: "Current Vehicle History staff access and a verified session are required. Sign in again or contact the founder.",
    error: "Could not open the desk", errorBody: "Check your connection and try again.",
    refresh: "Refresh", retry: "Try again", signIn: "Sign in again", language: "Language", skip: "Skip to content",
  },
} as const;

export type DeskLocale = keyof typeof deskCopy;
