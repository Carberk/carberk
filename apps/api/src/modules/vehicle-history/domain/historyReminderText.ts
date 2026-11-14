/** Generated public notice. The first committed locale/text is immutable. */
export function historyReminderText(language: string | undefined): string {
  const locale = language?.split(/[-,;]/)[0]?.trim();
  if (locale === "tk") return "Awtoulagyň taryhy barada jogabyňyza garaşýarys. Şu ýerde jogap berip ýa-da ýatlatmalary bes edip bilersiňiz.";
  if (locale === "ru") return "Мы ждём вашего ответа об истории автомобиля. Вы можете ответить здесь или отключить напоминания.";
  return "We are waiting for your reply about vehicle history. You can reply here or stop reminders.";
}
