import { validateReturnTo } from "./validators";

/** Intent selects a flow, never authority. The API rechecks the stored grant. */
export function historyAuth(returnTo: unknown): { locale: "tk" | "ru" | "en"; returnTo: string } | null {
  const safe = typeof returnTo === "string" ? validateReturnTo(returnTo) : null;
  const locale = safe?.match(/^\/vehicle-history\/(tk|ru|en)(?:\?|$)/)?.[1];
  return (locale === "tk" || locale === "ru" || locale === "en") && safe ? { locale, returnTo: safe } : null;
}

export function totpPath(action: "status" | "enroll" | "verify", returnTo?: unknown) {
  return `/auth/admin/totp/${action}${historyAuth(returnTo) ? "?purpose=vehicle-history" : ""}`;
}

export const authCopy = {
  ru: {
    title: "Вход в историю автомобиля", adminTitle: "Вход в панель администратора", totp: "Двухфакторная аутентификация", backup: "Резервные коды",
    phoneBody: "Введите номер телефона для получения кода подтверждения.", otpBody: "Введите 6-значный код, отправленный на", enrollBody: "Отсканируйте QR-код в приложении-аутентификаторе и введите код.", verifyBody: "Введите код из приложения-аутентификатора или резервный код.", backupBody: "Сохраните эти коды — они больше не будут показаны.",
    phone: "Телефон", smsCode: "Код подтверждения", appCode: "Код из приложения", verifyCode: "Код из приложения-аутентификатора или резервный код", qr: "QR-код для настройки 2FA", appHint: "Используйте Google Authenticator, 1Password или аналогичное приложение.",
    send: "Отправить код", sending: "Отправка…", verify: "Подтвердить", checking: "Проверка…", change: "Изменить номер", copy: "Копировать", copied: "Скопировано", continue: "Продолжить", retryAction: "Повторить", retry: "Повторить настройку", signIn: "Войти снова", language: "Язык", dev: "Тестовый код",
    phoneError: "Введите номер телефона в формате +993XXXXXXXX", codeError: "Код должен содержать 6 цифр.", totpError: "Введите 6 цифр или 16 символов резервного кода.", invalid: "Неверный код. Попробуйте ещё раз.", limited: "Слишком много попыток. Подождите и попробуйте снова.", network: "Нет соединения. Проверьте сеть и повторите действие.", expired: "Сессия истекла. Войдите снова.", denied: "Нет действующего доступа к истории автомобиля. Войдите с разрешённой учётной записью или обратитесь к основателю.", enrolled: "Двухфакторная аутентификация уже настроена.", copyError: "Не удалось скопировать. Сохраните коды вручную.",
  },
  tk: {
    title: "Awtoulag taryhyna giriş", adminTitle: "Dolandyryjy paneline giriş", totp: "Iki ädimli tassyklama", backup: "Ätiýaçlyk kodlar",
    phoneBody: "Tassyklama koduny almak üçin telefon belgiňizi giriziň.", otpBody: "Şu belgä iberilen 6 sanly kody giriziň:", enrollBody: "Tassyklaýjy programmada QR-kody skanirläň we kody giriziň.", verifyBody: "Tassyklaýjy programmanyň koduny ýa-da ätiýaçlyk kody giriziň.", backupBody: "Bu kodlary saklaň — olar gaýtadan görkezilmez.",
    phone: "Telefon", smsCode: "Tassyklama kody", appCode: "Programmadaky kod", verifyCode: "Tassyklaýjy ýa-da ätiýaçlyk kod", qr: "Iki ädimli tassyklama üçin QR-kod", appHint: "Google Authenticator, 1Password ýa-da şoňa meňzeş programmany ulanyň.",
    send: "Kod iber", sending: "Iberilýär…", verify: "Tassykla", checking: "Barlanýar…", change: "Belgini üýtget", copy: "Göçür", copied: "Göçürildi", continue: "Dowam et", retryAction: "Gaýtala", retry: "Sazlamany gaýtala", signIn: "Gaýtadan gir", language: "Dil", dev: "Synag kody",
    phoneError: "Telefon belgiňizi +993XXXXXXXX görnüşinde giriziň.", codeError: "Kod 6 sandan ybarat bolmaly.", totpError: "6 san ýa-da 16 belgili ätiýaçlyk kody giriziň.", invalid: "Kod nädogry. Gaýtadan synanyşyň.", limited: "Synanyşyk köp boldy. Biraz garaşyň we gaýtadan synanyşyň.", network: "Baglanyşyk ýok. Toruňyzy barlaň we gaýtadan synanyşyň.", expired: "Sessiýanyň möhleti gutardy. Gaýtadan giriň.", denied: "Awtoulag taryhyna häzirki rugsat ýok. Rugsatly hasap bilen giriň ýa-da esaslandyryja ýüz tutuň.", enrolled: "Iki ädimli tassyklama eýýäm sazlanan.", copyError: "Göçürip bolmady. Kodlary el bilen saklaň.",
  },
  en: {
    title: "Sign in to Vehicle History", adminTitle: "Sign in to Admin", totp: "Two-step verification", backup: "Backup codes",
    phoneBody: "Enter your phone number to receive a sign-in code.", otpBody: "Enter the 6-digit code sent to", enrollBody: "Scan the QR code in your authenticator app, then enter its code.", verifyBody: "Enter an authenticator code or a backup code.", backupBody: "Save these codes — they will not be shown again.",
    phone: "Phone", smsCode: "Sign-in code", appCode: "Authenticator code", verifyCode: "Authenticator code or backup code", qr: "QR code for authenticator setup", appHint: "Use Google Authenticator, 1Password or a similar app.",
    send: "Send code", sending: "Sending…", verify: "Verify", checking: "Checking…", change: "Change number", copy: "Copy", copied: "Copied", continue: "Continue", retryAction: "Try again", retry: "Retry setup", signIn: "Sign in again", language: "Language", dev: "Test code",
    phoneError: "Enter a phone number in the format +993XXXXXXXX.", codeError: "Enter a 6-digit code.", totpError: "Enter 6 digits or a 16-character backup code.", invalid: "Incorrect code. Try again.", limited: "Too many attempts. Wait and try again.", network: "Connection unavailable. Check your network and try again.", expired: "Your session expired. Sign in again.", denied: "Current Vehicle History access is missing. Sign in with an authorized account or contact the founder.", enrolled: "Two-step verification is already set up.", copyError: "Could not copy. Save the codes manually.",
  },
};
