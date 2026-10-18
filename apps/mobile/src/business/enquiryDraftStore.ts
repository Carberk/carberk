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
export function clearEnquiryDraftsForUser(userId: string | null): void {
 if (!userId) { drafts.clear(); return; }
 for (const key of drafts.keys()) if (key.startsWith(`${userId}:`)) drafts.delete(key);
}
