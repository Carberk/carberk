import { type ArgumentsHost, Catch, HttpException, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { HistoryRequestError } from "../domain/HistoryRequestError";

const messages = {
  en: {
    HISTORY_FULFILMENT_INVALID: "Check the accepted VIN, provider, format and fulfilment action.",
    HISTORY_FULFILMENT_CONFLICT: "Fulfilment changed or this action is unavailable. Refresh and check the recorded intent.",
    HISTORY_FULFILMENT_FIFO: "Work on the earlier confirmed order first.",
    HISTORY_CORRECTION_INVALID: "Check the corrected VIN and reviewed quote, then try again.",
    HISTORY_CORRECTION_CONFLICT: "The correction changed. Refresh before choosing again.",
    HISTORY_CORRECTION_CLOSED: "Fulfilment has started. Another car needs a new request; contact the operator about a company error.",

    HISTORY_PAYMENT_INVALID: "Check the amount, reference, evidence and received time, then confirm the independent wallet check.",
    HISTORY_PAYMENT_CONFLICT: "Payment review changed. Refresh before recording another check; do not request another payment.",
    HISTORY_PAYMENT_CLOSED: "Wallet verification resumes at 09:00 Ashgabat time. Keep the receipt for review.",
    HISTORY_PAYMENT_UNAVAILABLE: "Could not save the wallet check. Refresh to reconcile before trying again.",
    HISTORY_PROOF_INVALID: "Use one JPEG, PNG or WebP image up to 8 MB. Try a smaller screenshot.",
    HISTORY_PROOF_DENIED: "This receipt is unavailable. Sign in again or refresh the request.",
    HISTORY_PROOF_EXPIRED: "Receipt upload expired. Select the receipt again and retry; do not pay again.",
    HISTORY_PROOF_CONFLICT: "Receipt state changed. Refresh and retry the selected receipt. Do not pay again.",
    HISTORY_PROOF_UNAVAILABLE: "Could not send or open the receipt. Retry the same receipt. Do not pay again.",

    HISTORY_ORDER_INVALID: "Check the complete quote before confirming.",
    HISTORY_ORDER_STALE: "The quote changed or its window is no longer feasible. Refresh and ask the operator for a new quote.",
    HISTORY_ORDER_CAPACITY: "This day or window is full. Ask the operator for another quote; do not transfer money.",
    HISTORY_ORDER_CONFLICT: "This request already has an accepted order. Reopen its order status.",
    HISTORY_ORDER_UNAVAILABLE: "Order instructions are unavailable. Refresh the enquiry or contact the operator; do not transfer money.",

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
    HISTORY_FULFILMENT_INVALID: "Проверьте согласованные VIN, поставщика, формат и выбранное действие.",
    HISTORY_FULFILMENT_CONFLICT: "Состояние заказа изменилось или действие недоступно. Обновите данные и проверьте записанное намерение.",
    HISTORY_FULFILMENT_FIFO: "Сначала обработайте заказ, оплаченный раньше.",
    HISTORY_CORRECTION_INVALID: "Проверьте исправленный VIN и предложение оператора и повторите попытку.",
    HISTORY_CORRECTION_CONFLICT: "Исправление изменилось. Обновите данные перед подтверждением.",
    HISTORY_CORRECTION_CLOSED: "Выполнение началось. Для другой машины создайте новое обращение; об ошибке компании напишите оператору.",

    HISTORY_PAYMENT_INVALID: "Проверьте сумму, номер перевода, основание и время получения, затем подтвердите независимую проверку кошелька.",
    HISTORY_PAYMENT_CONFLICT: "Проверка оплаты изменилась. Обновите данные перед новой проверкой; не запрашивайте повторную оплату.",
    HISTORY_PAYMENT_CLOSED: "Проверка кошелька возобновится в 09:00 по Ашхабаду. Сохраните квитанцию для проверки.",
    HISTORY_PAYMENT_UNAVAILABLE: "Не удалось сохранить проверку. Обновите данные перед повторной попыткой.",
    HISTORY_PROOF_INVALID: "Выберите одно изображение JPEG, PNG или WebP до 8 МБ. Попробуйте меньший скриншот.",
    HISTORY_PROOF_DENIED: "Квитанция недоступна. Войдите снова или обновите обращение.",
    HISTORY_PROOF_EXPIRED: "Срок загрузки истёк. Выберите квитанцию ещё раз; не платите повторно.",
    HISTORY_PROOF_CONFLICT: "Состояние квитанции изменилось. Обновите и повторите отправку выбранного файла. Не платите повторно.",
    HISTORY_PROOF_UNAVAILABLE: "Не удалось отправить или открыть квитанцию. Повторите попытку с тем же файлом. Не платите повторно.",

    HISTORY_ORDER_INVALID: "Проверьте полное предложение перед подтверждением.",
    HISTORY_ORDER_STALE: "Предложение изменилось или срок уже недоступен. Обновите его и запросите новое у оператора.",
    HISTORY_ORDER_CAPACITY: "На этот день или срок мест нет. Запросите другое предложение; не переводите деньги.",
    HISTORY_ORDER_CONFLICT: "В этом обращении уже есть принятый заказ. Откройте его статус.",
    HISTORY_ORDER_UNAVAILABLE: "Инструкции заказа недоступны. Обновите обращение или напишите оператору; не переводите деньги.",

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
    HISTORY_FULFILMENT_INVALID: "Kabul edilen VIN-i, üpjün edijini, görnüşi we saýlanan amaly barlaň.",
    HISTORY_FULFILMENT_CONFLICT: "Sargydyň ýagdaýy üýtgedi ýa-da amal elýeterli däl. Täzeläp, ýazylan amaly barlaň.",
    HISTORY_FULFILMENT_FIFO: "Ilki tölegi has ir tassyklanan sargydy işläň.",
    HISTORY_CORRECTION_INVALID: "Düzedilen VIN-i we işgäriň teklibini barlap, gaýtadan synanyşyň.",
    HISTORY_CORRECTION_CONFLICT: "Düzediş üýtgedi. Saýlamazdan öň täzeläň.",
    HISTORY_CORRECTION_CLOSED: "Ýerine ýetiriş başlandy. Başga ulag üçin täze ýüz tutma açyň; kompaniýanyň ýalňyşlygy barada işgäre ýazyň.",

    HISTORY_PAYMENT_INVALID: "Mukdary, geçirim belgisini, delili we alnan wagty barlap, gapjykdaky garaşsyz barlagy tassyklaň.",
    HISTORY_PAYMENT_CONFLICT: "Töleg barlagy üýtgedi. Täze barlagdan öň täzeläň; gaýtadan töleg soramaň.",
    HISTORY_PAYMENT_CLOSED: "Gapjyk barlagy Aşgabat wagty bilen 09:00-da dowam eder. Çegi barlag üçin saklaň.",
    HISTORY_PAYMENT_UNAVAILABLE: "Gapjyk barlagy saklanylmady. Gaýtadan synanyşmazdan öň täzeläň.",
    HISTORY_PROOF_INVALID: "8 MB çenli bir JPEG, PNG ýa-da WebP suratyny saýlaň. Kiçiräk ekran suratyny synanyşyň.",
    HISTORY_PROOF_DENIED: "Bu çek elýeterli däl. Gaýtadan giriň ýa-da ýüz tutmany täzeläň.",
    HISTORY_PROOF_EXPIRED: "Çegi ýüklemegiň möhleti gutardy. Çegi täzeden saýlaň; gaýtadan pul tölemäň.",
    HISTORY_PROOF_CONFLICT: "Çegiň ýagdaýy üýtgedi. Täzeläp, saýlanan çegi täzeden iberiň. Gaýtadan pul tölemäň.",
    HISTORY_PROOF_UNAVAILABLE: "Çegi iberip ýa-da açyp bolmady. Şol çek bilen gaýtadan synanyşyň. Gaýtadan pul tölemäň.",

    HISTORY_ORDER_INVALID: "Tassyklamazdan öň doly teklibi barlaň.",
    HISTORY_ORDER_STALE: "Teklip üýtgedi ýa-da möhleti indi mümkin däl. Täzeläp, işgärden täze teklip soraň.",
    HISTORY_ORDER_CAPACITY: "Bu güne ýa-da wagta ýer ýok. Işgärden başga teklip soraň; pul geçirmäň.",
    HISTORY_ORDER_CONFLICT: "Bu ýüz tutmada eýýäm kabul edilen sargyt bar. Sargydyň ýagdaýyny açyň.",
    HISTORY_ORDER_UNAVAILABLE: "Sargydyň görkezmeleri elýeterli däl. Ýüz tutmany täzeläň ýa-da işgäre ýazyň; pul geçirmäň.",

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

@Catch()
export class HistoryOrdersExceptionFilter extends HistoryRequestExceptionFilter {
  override catch(error: unknown, host: ArgumentsHost) {
    const unavailable = error instanceof HistoryRequestError && error.code === "HISTORY_MESSAGE_UNAVAILABLE";
    super.catch(!unavailable && (error instanceof HistoryRequestError || error instanceof HttpException)
      ? error : new HistoryRequestError("HISTORY_ORDER_UNAVAILABLE"), host);
  }
}

@Catch()
export class HistoryProofsExceptionFilter extends HistoryRequestExceptionFilter {
  override catch(error: unknown, host: ArgumentsHost) {
    super.catch(error instanceof HistoryRequestError || error instanceof HttpException ? error : new HistoryRequestError("HISTORY_PROOF_UNAVAILABLE"), host);
  }
}

export function historyRequestFailure(error: unknown, language: string | undefined) {
  const locale = language?.split(/[-,;]/)[0]?.trim();
  const code = error instanceof HistoryRequestError ? error.code : error instanceof HttpException
    ? "HISTORY_REQUEST_DENIED" : "HISTORY_MESSAGE_UNAVAILABLE";
  const status = error instanceof HttpException ? error.getStatus() : code === "HISTORY_PAYMENT_UNAVAILABLE" || code === "HISTORY_PROOF_UNAVAILABLE" || code === "HISTORY_ORDER_UNAVAILABLE" || code === "HISTORY_OFFER_UNAVAILABLE" || code === "HISTORY_MESSAGE_UNAVAILABLE" || code === "HISTORY_REMINDER_UNAVAILABLE" || code === "HISTORY_NOTE_UNAVAILABLE" ? 503
    : code === "HISTORY_FULFILMENT_CONFLICT" || code === "HISTORY_FULFILMENT_FIFO" || code === "HISTORY_CORRECTION_CONFLICT" || code === "HISTORY_CORRECTION_CLOSED" || code === "HISTORY_PAYMENT_CONFLICT" || code === "HISTORY_PAYMENT_CLOSED" || code === "HISTORY_PROOF_EXPIRED" || code === "HISTORY_PROOF_CONFLICT" || code === "HISTORY_ORDER_STALE" || code === "HISTORY_ORDER_CONFLICT" || code === "HISTORY_ORDER_CAPACITY" || code === "HISTORY_OFFER_CONFLICT" || code === "HISTORY_REQUEST_CONFLICT" || code === "HISTORY_ASSIGNMENT_CONFLICT" || code === "HISTORY_MESSAGE_CONFLICT" || code === "HISTORY_REMINDER_CONFLICT" || code === "HISTORY_NOTE_CONFLICT" ? 409
      : code === "HISTORY_FULFILMENT_INVALID" || code === "HISTORY_CORRECTION_INVALID" || code === "HISTORY_PAYMENT_INVALID" || code === "HISTORY_PROOF_INVALID" || code === "HISTORY_ORDER_INVALID" || code === "HISTORY_OFFER_INVALID" || code === "HISTORY_REQUEST_INVALID" || code === "HISTORY_MESSAGE_INVALID" || code === "HISTORY_MESSAGE_CURSOR" || code === "HISTORY_REMINDER_INVALID"
        || code === "HISTORY_NOTE_INVALID" || code === "HISTORY_NOTE_CURSOR" ? 400 : 403;
  return { statusCode: status, code, message: messages[locale === "tk" || locale === "ru" ? locale : "en"][code] };
}

@Catch()
export class HistoryPaymentsExceptionFilter extends HistoryRequestExceptionFilter {
  override catch(error: unknown, host: ArgumentsHost) {
    const unavailable = error instanceof HistoryRequestError && error.code === "HISTORY_MESSAGE_UNAVAILABLE";
    super.catch(!unavailable && (error instanceof HistoryRequestError || error instanceof HttpException)
      ? error : new HistoryRequestError("HISTORY_PAYMENT_UNAVAILABLE"), host);
  }
}
