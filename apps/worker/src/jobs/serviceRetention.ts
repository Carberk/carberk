export function supportCaseDue(value: { status: string; closedAt: Date | null }, now: Date): boolean {
 return value.status === "closed" && value.closedAt !== null && value.closedAt.getTime() <= now.getTime() - 90 * 86400000;
}
export function serviceAttachmentDue(rights: unknown, now: Date): boolean {
 if (!rights || typeof rights !== "object") return false;
 const value = rights as { hold?: { until?: string } | null; schedule?: { kind?: string; until?: string } };
 if (value.hold?.until && new Date(value.hold.until) > now) return false;
 return value.schedule?.kind === "until" && !!value.schedule.until && new Date(value.schedule.until) <= now;
}
