import { BadRequestException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { ListingActor } from "../application/ListingOwnership";
/** Business context is explicit and never inferred from a personal account's membership. */
export function inventoryActor(req: FastifyRequest, bodyBusinessId?: string): ListingActor {
 const user = (req as FastifyRequest & { user?: { sub?: string; sid?: string } }).user;
 const header = req.headers?.["x-business-id"];
 if (header !== undefined && bodyBusinessId !== undefined && header !== bodyBusinessId) throw new BadRequestException({ code: "VALIDATION_ERROR", details: { reason: "BUSINESS_CONTEXT_CHANGED" } });
 const business = header ?? bodyBusinessId;
 if (business !== undefined && !z.string().uuid().safeParse(business).success) throw new BadRequestException({ code: "VALIDATION_ERROR", details: { reason: "BUSINESS_CONTEXT_CHANGED" } });
 return { userId: user?.sub ?? "", ...(user?.sid ? { sessionId: user.sid } : {}), ...(typeof business === "string" ? { businessId: business } : {}) };
}
