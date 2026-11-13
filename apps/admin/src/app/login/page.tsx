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

import { authCopy, historyAuth } from "@/lib/history-auth";
import { validateReturnTo } from "@/lib/validators";

type Step =
  | { kind: "phone"; phone: string; error?: string }
  | { kind: "otp"; phone: string; requestId?: string; requestedAt?: string; testCode?: string; error?: string }
  | { kind: "totp-setup"; phone: string; error: string }
  | { kind: "totp-enroll"; phone: string; qrCodeDataUrl: string; error?: string }
  | { kind: "totp-verify"; phone: string; error?: string }
  | { kind: "backup-codes"; codes: string[] };

type AuthCopy = (typeof authCopy)[keyof typeof authCopy];

function getTitle(step: Step, t: AuthCopy, scoped: boolean): string {
  switch (step.kind) {
    case "backup-codes":
      return t.backup;
    case "totp-setup":
    case "totp-enroll":
    case "totp-verify":
      return t.totp;
    default:
      return scoped ? t.title : t.adminTitle;
  }
}

function getDescription(step: Step, t: AuthCopy): string {
  switch (step.kind) {
    case "phone":
      return t.phoneBody;
    case "otp":
      return `${t.otpBody} ${step.phone}`;
    case "totp-enroll":
      return t.enrollBody;
    case "totp-verify":
      return t.verifyBody;
    case "backup-codes":
      return t.backupBody;
    default:
      return "";
  }
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = validateReturnTo(searchParams.get("returnTo")) ?? "/reports";
  const intent = historyAuth(returnTo);
  const locale = intent?.locale ?? "ru";
  const t = authCopy[locale];
  const expiredSession = searchParams.get("reason") === "session-expired";
  const forcedMode = expiredSession ? null : searchParams.get("mode"); // "totp" forces TOTP re-verify

  const [step, setStep] = useState<Step>(() => expiredSession
    ? { kind: "phone", phone: "", error: t.expired }
    : forcedMode === "totp" ? { kind: "totp-verify", phone: "" } : { kind: "phone", phone: "", ...(intent && searchParams.get("reason") === "history-access" ? { error: t.denied } : {}) });
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  // Query-only navigation can preserve this mounted page after a failed action.
  useEffect(() => {
    if (expiredSession) setStep({ kind: "phone", phone: "", error: t.expired });
  }, [expiredSession, t.expired]);

  const handleRequestOtp = useCallback(
    (formData: FormData) => {
      startTransition(async () => {
        try {
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
        } catch { setStep((s) => ({ ...s, error: t.network })); }
      });
    },
    [startTransition, t.network],
  );

  const handleVerifyOtp = useCallback(
    (formData: FormData) => {
      startTransition(async () => {
        try {
          const result = await verifyOtp(null, formData);
          if (!result.ok) {
            if (result.sessionCreated) {
              setStep({ kind: "totp-setup", phone: String(formData.get("phone") ?? ""), error: result.error });
              return;
            }
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
          const enrollResult = await enrollTotp(returnTo);
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
              kind: "totp-setup",
              phone: formData.get("phone") as string,
              error: enrollResult.error,
            });
          }
        } catch { setStep((s) => ({ ...s, error: t.network })); }
      });
    },
    [router, returnTo, startTransition, t.network],
  );

  const handleVerifyTotp = useCallback(
    (formData: FormData) => {
      startTransition(async () => {
        try {
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
        } catch { setStep((s) => ({ ...s, error: t.network })); }
      });
    },
    [router, returnTo, startTransition, t.network],
  );

  const retryEnrollment = () => startTransition(async () => {
    try {
      const result = await enrollTotp(returnTo);
      if (result.ok) setStep({ kind: "totp-enroll", phone: "", qrCodeDataUrl: result.qrCodeDataUrl });
      else if (result.reason === "already-enrolled") setStep({ kind: "totp-verify", phone: "" });
      else setStep({ kind: "totp-setup", phone: "", error: result.error });
    } catch { setStep({ kind: "totp-setup", phone: "", error: t.network }); }
  });

  const copyBackupCodes = useCallback(() => {
    if (step.kind !== "backup-codes") return;
    void navigator.clipboard.writeText(step.codes.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => setCopyError(t.copyError));
  }, [step, t.copyError]);

  return (
    <main lang={locale} className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/40 p-4">
      {intent && <nav aria-label={t.language} className="flex gap-1">{(["tk", "ru", "en"] as const).map((language) => <a key={language} lang={language} aria-current={language === locale ? "page" : undefined} className="rounded-md px-3 py-2 text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-muted" href={`/login?returnTo=${encodeURIComponent(returnTo.replace(`/vehicle-history/${locale}`, `/vehicle-history/${language}`))}`}>{language.toUpperCase()}</a>)}</nav>}
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-bold text-neutral-900">{getTitle(step, t, Boolean(intent))}</h1>
          <p className="text-sm text-neutral-600">{getDescription(step, t)}</p>
        </CardHeader>
        <CardBody>
          <input form="auth-form" type="hidden" name="returnTo" value={returnTo} />
          {step.kind === "phone" && (
            <form
              id="auth-form"
              aria-busy={isPending}
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
                  {t.phone}
                </label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="+993XXXXXXXX"
                  defaultValue={step.phone}
                  autoComplete="tel"
                  autoFocus
                  title={t.phoneError}
                  required
                  pattern="[+]+993[67][0-9]{7}"
                  disabled={isPending}
                />
              </div>
              {step.error && (
                <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> {step.error}
                </p>
              )}
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t.sending}
                  </>
                ) : (
                  t.send
                )}
              </Button>
            </form>
          )}

          {step.kind === "otp" && (
            <form
              id="auth-form"
              aria-busy={isPending}
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
                  {t.smsCode}
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
                  title={t.codeError}
                  autoComplete="one-time-code"
                  autoFocus
                  disabled={isPending}
                />
              </div>
              {step.testCode && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {t.dev}: <span className="font-mono font-bold">{step.testCode}</span>
                </p>
              )}
              {step.error && (
                <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> {step.error}
                </p>
              )}
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t.checking}
                  </>
                ) : (
                  t.verify
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isPending}
                onClick={() => setStep({ kind: "phone", phone: step.phone })}
              >
                {t.change}
              </Button>
            </form>
          )}

          {step.kind === "totp-enroll" && (
            <form
              id="auth-form"
              aria-busy={isPending}
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
                  alt={t.qr}
                  className="h-48 w-48 rounded border"
                />
                <p className="text-xs text-neutral-500">
                  {t.appHint}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="code" className="text-sm font-medium text-neutral-700">
                  {t.appCode}
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
                <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> {step.error}
                </p>
              )}
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t.checking}
                  </>
                ) : (
                  t.verify
                )}
              </Button>
            </form>
          )}

          {step.kind === "totp-verify" && (
            <form
              id="auth-form"
              aria-busy={isPending}
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
                  {t.verifyCode}
                </label>
                <Input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="text"
                  maxLength={16}
                  pattern="(?:[0-9]{6}|[a-fA-F0-9]{16})"
                  title={t.totpError}
                  autoComplete="one-time-code"
                  placeholder="123456"
                  required
                  autoFocus
                  disabled={isPending}
                />
              </div>
              {step.error && (
                <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /> {step.error}
                </p>
              )}
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t.checking}
                  </>
                ) : (
                  t.verify
                )}
              </Button>
            </form>
          )}

          {step.kind === "totp-setup" && <div className="flex flex-col gap-4"><p role="alert" className="text-sm text-destructive">{step.error}</p><Button onClick={retryEnrollment} disabled={isPending}>{isPending ? t.checking : t.retry}</Button></div>}
          {(step.kind === "totp-setup" || step.kind === "totp-verify" || step.kind === "totp-enroll") && <Button type="button" className="mt-4 w-full" variant="ghost" disabled={isPending} onClick={() => setStep({ kind: "phone", phone: step.phone })}>{t.signIn}</Button>}
          {step.kind === "backup-codes" && (
            <div className="flex flex-col gap-4">
              {copyError && <p role="alert" className="text-sm text-destructive">{copyError}</p>}
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
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={copyBackupCodes}
                  className="flex-1"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> {t.copied}
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" /> {t.copy}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  onClick={() => router.push(returnTo)}
                  className="flex-1"
                >
                  {t.continue}
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
