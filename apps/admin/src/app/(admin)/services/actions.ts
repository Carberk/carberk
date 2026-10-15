"use server";
import { unstable_rethrow } from "next/navigation";
import { ServiceMessagingSchemas as S } from "@auto-tm/contracts";
import { z } from "zod";

import { apiFetch, ApiError } from "@/lib/api-client";
import { rejectExpiredSession } from "@/lib/action-session";

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: "permission" | "conflict" | "disabled" | "error" };
const queueSchema = z.array(z.object({ id: z.string().uuid(), resourceId: z.string().uuid(), assigned: z.boolean(), assignmentVersion: z.number().int(), createdAt: z.string().datetime() }));
export type ServiceQueue = z.infer<typeof queueSchema>;
async function run<T>(work: () => Promise<T>): Promise<ServiceResult<T>> {
 await rejectExpiredSession();
 try { return { ok: true, data: await work() }; } catch (error) {
  unstable_rethrow(error);
  return { ok: false, error: error instanceof ApiError ? error.status === 403 ? "permission" : error.status === 409 ? "conflict" : error.status === 503 ? "disabled" : "error" : "error" };
 }
}
export async function serviceQueue(purpose: S.ServicePurpose): Promise<ServiceResult<ServiceQueue>> { return run(async () => queueSchema.parse(await apiFetch(`/services/queue/${S.ServicePurposeSchema.parse(purpose)}`))); }
export async function serviceRead(id: string, after = 0): Promise<ServiceResult<S.ServiceConversation>> { return run(async () => S.ServiceConversationSchema.parse(await apiFetch(`/services/conversations/${z.string().uuid().parse(id)}?limit=50&after=${z.number().int().nonnegative().parse(after)}`))); }
export async function serviceSend(id: string, input: S.ServiceSend): Promise<ServiceResult<S.ServiceMessage>> { return run(async () => S.ServiceMessageSchema.parse(await apiFetch(`/services/conversations/${z.string().uuid().parse(id)}/messages`, { method: "POST", body: S.ServiceSendSchema.parse(input) }))); }
export async function serviceAssign(id: string, expectedVersion: number, targetUserId?: string): Promise<ServiceResult<null>> { return run(async () => { await apiFetch(`/services/conversations/${z.string().uuid().parse(id)}/assignment`, { method: "POST", body: S.ServiceAssignSchema.parse({ expectedVersion, targetUserId }) }); return null; }); }
export async function serviceStage(id: string, input: S.ServiceStageAttachment): Promise<ServiceResult<{ id: string }>> { return run(async () => z.object({ id: z.string().uuid() }).parse(await apiFetch(`/services/conversations/${z.string().uuid().parse(id)}/attachments`, { method: "POST", body: S.ServiceStageAttachmentSchema.parse(input) }))); }
