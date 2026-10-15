import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { BUSINESS_AUTHORITY_PORT, BusinessAuthorityDenied, type BusinessAuthorityPort } from "../../identity/identity.public";
export interface ListingActor { userId: string; sessionId?: string | undefined; businessId?: string | undefined }
@Injectable()
export class ListingOwnership {
 constructor(@Inject(BUSINESS_AUTHORITY_PORT) private readonly authority: BusinessAuthorityPort) {}
 async authorizeOwner(actor: ListingActor): Promise<void> {
  if (!actor.businessId || !actor.sessionId) throw new ForbiddenException({ code: "FORBIDDEN", details: { reason: "BUSINESS_CONTEXT_CHANGED" } });
  try { await this.authority.authorize({ userId: actor.userId, sessionId: actor.sessionId, businessId: actor.businessId, owner: true }); }
  catch (error) { if (error instanceof BusinessAuthorityDenied) throw new ForbiddenException({ code: "FORBIDDEN", details: { reason: error.reason } }); throw error; }
 }
 async authorize(actor: ListingActor, resource: { businessId?: string | undefined; userId?: string | undefined; sellerId?: string | undefined }, transaction?: unknown, history = false): Promise<void> {
  if (!resource.businessId) {
   if (actor.businessId || (resource.userId ?? resource.sellerId) !== actor.userId) throw new ForbiddenException({ code: "FORBIDDEN", details: { reason: "OWNER_REQUIRED" } });
   return;
  }
  if (!actor.sessionId || actor.businessId !== resource.businessId) throw new ForbiddenException({ code: "FORBIDDEN", details: { reason: "BUSINESS_CONTEXT_CHANGED" } });
  try { await this.authority.authorize({ userId: actor.userId, sessionId: actor.sessionId, businessId: resource.businessId, history }, transaction); }
  catch (error) { if (error instanceof BusinessAuthorityDenied) throw new ForbiddenException({ code: "FORBIDDEN", details: { reason: error.reason } }); throw error; }
 }
}
/** Keeps legacy personal callers explicit; a missing injected adapter never authorizes business stock. */
export async function assertListingOwnership(ownership: ListingOwnership | undefined, actor: ListingActor, resource: { businessId?: string | undefined; userId?: string | undefined; sellerId?: string | undefined }, transaction?: unknown) {
 if (ownership) return ownership.authorize(actor, resource, transaction);
 if (resource.businessId || actor.businessId || (resource.userId ?? resource.sellerId) !== actor.userId) throw new ForbiddenException({ code: "FORBIDDEN", details: { reason: "OWNER_REQUIRED" } });
}
