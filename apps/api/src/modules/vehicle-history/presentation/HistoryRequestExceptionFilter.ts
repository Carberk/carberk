import { type ArgumentsHost, Catch, HttpException, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { HistoryRequestError } from "../domain/HistoryRequestError";

const messages = {
  en: {
    HISTORY_OFFER_INVALID: "Check the VIN, format and delivery window. Use today or tomorrow, 09:00–20:00 Ashgabat time.",
    HISTORY_OFFER_CONFLICT: "The offer changed. Refresh it before trying again.",
    HISTORY_OFFER_UNAVAILABLE: "Offers are temporarily unavailable. Reopen the enquiry and retry.",
    HISTORY_NOTE_INVALID: "Check the private note and page details. Text must contain 1–4,000 characters.",
    HISTORY_NOTE_CURSOR: "This private-note page is unavailable. Reopen the enquiry.",
    HISTORY_NOTE_CONFLICT: "This note attempt already saved different text. Reopen the enquiry before trying again.",
    HISTORY_NOTE_UNAVAILABLE: "Private notes are temporarily unavailable. Retry the same note attempt.",
    HISTORY_REMINDER_INVALID: "Check the reminder details and try again.",
    HISTORY_REMINDER_CONFLICT: "Reminder state changed. Refresh the enquiry before trying again.",
    HISTORY_REMINDER_UNAVAILABLE: "Reminders are temporarily unavailable. Reopen the enquiry and retry.",
    HISTORY_MESSAGE_INVALID: "Check the message and page details. Text must contain 1–4,000 characters.",
    HISTORY_MESSAGE_CURSOR: "This message page is unavailable. Reopen the enquiry.",
    HISTORY_MESSAGE_CONFLICT: "This send attempt already saved different text. Reopen the enquiry before sending again.",
    HISTORY_MESSAGE_UNAVAILABLE: "Messages are temporarily unavailable. Retry with the same send attempt.",
    HISTORY_OPERATOR_DENIED: "This enquiry is unavailable. Sign in again or refresh your History inbox.",
    HISTORY_ASSIGNMENT_CONFLICT: "Assignment changed. Refresh the History inbox before trying again.",
    HISTORY_REQUEST_DENIED: "This request is unavailable. Sign in again or return to your History requests.",
    HISTORY_REQUEST_CONFLICT: "This attempt belongs to another request context. Reopen the original or choose New request.",
    HISTORY_REQUEST_INVALID: "Check the request details and try again.",
  },
  ru: {
    HISTORY_OFFER_INVALID: "Проверьте VIN, формат и срок. Выберите сегодня или завтра, 09:00–20:00 по Ашхабаду.",
    HISTORY_OFFER_CONFLICT: "Предложение изменилось. Обновите его перед повторной попыткой.",
    HISTORY_OFFER_UNAVAILABLE: "Предложения временно недоступны. Откройте обращение заново и повторите попытку.",
    HISTORY_NOTE_INVALID: "Проверьте заметку и параметры страницы. Текст должен содержать от 1 до 4 000 символов.",
    HISTORY_NOTE_CURSOR: "Эта страница личных заметок недоступна. Откройте обращение заново.",
    HISTORY_NOTE_CONFLICT: "Эта попытка уже сохранила другой текст заметки. Откройте обращение перед повтором.",
    HISTORY_NOTE_UNAVAILABLE: "Личные заметки временно недоступны. Повторите ту же попытку сохранения.",
    HISTORY_REMINDER_INVALID: "Проверьте параметры напоминания и повторите попытку.",
    HISTORY_REMINDER_CONFLICT: "Состояние напоминания изменилось. Обновите обращение и повторите попытку.",
    HISTORY_REMINDER_UNAVAILABLE: "Напоминания временно недоступны. Откройте обращение заново и повторите попытку.",
    HISTORY_MESSAGE_INVALID: "Проверьте сообщение и параметры страницы. Текст должен содержать от 1 до 4 000 символов.",
    HISTORY_MESSAGE_CURSOR: "Эта страница сообщений недоступна. Откройте обращение заново.",
    HISTORY_MESSAGE_CONFLICT: "Эта попытка уже сохранила другой текст. Откройте обращение перед повторной отправкой.",
    HISTORY_MESSAGE_UNAVAILABLE: "Сообщения временно недоступны. Повторите ту же попытку отправки.",
    HISTORY_OPERATOR_DENIED: "Обращение недоступно. Войдите снова или обновите входящие истории автомобиля.",
    HISTORY_ASSIGNMENT_CONFLICT: "Назначение изменилось. Обновите входящие истории автомобиля и повторите попытку.",
    HISTORY_REQUEST_DENIED: "Запрос недоступен. Войдите снова или вернитесь к своим запросам истории.",
    HISTORY_REQUEST_CONFLICT: "Эта попытка относится к другому запросу. Откройте исходный или выберите «Новый запрос».",
    HISTORY_REQUEST_INVALID: "Проверьте данные запроса и повторите попытку.",
  },
  tk: {
    HISTORY_OFFER_INVALID: "VIN-i, görnüşi we möhleti barlaň. Şu güni ýa-da ertiri, Aşgabat wagty bilen 09:00–20:00 aralygyny saýlaň.",
    HISTORY_OFFER_CONFLICT: "Teklip üýtgedi. Gaýtadan synanyşmazdan öň ony täzeläň.",
    HISTORY_OFFER_UNAVAILABLE: "Teklipler wagtlaýyn elýeterli däl. Ýüz tutmany täzeden açyp synanyşyň.",
    HISTORY_NOTE_INVALID: "Şahsy belligi we sahypanyň maglumatlaryny barlaň. Tekst 1–4 000 nyşandan ybarat bolmaly.",
    HISTORY_NOTE_CURSOR: "Şahsy bellikleriň bu sahypasy elýeterli däl. Ýüz tutmany täzeden açyň.",
    HISTORY_NOTE_CONFLICT: "Bu bellik synanyşygy başga teksti eýýäm saklady. Gaýtadan synanyşmazdan öň ýüz tutmany açyň.",
    HISTORY_NOTE_UNAVAILABLE: "Şahsy bellikler wagtlaýyn elýeterli däl. Şol synanyşyk bilen gaýtadan synanyşyň.",
    HISTORY_REMINDER_INVALID: "Ýatlatmanyň maglumatlaryny barlap, gaýtadan synanyşyň.",
    HISTORY_REMINDER_CONFLICT: "Ýatlatmanyň ýagdaýy üýtgedi. Täzeden synanyşmazdan öň ýüz tutmany täzeläň.",
    HISTORY_REMINDER_UNAVAILABLE: "Ýatlatmalar wagtlaýyn elýeterli däl. Ýüz tutmany täzeden açyp synanyşyň.",
    HISTORY_MESSAGE_INVALID: "Habary we sahypanyň maglumatlaryny barlaň. Tekst 1–4 000 nyşandan ybarat bolmaly.",
    HISTORY_MESSAGE_CURSOR: "Bu habar sahypasy elýeterli däl. Ýüz tutmany täzeden açyň.",
    HISTORY_MESSAGE_CONFLICT: "Bu iberiş synanyşygy başga teksti eýýäm saklady. Täzeden ibermezden öň ýüz tutmany açyň.",
    HISTORY_MESSAGE_UNAVAILABLE: "Habarlar wagtlaýyn elýeterli däl. Şol iberiş synanyşygy bilen gaýtadan synanyşyň.",
    HISTORY_OPERATOR_DENIED: "Bu ýüz tutma elýeterli däl. Gaýtadan giriň ýa-da taryh ýüz tutmalarynyň sanawyny täzeläň.",
    HISTORY_ASSIGNMENT_CONFLICT: "Jogapkär işgär üýtgedi. Täzeden synanyşmazdan öň taryh ýüz tutmalarynyň sanawyny täzeläň.",
    HISTORY_REQUEST_DENIED: "Bu ýüz tutma elýeterli däl. Gaýtadan giriň ýa-da taryh ýüz tutmalaryňyza dolanyň.",
    HISTORY_REQUEST_CONFLICT: "Bu synanyşyk başga ýüz tutma degişlidir. Öňküsini açyň ýa-da Täze ýüz tutmany saýlaň.",
    HISTORY_REQUEST_INVALID: "Ýüz tutmanyň maglumatlaryny barlap, gaýtadan synanyşyň.",
  },
};

@Catch(HistoryRequestError, HttpException)
export class HistoryRequestExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    const response = historyRequestFailure(error, request.headers["accept-language"]);
    host.switchToHttp().getResponse<FastifyReply>().header("Cache-Control", "private, no-store").status(response.statusCode).send(response);
  }
}

