import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useFocusEffect, router, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { BusinessSchemas } from "@auto-tm/contracts";

import { useAuth } from "../auth/useAuth";
import { useAuthIntentStore } from "../auth/intentStore";
import { ApiError } from "../api/client";
import { localeTag } from "../i18n/resources";

import { inventoryCopy } from "./inventoryCopy";
import { enquiryCopy } from "./enquiryCopy";
import { useBusinessAction, useBusinessWorkspace } from "./api";
import { businessCopy } from "./copy";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SafeScreen } from "@/components/navigation/SafeScreen";
import { BackButton, StackHeader } from "@/components/navigation/StackHeader";
import { useSafeBack } from "@/src/navigation/useSafeBack";
import { Text } from "@/components/ui/text";

type Receipt = { token: string; expiresAt: string; userId: string | null };
export function BusinessScreen() {
 const goBack = useSafeBack("/(tabs)/services");
 const { t: navigationText } = useTranslation("common");
 const { i18n } = useTranslation(); const c = businessCopy(i18n.language);
 const { userId, isAuthenticated } = useAuth(); const query = useBusinessWorkspace(); const action = useBusinessAction();
 const [token, setToken] = useState(""); const [recipient, setRecipient] = useState(""); const [name, setName] = useState(""); const [message, setMessage] = useState(""); const [receipt, setReceipt] = useState<Receipt | null>(null);
 const workspace = isAuthenticated === true ? query.data?.workspace : null;
 useEffect(() => { setToken(""); setRecipient(""); setMessage(""); setReceipt(null); }, [userId]);
 useEffect(() => { setName(workspace?.business.name ?? ""); }, [workspace?.business.name]);
 useFocusEffect(useCallback(() => { if (isAuthenticated === true) void query.refetch(); }, [isAuthenticated, query.refetch]));
 async function run(input: Parameters<typeof action.mutateAsync>[0]) {
  const actorId = userId;
  setMessage(""); setReceipt(null);
  try { const result = await action.mutateAsync(input); if (result) setReceipt({ ...result, userId: actorId }); else setMessage(c.saved); if (input.kind === "redeem") setToken(""); }
  catch (error) {
   const reason = error instanceof ApiError ? (error.details as { reason?: string } | undefined)?.reason : undefined;
   setMessage(reason === "SOLE_OWNER" ? c.ownerProtected : error instanceof ApiError && error.status === 409 ? c.conflict : error instanceof ApiError && error.status === 403 ? c.permission : c.failed);
   if (error instanceof ApiError && error.status === 403) void query.refetch();
  }
 }
 const control = (label: string, onPress: () => void, disabled = false) => <Button disabled={action.isPending || disabled} onPress={onPress}><Text>{action.isPending ? c.working : label}</Text></Button>;
 const heading = (text: string) => <Text className="mt-5 font-heading text-title-3 font-semibold">{text}</Text>;
 return <SafeScreen><StackHeader title={c.title} leading={<BackButton onPress={goBack} accessibilityLabel={navigationText("back")}/>}/><Stack.Screen options={{ title: c.title, headerBackTitle: c.back }} /><ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
  {isAuthenticated !== true ? <><Text>{c.signedOut}</Text>{control(c.signIn, () => useAuthIntentStore.getState().requireSignIn(router, { returnTo: "/business" }))}</> : <>
   {message ? <Text accessibilityRole="alert" className="text-foreground">{message}</Text> : null}
   {query.isPending ? <Text accessibilityRole="progressbar">{c.loading}</Text> : query.isError ? <><Text accessibilityRole="alert">{c.error}</Text>{control(c.retry, () => { void query.refetch(); })}</> : <>
    {!workspace ? <><Text className="font-heading text-title-2 font-semibold">{c.empty}</Text><Text className="text-muted-foreground">{c.emptyBody}</Text><Text>{c.accountId}</Text><Text selectable className="font-mono text-footnote">{userId}</Text></> : <>
     <Text className="font-heading text-title-2 font-semibold">{workspace.business.name}</Text>
     <Text>{c[workspace.membership.role]} · {c[workspace.business.status]}</Text><Text>{c.accountId}</Text><Text selectable className="font-mono text-footnote">{userId}</Text>
     <Text className="text-muted-foreground">{workspace.business.admissionMode === "synthetic" ? c.synthetic : c.checked}</Text>
     <Text className="text-muted-foreground">{c.personal}</Text>
     {control(inventoryCopy(i18n.language).title, () => router.push("/business-inventory"))}
     {control(enquiryCopy(i18n.language).title, () => router.push("/business-enquiries"))}
     {workspace.business.status !== "active" ? <Text accessibilityRole="alert">{c.inactive}</Text> : null}
     {workspace.membership.role === "sales" ? <Text>{c.salesAccess}</Text> : <>
      {heading(c.settings)}<Text>{c.name}</Text><Input accessibilityLabel={c.name} value={name} onChangeText={setName} maxLength={120} />
      {control(c.save, () => { if (!BusinessSchemas.BusinessSettingsSchema.safeParse({ name }).success) setMessage(c.invalidName); else void run({ kind: "settings", businessId: workspace.business.id, name }); }, workspace.business.status !== "active")}
      {heading(c.members)}{workspace.members.length === 1 ? <Text className="text-muted-foreground">{c.noMembers}</Text> : null}
      {workspace.members.map((member) => <View key={member.userId} className="gap-2 border-b border-border py-3"><Text selectable className="font-mono text-footnote">{member.userId}</Text><Text>{c[member.role]} · {c[member.status]}</Text>{member.role === "owner" ? <Text className="text-muted-foreground">{c.ownerProtected}</Text> : <>
       {control(member.status === "active" ? c.suspend : c.restore, () => { void run({ kind: "member", businessId: workspace.business.id, targetUserId: member.userId, action: member.status === "active" ? "suspend" : "restore" }); }, workspace.business.status !== "active")}
       {control(c.remove, () => Alert.alert(c.confirmRemove, member.userId, [{ text: c.cancel, style: "cancel" }, { text: c.confirm, style: "destructive", onPress: () => { void run({ kind: "member", businessId: workspace.business.id, targetUserId: member.userId, action: "remove" }); } }]), workspace.business.status !== "active")}</>}</View>)}
      {heading(c.invite)}<Text className="text-muted-foreground">{c.invitationHelp}</Text><Text>{c.recipient}</Text><Input accessibilityLabel={c.recipient} autoCapitalize="none" value={recipient} onChangeText={setRecipient} />
      {control(c.invite, () => { const parsed = BusinessSchemas.BusinessInviteSchema.safeParse({ recipientUserId: recipient.trim() }); if (!parsed.success) setMessage(c.uuid); else void run({ kind: "invite", businessId: workspace.business.id, ...parsed.data }); }, workspace.business.status !== "active")}
      {receipt && receipt.userId === userId ? <View className="gap-3 rounded-xl border border-border p-4"><Text>{c.receipt}</Text><Text selectable className="font-mono text-footnote">{receipt.token}</Text><Text>{c.expires}: {new Date(receipt.expiresAt).toLocaleString(localeTag(i18n.language))}</Text></View> : null}
      {heading(c.invitations)}{workspace.invitations.length === 0 ? <Text>{c.noInvitations}</Text> : workspace.invitations.map((invite) => { const valid = !invite.revokedAt && !invite.redeemedAt && new Date(invite.expiresAt) > new Date(); return <View key={invite.id} className="gap-2 border-b border-border py-3"><Text selectable className="font-mono text-footnote">{invite.recipientUserId}</Text><Text>{invite.revokedAt ? c.revoked : invite.redeemedAt ? c.redeemed : valid ? c.pending : c.expired}</Text><Text>{c.expires}: {new Date(invite.expiresAt).toLocaleString(localeTag(i18n.language))}</Text>{valid ? control(c.revoke, () => { void run({ kind: "revoke", businessId: workspace.business.id, invitationId: invite.id }); }, workspace.business.status !== "active") : null}</View>; })}
     </>}
    </>}
    <><Text>{c.token}</Text><Input accessibilityLabel={c.token} value={token} autoCapitalize="none" autoCorrect={false} onChangeText={setToken} />{control(c.redeem, () => { const parsed = BusinessSchemas.RedeemBusinessInviteSchema.safeParse({ token: token.trim() }); if (!parsed.success) setMessage(c.invalidCode); else void run({ kind: "redeem", ...parsed.data }); })}</>
    {control(c.retry, () => { void query.refetch(); })}
   </>}
  </>}
 </ScrollView></SafeScreen>;
}
