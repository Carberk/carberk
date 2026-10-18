import { subscribeAuthSession } from "../auth/session";
import { peekAuthSession } from "../auth/sessionSnapshot";

const drafts = new Map<string, string>();
const keyOf = (userId: string, businessId: string, enquiryId: string) => `${userId}:${businessId}:${enquiryId}`;
export function readEnquiryDraft(userId: string | null, businessId: string | undefined, enquiryId: string): string {
 return userId && businessId ? drafts.get(keyOf(userId, businessId, enquiryId)) ?? "" : "";
}
export function writeEnquiryDraft(userId: string | null, businessId: string | undefined, enquiryId: string, value: string): void {
 if (!userId || !businessId) return;
 const key = keyOf(userId, businessId, enquiryId);
 if (value) drafts.set(key, value); else drafts.delete(key);
}
// Drafts survive route unmounting, but never the end or change of a session.
let draftUserId = peekAuthSession()?.user.id;
subscribeAuthSession(() => {
 const next = peekAuthSession()?.user.id;
 if (next !== draftUserId) drafts.clear();
 draftUserId = next;
});
