import { type ArgumentsHost, Catch, HttpException, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { HistoryRequestError } from "../domain/HistoryRequestError";

const messages = {
  en: {
    HISTORY_OPERATOR_DENIED: "This enquiry is unavailable. Sign in again or refresh your History inbox.",
    HISTORY_ASSIGNMENT_CONFLICT: "Assignment changed. Refresh the History inbox before trying again.",
    HISTORY_REQUEST_DENIED: "This request is unavailable. Sign in again or return to your History requests.",
    HISTORY_REQUEST_CONFLICT: "This attempt belongs to another request context. Reopen the original or choose New request.",
    HISTORY_REQUEST_INVALID: "Check the request details and try again.",
  },
  ru: {
    HISTORY_OPERATOR_DENIED: "Обращение недоступно. Войдите снова или обновите входящие истории автомобиля.",
    HISTORY_ASSIGNMENT_CONFLICT: "Назначение изменилось. Обновите входящие истории автомобиля и повторите попытку.",
    HISTORY_REQUEST_DENIED: "Запрос недоступен. Войдите снова или вернитесь к своим запросам истории.",
    HISTORY_REQUEST_CONFLICT: "Эта попытка относится к другому запросу. Откройте исходный или выберите «Новый запрос».",
    HISTORY_REQUEST_INVALID: "Проверьте данные запроса и повторите попытку.",
  },
  tk: {
    HISTORY_OPERATOR_DENIED: "Bu ýüz tutma elýeterli däl. Gaýtadan giriň ýa-da taryh ýüz tutmalarynyň sanawyny täzeläň.",
    HISTORY_ASSIGNMENT_CONFLICT: "Jogapkär işgär üýtgedi. Täzeden synanyşmazdan öň taryh ýüz tutmalarynyň sanawyny täzeläň.",
    HISTORY_REQUEST_DENIED: "Bu ýüz tutma elýeterli däl. Gaýtadan giriň ýa-da taryh ýüz tutmalaryňyza dolanyň.",
    HISTORY_REQUEST_CONFLICT: "Bu synanyşyk başga ýüz tutma degişlidir. Öňküsini açyň ýa-da Täze ýüz tutmany saýlaň.",
    HISTORY_REQUEST_INVALID: "Ýüz tutmanyň maglumatlaryny barlap, gaýtadan synanyşyň.",
  },
};

@Catch(HistoryRequestError, HttpException)
export class HistoryRequestExceptionFilter implements ExceptionFilter {
  catch(error: HistoryRequestError | HttpException, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    const locale = request.headers["accept-language"]?.split(/[-,;]/)[0]?.trim();
    const code = error instanceof HistoryRequestError ? error.code : "HISTORY_REQUEST_DENIED";
    const status = error instanceof HttpException ? error.getStatus()
      : code === "HISTORY_REQUEST_CONFLICT" || code === "HISTORY_ASSIGNMENT_CONFLICT" ? 409 : code === "HISTORY_REQUEST_INVALID" ? 400 : 403;
    host.switchToHttp().getResponse<FastifyReply>().header("Cache-Control", "private, no-store").status(status).send({
      statusCode: status, code, message: messages[locale === "tk" || locale === "ru" ? locale : "en"][code],
    });
  }
}
