import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { ZodError } from "zod";
import { ErrorCode, ListingsSchemas, AdminSchemas } from "@auto-tm/contracts";

import { IDENTITY_CHECK_PORT, type IdentityCheckPort } from "../../identity/identity.public";
import { AddFavorite } from "../application/AddFavorite";
import { RemoveFavorite } from "../application/RemoveFavorite";
import { ListMyFavorites } from "../application/ListMyFavorites";

type AuthenticatedRequest = FastifyRequest & { user?: { sub?: string } };

@Controller()
export class FavoritesController {
  constructor(
    @Inject(AddFavorite) private readonly addFavoriteUC: AddFavorite,
    @Inject(RemoveFavorite) private readonly removeFavoriteUC: RemoveFavorite,
    @Inject(ListMyFavorites) private readonly listMyFavoritesUC: ListMyFavorites,
    @Inject(IDENTITY_CHECK_PORT)
    private readonly identityCheck: IdentityCheckPort,
  ) {}

  private async assertNotSuspended(userId: string): Promise<void> {
    const suspended = await this.identityCheck.isSuspended(userId);
    if (suspended) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "User is suspended",
        details: { reason: AdminSchemas.AdminErrorReason.UserSuspended },
      });
    }
  }

  private userId(req: FastifyRequest): string {
    return (req as AuthenticatedRequest).user?.sub as string;
  }

  private parseOrThrow<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
    try {
      return schema.parse(data);
    } catch (err) {
      // Duck-typed: the schema's ZodError can come from another copy of zod, which
      // fails `instanceof` and would turn a bad query into a 500.
      if (err && typeof err === "object" && "issues" in err) {
        const zodError = err as ZodError;
        // eslint-disable-next-line no-console
        console.error("[Zod validation failed]", Object.keys(zodError.flatten().fieldErrors));
        throw new BadRequestException({
          code: ErrorCode.ValidationFailed,
          message: "Request validation failed",
          details: zodError.flatten(),
        });
      }
      throw err;
    }
  }

  @Post("api/v1/listings/:id/favorite")
  async addFavorite(
    @Param("id") listingId: string,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);
    await this.assertNotSuspended(userId);

    return this.addFavoriteUC.execute({ userId, listingId });
  }

  @Delete("api/v1/listings/:id/favorite")
  async removeFavorite(
    @Param("id") listingId: string,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);
    await this.assertNotSuspended(userId);

    return this.removeFavoriteUC.execute({ userId, listingId });
  }

  @Get("api/v1/favorites")
  async listMyFavorites(
    @Query() query: unknown,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);
    const params = this.parseOrThrow(ListingsSchemas.MyFavoritesQuerySchema, query);
    return this.listMyFavoritesUC.execute({
      userId,
      ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
      limit: params.limit,
      activeOnly: params.activeOnly,
    });
  }
}
