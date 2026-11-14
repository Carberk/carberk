import { type ArgumentsHost, Catch, HttpException, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { HistoryRequestError } from "../domain/HistoryRequestError";

const messages = {
  en: {
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

export function historyRequestFailure(error: unknown, language: string | undefined) {
  const locale = language?.split(/[-,;]/)[0]?.trim();
  const code = error instanceof HistoryRequestError ? error.code : error instanceof HttpException
    ? "HISTORY_REQUEST_DENIED" : "HISTORY_MESSAGE_UNAVAILABLE";
  const status = error instanceof HttpException ? error.getStatus() : code === "HISTORY_MESSAGE_UNAVAILABLE" ? 503
    : code === "HISTORY_REQUEST_CONFLICT" || code === "HISTORY_ASSIGNMENT_CONFLICT" || code === "HISTORY_MESSAGE_CONFLICT" ? 409
      : code === "HISTORY_REQUEST_INVALID" || code === "HISTORY_MESSAGE_INVALID" || code === "HISTORY_MESSAGE_CURSOR" ? 400 : 403;
  return { statusCode: status, code, message: messages[locale === "tk" || locale === "ru" ? locale : "en"][code] };
}
