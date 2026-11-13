"use client";

import { useState, useTransition, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Card, CardHeader, CardBody } from "@auto-tm/ui/components";
import { Copy, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

import {
  requestOtp,
  verifyOtp,
  enrollTotp,
  verifyTotp,
} from "../actions";

import { SESSION_EXPIRED_MESSAGE } from "@/lib/auth-cookie-options";
import { validateReturnTo } from "@/lib/validators";

type Step =
  | { kind: "phone"; phone: string; error?: string }
  | { kind: "otp"; phone: string; requestId?: string; requestedAt?: string; testCode?: string; error?: string }
  | { kind: "totp-enroll"; phone: string; qrCodeDataUrl: string; error?: string }
  | { kind: "totp-verify"; phone: string; error?: string }
  | { kind: "backup-codes"; codes: string[] };

function getTitle(step: Step): string {
  switch (step.kind) {
    case "backup-codes":
      return "Резервные коды";
    case "totp-enroll":
    case "totp-verify":
      return "Двухфакторная аутентификация";
    default:
      return "Вход в панель администратора";
  }
}

function getDescription(step: Step): string {
  switch (step.kind) {
    case "phone":
      return "Введите номер телефона для получения кода подтверждения.";
    case "otp":
      return `Введите 6-значный код, отправленный на ${step.phone}`;
    case "totp-enroll":
      return "Отсканируйте QR-код в приложении-аутентификаторе и введите код.";
    case "totp-verify":
      return "Введите код из приложения-аутентификатора.";
    case "backup-codes":
      return "Сохраните эти коды — они больше не будут показаны.";
    default:
      return "";
  }
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = validateReturnTo(searchParams.get("returnTo")) ?? "/reports";
  const expiredSession = searchParams.get("reason") === "session-expired";
  const forcedMode = expiredSession ? null : searchParams.get("mode"); // "totp" forces TOTP re-verify

  const [step, setStep] = useState<Step>(() => expiredSession
    ? { kind: "phone", phone: "", error: SESSION_EXPIRED_MESSAGE }
    : { kind: "phone", phone: "" });
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  // Query-only navigation can preserve this mounted page after a failed action.
  useEffect(() => {
    if (expiredSession) setStep({ kind: "phone", phone: "", error: SESSION_EXPIRED_MESSAGE });
  }, [expiredSession]);

  // If forcedMode=totp and we land here with cookies, we need to check status
  // The proxy/layout will have redirected; this page just renders the TOTP verify form.
  useEffect(() => {
    if (forcedMode === "totp" && step.kind === "phone") {
      setStep({ kind: "totp-verify", phone: "" });
    }
  }, [forcedMode, step.kind]);

  const handleRequestOtp = useCallback(
    (formData: FormData) => {
      startTransition(async () => {
        const result = await requestOtp(null, formData);
        if (result.ok) {
          const nextStep: Extract<Step, { kind: "otp" }> = {
            kind: "otp",
            phone: String(formData.get("phone") ?? ""),
            requestId: result.requestId,
            requestedAt: result.requestedAt,
          };
          if (result.testCode !== undefined) {
            nextStep.testCode = result.testCode;
          }
          setStep(nextStep);
        } else {
          setStep({
            kind: "phone",
            phone: String(formData.get("phone") ?? ""),
            error: result.error,
          });
        }
      });
    },
    [startTransition],
  );

  const handleVerifyOtp = useCallback(
    (formData: FormData) => {
      startTransition(async () => {
        const result = await verifyOtp(null, formData);
        if (!result.ok) {
          setStep((s) =>
            s.kind === "otp"
              ? { ...s, error: result.error }
              : { kind: "otp", phone: String(formData.get("phone") ?? ""), error: result.error },
          );
          return;
        }

        if (result.next === "reports") {
          router.push(returnTo);
          return;
        }

        if (result.totpEnrolled) {
          setStep({
            kind: "totp-verify",
            phone: formData.get("phone") as string,
          });
          return;
        }

        // Need TOTP setup or verification
        const enrollResult = await enrollTotp();
        if (enrollResult.ok) {
          setStep({
            kind: "totp-enroll",
            phone: formData.get("phone") as string,
            qrCodeDataUrl: enrollResult.qrCodeDataUrl,
          });
        } else if (enrollResult.reason === "already-enrolled") {
          setStep({
            kind: "totp-verify",
            phone: formData.get("phone") as string,
          });
        } else {
          setStep({
            kind: "totp-verify",
            phone: formData.get("phone") as string,
            error: enrollResult.error,
          });
        }
      });
    },
    [router, returnTo, startTransition],
  );

  const handleVerifyTotp = useCallback(
    (formData: FormData) => {
      startTransition(async () => {
        const result = await verifyTotp(null, formData);
        if (!result.ok) {
          setStep((s) =>
            s.kind === "totp-enroll" || s.kind === "totp-verify"
              ? { ...s, error: result.error }
              : s,
          );
          return;
        }

        if (result.backupCodes && result.backupCodes.length > 0) {
          setStep({ kind: "backup-codes", codes: result.backupCodes });
        } else {
          router.push(returnTo);
        }
      });
    },
    [router, returnTo, startTransition],
  );

  const copyBackupCodes = useCallback(() => {
    if (step.kind !== "backup-codes") return;
    void navigator.clipboard.writeText(step.codes.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [step]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-bold text-neutral-900">{getTitle(step)}</h1>
          <p className="text-sm text-neutral-600">{getDescription(step)}</p>
        </CardHeader>
        <CardBody>
          {step.kind === "phone" && (
            <form
              action={handleRequestOtp}
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleRequestOtp(formData);
              }}
            >
              <div className="flex flex-col gap-2">
                <label htmlFor="phone" className="text-sm font-medium text-neutral-700">
                  Телефон
                </label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="+993XXXXXXXX"
                  defaultValue={step.phone}
                  required
                  pattern="[+]+993[67][0-9]{7}"
                  disabled={isPending}
                />
              </div>
              {step.error && (
                <p className="flex items-center gap-1 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4" /> {step.error}
                </p>
              )}
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Отправка...
                  </>
                ) : (
                  "Отправить код"
                )}
              </Button>
            </form>
          )}

          {step.kind === "otp" && (
            <form
              action={handleVerifyOtp}
              data-otp-request-id={step.requestId}
              data-otp-requested-at={step.requestedAt}
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleVerifyOtp(formData);
              }}
            >
              <input type="hidden" name="phone" value={step.phone} />
              <div className="flex flex-col gap-2">
                <label htmlFor="code" className="text-sm font-medium text-neutral-700">
                  Код подтверждения
                </label>
                <Input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  required
                  pattern="[0-9]{6}"
                  autoFocus
                  disabled={isPending}
                />
              </div>
              {step.testCode && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Dev mode — код: <span className="font-mono font-bold">{step.testCode}</span>
                </p>
              )}
              {step.error && (
                <p className="flex items-center gap-1 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4" /> {step.error}
                </p>
              )}
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Проверка...
                  </>
                ) : (
                  "Подтвердить"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isPending}
                onClick={() => setStep({ kind: "phone", phone: step.phone })}
              >
                Изменить номер
              </Button>
            </form>
          )}

          {step.kind === "totp-enroll" && (
            <form
              action={handleVerifyTotp}
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleVerifyTotp(formData);
              }}
            >
              <div className="flex flex-col items-center gap-4">
                <img
                  src={step.qrCodeDataUrl}
                  alt="QR-код для настройки 2FA"
                  className="h-48 w-48 rounded border"
                />
                <p className="text-xs text-neutral-500">
                  Используйте приложение Google Authenticator, 1Password или аналогичное.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="code" className="text-sm font-medium text-neutral-700">
                  Код из приложения
                </label>
                <Input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  required
                  autoFocus
                  disabled={isPending}
                />
              </div>
              {step.error && (
                <p className="flex items-center gap-1 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4" /> {step.error}
                </p>
              )}
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Проверка...
                  </>
                ) : (
                  "Подтвердить"
                )}
              </Button>
            </form>
          )}

          {step.kind === "totp-verify" && (
            <form
              action={handleVerifyTotp}
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleVerifyTotp(formData);
              }}
            >
              <div className="flex flex-col gap-2">
                <label htmlFor="code" className="text-sm font-medium text-neutral-700">
                  Код из приложения-аутентификатора
                </label>
                <Input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  required
                  autoFocus
                  disabled={isPending}
                />
              </div>
              {step.error && (
                <p className="flex items-center gap-1 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4" /> {step.error}
                </p>
              )}
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Проверка...
                  </>
                ) : (
                  "Подтвердить"
                )}
              </Button>
            </form>
          )}

          {step.kind === "backup-codes" && (
            <div className="flex flex-col gap-4">
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800">
                  Сохраните эти коды сейчас — они не будут показаны снова.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-md border bg-neutral-50 p-4">
                {step.codes.map((code, i) => (
                  <code
                    key={i}
                    className="font-mono text-sm text-neutral-800"
                  >
                    {code}
                  </code>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={copyBackupCodes}
                  className="flex-1"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Скопировано
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" /> Копировать
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  onClick={() => router.push(returnTo)}
                  className="flex-1"
                >
                  Продолжить
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