@Catch()
export class HistoryMessagesExceptionFilter extends HistoryRequestExceptionFilter {}

@Catch()
export class HistoryNotesExceptionFilter extends HistoryRequestExceptionFilter {
  override catch(error: unknown, host: ArgumentsHost) {
    const code = error instanceof HistoryRequestError ? error.code : null;
    super.catch(code === "HISTORY_MESSAGE_INVALID" ? new HistoryRequestError("HISTORY_NOTE_INVALID")
      : code === "HISTORY_MESSAGE_CURSOR" ? new HistoryRequestError("HISTORY_NOTE_CURSOR")
        : code === "HISTORY_MESSAGE_CONFLICT" ? new HistoryRequestError("HISTORY_NOTE_CONFLICT")
          : code === "HISTORY_MESSAGE_UNAVAILABLE" || (!code && !(error instanceof HttpException))
            ? new HistoryRequestError("HISTORY_NOTE_UNAVAILABLE") : error, host);
  }
}

@Catch()
export class HistoryRemindersExceptionFilter extends HistoryRequestExceptionFilter {
  override catch(error: unknown, host: ArgumentsHost) {
    const code = error instanceof HistoryRequestError ? error.code : null;
    super.catch(code === "HISTORY_MESSAGE_INVALID" ? new HistoryRequestError("HISTORY_REMINDER_INVALID")
      : code === "HISTORY_MESSAGE_CONFLICT" ? new HistoryRequestError("HISTORY_REMINDER_CONFLICT")
        : code === "HISTORY_MESSAGE_UNAVAILABLE" || (!code && !(error instanceof HttpException))
          ? new HistoryRequestError("HISTORY_REMINDER_UNAVAILABLE") : error, host);
  }
}

