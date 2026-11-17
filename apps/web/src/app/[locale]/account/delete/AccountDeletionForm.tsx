"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Input } from "@auto-tm/ui/components";

import { confirmDeletion, requestDeletionCode } from "./actions";
import type { AccountDeletionCopy } from "./content";
import { accountDeletionCopy } from "./content";

import type { Locale } from "@/i18n/locales";
import type { DeletionChannel, DeletionFailure } from "@/lib/account-deletion";
import { cn } from "@/lib/utils";

type Step =
  | { kind: "value" }
  | { kind: "code"; destination: string }
  | { kind: "done"; destination: string };

const CHANNELS: DeletionChannel[] = ["phone", "email"];

function failureMessage(
  copy: AccountDeletionCopy,
  channel: DeletionChannel,
  failure: DeletionFailure,
): string {
  switch (failure) {
    case "invalid-value":
      return channel === "phone" ? copy.errors.phoneInvalid : copy.errors.emailInvalid;
    case "invalid-code-format":
      return copy.errors.codeFormat;
    case "invalid-code":
      return copy.errors.invalidCode;
    case "rate-limited":
      return copy.errors.rateLimited;
    case "unavailable":
      return copy.errors.unavailable;
  }
}


function displayDestination(channel: DeletionChannel, destination: string): string {
  if (channel === "email") return destination;
  const local = destination.slice(4);
  return `+993 ${local.slice(0, 2)} ${local.slice(2, 4)}-${local.slice(4, 6)}-${local.slice(6, 8)}`;
}


function useResendCountdown() {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  function start(seconds: number) {
    const current = Date.now();
    setNow(current);
    setDeadline(current + seconds * 1000);
  }

  const secondsLeft =
    deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
  return { secondsLeft, start, stop: () => setDeadline(null) };
}

const pendingButtonClass = "w-full aria-disabled:cursor-wait aria-disabled:opacity-60";

const linkButtonClass =
  "text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-brand-600 hover:decoration-brand-600 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline";

export function AccountDeletionForm({ locale }: { locale: Locale }) {
  const copy = accountDeletionCopy[locale];
  const [channel, setChannel] = useState<DeletionChannel>("phone");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>({ kind: "value" });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const resend = useResendCountdown();



  const headingRef = useRef<HTMLHeadingElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    (step.kind === "value" ? valueInputRef.current : headingRef.current)?.focus();
  }, [step.kind]);



  function run(action: () => Promise<void>) {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch {
        setError(copy.errors.unavailable);
      }
    });
  }

  function sendCode(target: string) {
    run(async () => {
      const result = await requestDeletionCode(locale, channel, target);
      if (!result.ok) {
        setError(failureMessage(copy, channel, result.error));
        return;
      }
      setCode("");
      resend.start(result.resendInSeconds);
      setStep({ kind: "code", destination: result.destination });
    });
  }

  function handleValueSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendCode(value);
  }

  function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== "code") return;
    const { destination } = step;
    run(async () => {
      const result = await confirmDeletion(locale, channel, destination, code);
      if (!result.ok) {
        setError(failureMessage(copy, channel, result.error));
        return;
      }
      resend.stop();
      setStep({ kind: "done", destination });
    });
  }

  function chooseChannel(next: DeletionChannel) {
    setChannel(next);
    setValue("");
    setError(null);
  }

  function startOver() {
    resend.stop();
    setCode("");
    setError(null);
    setStep({ kind: "value" });
  }

  const errorId = "account-deletion-error";
  const errorMessage = error ? (
    <p id={errorId} role="alert" className="text-sm font-medium text-error-500">
      {error}
    </p>
  ) : null;
  const headingClass =
    "text-xl font-semibold tracking-tight text-foreground outline-none md:text-2xl";

  if (step.kind === "done") {
    return (
      <section role="status" className="rounded-lg border border-border p-6 md:p-8">
        <h2 ref={headingRef} tabIndex={-1} className={headingClass}>
          {copy.doneTitle}
        </h2>
        <p className="mt-3 text-base leading-7 text-foreground/90">
          {copy.doneBody(displayDestination(channel, step.destination))}
        </p>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{copy.doneRecover}</p>
      </section>
    );
  }

  if (step.kind === "code") {
    return (
      <section className="rounded-lg border border-border p-6 md:p-8">
        <h2 ref={headingRef} tabIndex={-1} className={headingClass}>
          {copy.codeTitle}
        </h2>
        <p className="mt-2 text-base leading-7 text-muted-foreground">
          {copy.codeSent(displayDestination(channel, step.destination))}
        </p>
        <form onSubmit={handleCodeSubmit} noValidate className="mt-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="account-deletion-code" className="text-sm font-medium text-foreground">
              {copy.codeLabel}
            </label>
            <Input
              id="account-deletion-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="h-12 border-border text-lg tracking-[0.3em] tabular-nums"
              readOnly={isPending}
            />
          </div>
          {errorMessage}
          <Button
            type="submit"
            variant="destructive"
            size="lg"
            className={pendingButtonClass}
            aria-disabled={isPending}
          >
            {isPending ? copy.confirming : copy.confirm}
          </Button>
        </form>
        <div className="mt-6 flex flex-col items-start gap-3">
          <button
            type="button"
            className={linkButtonClass}
            disabled={isPending || resend.secondsLeft > 0}
            onClick={() => sendCode(step.destination)}
          >
            {resend.secondsLeft > 0 ? copy.resendIn(resend.secondsLeft) : copy.resend}
          </button>
          <button type="button" className={linkButtonClass} disabled={isPending} onClick={startOver}>
            {copy.changeValue}
          </button>
        </div>
      </section>
    );
  }

  const isPhone = channel === "phone";
  const helperId = "account-deletion-value-helper";
  return (
    <section className="rounded-lg border border-border p-6 md:p-8">
      <form onSubmit={handleValueSubmit} noValidate className="space-y-5">
        <fieldset>
          <legend className="text-sm font-medium text-foreground">{copy.channelLegend}</legend>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {CHANNELS.map((option) => (
              <label
                key={option}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-2 text-center text-sm font-medium transition-colors",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500",
                  channel === option
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <input
                  type="radio"
                  name="channel"
                  value={option}
                  checked={channel === option}
                  onChange={() => chooseChannel(option)}
                  className="sr-only"
                  disabled={isPending}
                />
                {copy[option]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <label htmlFor="account-deletion-value" className="text-sm font-medium text-foreground">
            {isPhone ? copy.phoneLabel : copy.emailLabel}
          </label>
          <div className="flex">
            {isPhone ? (
              <span className="inline-flex h-12 items-center rounded-l-md border border-r-0 border-border bg-muted px-3 text-base text-muted-foreground">
                +993
              </span>
            ) : null}
            <Input
              key={channel}
              ref={valueInputRef}
              id="account-deletion-value"
              name={channel}
              type={isPhone ? "tel" : "email"}
              inputMode={isPhone ? "tel" : "email"}
              autoComplete={isPhone ? "tel-national" : "email"}
              placeholder={isPhone ? copy.phonePlaceholder : copy.emailPlaceholder}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${helperId} ${errorId}` : helperId}
              className={cn("h-12 border-border text-base", isPhone && "rounded-l-none")}
              readOnly={isPending}
            />
          </div>
          <p id={helperId} className="text-sm text-muted-foreground">
            {isPhone ? copy.phoneHelper : copy.emailHelper}
          </p>
        </div>

        {errorMessage}
        <Button type="submit" size="lg" className={pendingButtonClass} aria-disabled={isPending}>
          {isPending ? copy.sending : copy.sendCode}
        </Button>
      </form>
    </section>
  );
}
