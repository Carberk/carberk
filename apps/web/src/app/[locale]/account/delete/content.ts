import type { Locale } from "@/i18n/locales";





export interface AccountDeletionCopy {
  metaDescription: string;
  title: string;
  intro: string;
  consequencesTitle: string;
  consequences: string[];
  channelLegend: string;
  phone: string;
  email: string;
  phoneLabel: string;
  phonePlaceholder: string;
  phoneHelper: string;
  emailLabel: string;
  emailPlaceholder: string;
  emailHelper: string;
  sendCode: string;
  sending: string;
  codeTitle: string;
  codeSent: (destination: string) => string;
  codeLabel: string;
  confirm: string;
  confirming: string;
  resendIn: (seconds: number) => string;
  resend: string;
  changeValue: string;
  doneTitle: string;
  doneBody: (destination: string) => string;
  doneRecover: string;
  privacyPrefix: string;
  privacyLink: string;
  backHome: string;
  errors: {
    phoneInvalid: string;
    emailInvalid: string;
    codeFormat: string;
    invalidCode: string;
    rateLimited: string;
    unavailable: string;
  };
}

export const accountDeletionCopy: Record<Locale, AccountDeletionCopy> = {
  en: {
    metaDescription: "Request deletion of your Carberk account with your phone number or email address",
    title: "Delete your Carberk account",
    intro:
      "Enter the phone number or email address you use to sign in to Carberk. We will send a code to it to confirm the request.",
    consequencesTitle: "What happens next",
    consequences: [
      "All your sessions end and your active listings are archived.",
      "For 30 days you can cancel by signing in again with your phone number or email address.",
      "After 30 days your personal data is removed. Listings and messages stay with “Deleted user” attribution.",
    ],
    channelLegend: "Sign-in method",
    phone: "Phone",
    email: "Email",
    phoneLabel: "Phone number",
    phonePlaceholder: "6X XX-XX-XX",
    phoneHelper: "A Turkmenistan mobile number. The code comes by SMS.",
    emailLabel: "Email",
    emailPlaceholder: "name@example.com",
    emailHelper: "The code comes by email.",
    sendCode: "Get code",
    sending: "Sending…",
    codeTitle: "Enter the code",
    codeSent: (destination) => `We sent a 6-digit code to ${destination}.`,
    codeLabel: "Code",
    confirm: "Delete account",
    confirming: "Deleting…",
    resendIn: (seconds) => `Resend code in ${seconds}s`,
    resend: "Resend code",
    changeValue: "Use a different phone number or email",
    doneTitle: "Deletion request received",
    doneBody: (destination) =>
      `If a Carberk account uses ${destination}, it is now scheduled for deletion and will be deleted in 30 days.`,
    doneRecover:
      "To keep the account, sign in to the Carberk app with this phone number or email address within 30 days.",
    privacyPrefix: "How we handle your data: ",
    privacyLink: "Privacy Policy",
    backHome: "Back to home",
    errors: {
      phoneInvalid: "Enter the number as +993 6X XX-XX-XX.",
      emailInvalid: "Enter a valid email address.",
      codeFormat: "Enter the 6-digit code.",
      invalidCode: "The code is wrong, expired, or already used. Request a new code.",
      rateLimited: "Too many code requests. Please wait and try again later.",
      unavailable: "Something went wrong. Please try again later.",
    },
  },
  ru: {
    metaDescription: "Запрос на удаление аккаунта Carberk по номеру телефона или адресу почты",
    title: "Удаление аккаунта Carberk",
    intro:
      "Укажите номер телефона или адрес почты, по которому вы входите в Carberk. Мы отправим на него код, чтобы подтвердить запрос.",
    consequencesTitle: "Что произойдёт",
    consequences: [
      "Все сессии завершатся, активные объявления будут архивированы.",
      "В течение 30 дней удаление можно отменить, войдя снова по номеру телефона или адресу почты.",
      "Через 30 дней персональные данные удаляются. Объявления и сообщения сохраняются с пометкой «Удалённый пользователь».",
    ],
    channelLegend: "Способ входа",
    phone: "Телефон",
    email: "Эл. почта",
    phoneLabel: "Номер телефона",
    phonePlaceholder: "6X XX-XX-XX",
    phoneHelper: "Мобильный номер Туркменистана. Код придёт по SMS.",
    emailLabel: "Электронная почта",
    emailPlaceholder: "name@example.com",
    emailHelper: "Код придёт на электронную почту.",
    sendCode: "Получить код",
    sending: "Отправляем…",
    codeTitle: "Введите код",
    codeSent: (destination) => `Код из 6 цифр отправлен на ${destination}.`,
    codeLabel: "Код",
    confirm: "Удалить аккаунт",
    confirming: "Удаляем…",
    resendIn: (seconds) => `Отправить код снова через ${seconds} с`,
    resend: "Отправить код снова",
    changeValue: "Указать другой номер или почту",
    doneTitle: "Запрос на удаление принят",
    doneBody: (destination) =>
      `Если аккаунт Carberk использует ${destination}, он запланирован к удалению и будет удалён через 30 дней.`,
    doneRecover:
      "Чтобы сохранить аккаунт, войдите в приложение Carberk по этому номеру телефона или адресу почты в течение 30 дней.",
    privacyPrefix: "Как мы обращаемся с данными: ",
    privacyLink: "Политика конфиденциальности",
    backHome: "Вернуться на главную",
    errors: {
      phoneInvalid: "Введите номер в формате +993 6X XX-XX-XX.",
      emailInvalid: "Введите корректный адрес электронной почты.",
      codeFormat: "Введите код из 6 цифр.",
      invalidCode: "Код неверный, истёк или уже использован. Запросите новый код.",
      rateLimited: "Слишком много запросов кода. Подождите и попробуйте позже.",
      unavailable: "Что-то пошло не так. Попробуйте позже.",
    },
  },
  tk: {
    metaDescription: "Carberk akkauntyny telefon belgisi ýa-da e-poçta salgysy bilen pozmagy soramak",
    title: "Carberk akkauntyny pozmak",
    intro:
      "Carberk-e girýän telefon belgiňizi ýa-da e-poçta salgyňyzy giriziň. Haýyşy tassyklamak üçin oňa kod ibereris.",
    consequencesTitle: "Soňra näme bolar",
    consequences: [
      "Ähli sessiýalar gutarýar, işjeň bildirişler arhiwlenýär.",
      "30 günüň dowamynda telefon belgiňiz ýa-da e-poçta salgyňyz bilen gaýtadan girip, pozmagy ýatyryp bilersiňiz.",
      "30 günden soň şahsy maglumatlar aýrylýar. Bildirişler we habarlar «Pozulan ulanyjy» diýip saklanýar.",
    ],
    channelLegend: "Giriş usuly",
    phone: "Telefon",
    email: "E-poçta",
    phoneLabel: "Telefon belgisi",
    phonePlaceholder: "6X XX-XX-XX",
    phoneHelper: "Türkmenistanyň mobil belgisi. Kod SMS bilen geler.",
    emailLabel: "E-poçta",
    emailPlaceholder: "name@example.com",
    emailHelper: "Kod e-poçta geler.",
    sendCode: "Kody almak",
    sending: "Iberilýär…",
    codeTitle: "Kody giriziň",
    codeSent: (destination) => `6 sanly kod iberildi: ${destination}.`,
    codeLabel: "Kod",
    confirm: "Akkaunty poz",
    confirming: "Pozulýar…",
    resendIn: (seconds) => `Kody ${seconds} s soň täzeden iber`,
    resend: "Kody täzeden iber",
    changeValue: "Başga belgi ýa-da e-poçta görkez",
    doneTitle: "Pozmak haýyşy kabul edildi",
    doneBody: (destination) =>
      `Eger ${destination} bir Carberk akkauntynda ulanylýan bolsa, ol akkaunt pozmak üçin meýilnamalaşdyryldy we 30 günden soň pozular.`,
    doneRecover:
      "Akkaunty saklamak üçin 30 günüň dowamynda Carberk programmasyna şu telefon belgisi ýa-da e-poçta salgysy bilen giriň.",
    privacyPrefix: "Maglumatlaryňyzy nähili işleýäris: ",
    privacyLink: "Gizlinlik syýasaty",
    backHome: "Baş sahypa gaýdym",
    errors: {
      phoneInvalid: "Belgini +993 6X XX-XX-XX görnüşinde giriziň.",
      emailInvalid: "Dogry e-poçta salgysyny giriziň.",
      codeFormat: "6 sanly kody giriziň.",
      invalidCode: "Kod nädogry, wagty geçen ýa-da eýýäm ulanylan. Täze kod soraň.",
      rateLimited: "Kod soragy köp. Biraz garaşyp, soňrak synanyşyň.",
      unavailable: "Bir zat ýalňyş boldy. Soňrak synanyşyň.",
    },
  },
};