@Catch()
export class HistoryOffersExceptionFilter extends HistoryRequestExceptionFilter {
  override catch(error: unknown, host: ArgumentsHost) {
    const unavailable = error instanceof HistoryRequestError && error.code === "HISTORY_MESSAGE_UNAVAILABLE";
    super.catch(!unavailable && (error instanceof HistoryRequestError || error instanceof HttpException)
      ? error : new HistoryRequestError("HISTORY_OFFER_UNAVAILABLE"), host);
  }
}

export function historyRequestFailure(error: unknown, language: string | undefined) {
  const locale = language?.split(/[-,;]/)[0]?.trim();
  const code = error instanceof HistoryRequestError ? error.code : error instanceof HttpException
    ? "HISTORY_REQUEST_DENIED" : "HISTORY_MESSAGE_UNAVAILABLE";
  const status = error instanceof HttpException ? error.getStatus() : code === "HISTORY_OFFER_UNAVAILABLE" || code === "HISTORY_MESSAGE_UNAVAILABLE" || code === "HISTORY_REMINDER_UNAVAILABLE" || code === "HISTORY_NOTE_UNAVAILABLE" ? 503
    : code === "HISTORY_OFFER_CONFLICT" || code === "HISTORY_REQUEST_CONFLICT" || code === "HISTORY_ASSIGNMENT_CONFLICT" || code === "HISTORY_MESSAGE_CONFLICT" || code === "HISTORY_REMINDER_CONFLICT" || code === "HISTORY_NOTE_CONFLICT" ? 409
      : code === "HISTORY_OFFER_INVALID" || code === "HISTORY_REQUEST_INVALID" || code === "HISTORY_MESSAGE_INVALID" || code === "HISTORY_MESSAGE_CURSOR" || code === "HISTORY_REMINDER_INVALID"
        || code === "HISTORY_NOTE_INVALID" || code === "HISTORY_NOTE_CURSOR" ? 400 : 403;
  return { statusCode: status, code, message: messages[locale === "tk" || locale === "ru" ? locale : "en"][code] };
}
