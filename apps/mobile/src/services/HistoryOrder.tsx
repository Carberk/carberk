import { useRef, useState } from "react";
import { View } from "react-native";
import { randomUUID } from "expo-crypto";

import { localeTag } from "../i18n/resources";

import { useHistoryCommand, useHistoryOrder } from "./api";
import { HistoryReports } from "./HistoryReports";
import { historyCopy } from "./historyCopy";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

export function HistoryOrder({ id, locale }: { id: string; locale: string }) {
 const query = useHistoryOrder(id), action = useHistoryCommand(id), c = historyCopy(locale);
 const [vin, setVin] = useState(""), [claim, setClaim] = useState(""), [error, setError] = useState(false);
 const retry = useRef<{ claim: string; id: string } | null>(null);
 const data = query.isError ? undefined : query.data, order = data?.order;
 const quote = data?.quotes.find(value => !value.acceptedAt && !value.supersededAt && value.preflightOutcome === "available" && value.feasible);
 const date = (value: string) => new Date(value).toLocaleString(localeTag(locale));
 const accept = async () => {
  if (!quote || vin !== quote.vin || action.isPending) return;
  setError(false);
  try { await action.mutateAsync({ kind: "accept", quoteId: quote.id, vin, providers: quote.providers, amount: 100, refundRule: quote.refundRule, windowStart: quote.windowStart, windowEnd: quote.windowEnd, rights: { category: "payment_evidence", purpose: "Synthetic order reconciliation", basis: "Owned synthetic test data", provenance: "Synthetic customer confirmation", identifiability: "personal", use: ["service"], schedule: { kind: "until", until: new Date(Date.now()+30*86400000).toISOString(), reason: "Synthetic 30 day record schedule" }, supplierRestrictions: "No live collection or provider action", hold: null } }); }
  catch { setError(true); }
 };
 const submit = async () => {
  if (!order || !claim.trim() || action.isPending) return;
  if (retry.current?.claim !== claim) retry.current = { claim, id: randomUUID() };
  setError(false);
  try { await action.mutateAsync({ kind: "payment", orderId: order.id, clientPaymentId: retry.current.id, claim }); setClaim(""); retry.current = null; }
  catch { setError(true); }
 };
 const recover = async (agree: boolean) => {
  if (!order || action.isPending) return;
  setError(false);
  try { await action.mutateAsync({ kind: "recovery", orderId: order.id, expectedVersion: order.version, agree, ...(agree && order.recoveryOfferedDeadline ? { deadline: order.recoveryOfferedDeadline } : {}) }); }
  catch { setError(true); }
 };
 const button = (label: string, press: () => void, disabled = false) => <Button accessibilityRole="button" accessibilityLabel={label} disabled={disabled || action.isPending} onPress={press}><Text>{label}</Text></Button>;
 return <View className="gap-3 rounded-xl border border-border p-4">
  <Text>{c.synthetic}</Text>
  {query.isError || error ? <Text accessibilityRole="alert">{c.error}</Text> : null}
  {button(c.refresh, () => { void query.refetch(); })}
  {order ? <>
   <Text>{c.state}: {order.state === "paid" ? c.paid : order.state === "review" ? c.review : order.state === "delivered" ? c.delivered : order.state.startsWith("refund") ? c.refund : c.pending}</Text>
   <Text>{c.promise}: {date(order.promiseAt)}</Text>
   {order.state === "held" ? <Text>{c.held} {date(order.holdExpiresAt)}</Text> : null}
   {["held", "expired", "review"].includes(order.state) ? <><Text>{c.unverified}</Text><Text>{c.afterHours}</Text>{order.state === "expired" ? <Text>{c.expired}</Text> : null}<Input accessibilityLabel={c.claim} value={claim} onChangeText={setClaim} maxLength={1000} multiline/>{button(c.submit, () => { void submit(); }, !claim.trim())}</> : null}
   {order.paidAt ? <Text>{c.noCancel}</Text> : null}
   {order.state === "delivered" ? <HistoryReports id={id} locale={locale}/> : null}
   {!order.recoveryUsed && order.escalatedAt && !["delivered", "refunded", "refund_pending"].includes(order.state) ? <>
    {order.recoveryOfferedDeadline && order.recoveryOfferExpiresAt ? <><Text>{c.recoveryOffer}: {date(order.recoveryOfferedDeadline)}</Text><Text>{c.recoveryExpires}: {date(order.recoveryOfferExpiresAt)}</Text>{button(c.recoveryAccept, () => { void recover(true); }, Date.now() >= Date.parse(order.recoveryOfferExpiresAt))}</> : null}
    {button(c.recoveryDecline, () => { void recover(false); })}
   </> : null}
   {order.recoveryDeadline ? <Text>{c.recovery}: {date(order.recoveryDeadline)}</Text> : null}
   {order.refundState ? <Text>{c.refund}: {order.refundState === "executed" ? c.refundExecuted : order.refundState === "approved" ? c.refundApproved : c.refundPending}</Text> : null}
   {data?.payments.map(payment => <View key={payment.id}><Text>{payment.claim}</Text><Text>{payment.state === "confirmed" ? c.paid : c.review}</Text></View>)}
  </> : null}
  {quote && (!order || ["expired", "review"].includes(order.state)) ? <>
   <Text>{quote.vin}</Text><Text>{quote.providers.map(provider => provider === "carfax" ? "Carfax" : "AutoCheck").join(" / ")}</Text><Text>{c.amount}</Text><Text>{quote.refundRule}</Text><Text>{c.promise}: {date(quote.windowStart)} - {date(quote.windowEnd)}</Text><Text>{c.retained}</Text>
   <Input accessibilityLabel={c.confirmVin} value={vin} onChangeText={setVin} autoCapitalize="characters" maxLength={17}/>{vin && vin !== quote.vin ? <Text accessibilityRole="alert">{c.wrongVin}</Text> : null}
   {button(c.accept, () => { void accept(); }, vin !== quote.vin)}
  </> : !order ? <Text>{c.unavailable}</Text> : null}
 </View>;
}
