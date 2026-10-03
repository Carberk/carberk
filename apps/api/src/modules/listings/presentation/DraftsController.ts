import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Param,
  Body,
  Query,
  Req,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { ZodType, ZodTypeDef } from "zod";
import { ListingsSchemas, WizardSchemas, AdminSchemas } from "@auto-tm/contracts";

import { IDENTITY_CHECK_PORT, type IdentityCheckPort } from "../../identity/identity.public";
import { CreateDraft } from "../application/CreateDraft";
import { UpdateDraft } from "../application/UpdateDraft";
import { DiscardDraft } from "../application/DiscardDraft";
import { ListMyDrafts } from "../application/ListMyDrafts";
import { ValidateDraftStep } from "../application/ValidateDraftStep";

type AuthenticatedRequest = FastifyRequest & { user?: { sub?: string } };

@Controller()
export class DraftsController {
  constructor(
    @Inject(CreateDraft) private readonly createDraftUC: CreateDraft,
    @Inject(UpdateDraft) private readonly updateDraftUC: UpdateDraft,
    @Inject(DiscardDraft) private readonly discardDraftUC: DiscardDraft,
    @Inject(ListMyDrafts) private readonly listMyDraftsUC: ListMyDrafts,
    @Inject(ValidateDraftStep) private readonly validateStepUC: ValidateDraftStep,
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

  // safeParse, not `instanceof ZodError`: contract schemas may come from another
  // zod instance, and a failed instanceof turned bad requests into a 500.
  private parseOrThrow<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
    const result = schema.safeParse(data);
    if (result.success) return result.data;
    // eslint-disable-next-line no-console
    console.error("[Zod validation failed]", result.error.flatten(), "body:", JSON.stringify(data));
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: result.error.flatten(),
    });
  }

  private userId(req: FastifyRequest): string {
    return (req as AuthenticatedRequest).user?.sub as string;
  }

  @Post("api/v1/listings/drafts")
  async createDraft(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    const parsed = this.parseOrThrow(ListingsSchemas.CreateDraftRequestSchema, body);
    const userId = this.userId(req);
    await this.assertNotSuspended(userId);

    const result = await this.createDraftUC.execute({
      userId,
      ...(parsed?.initialPayload !== undefined ? { initialPayload: parsed.initialPayload } : {}),
    });

    return {
      id: result.draft.id,
      userId: result.draft.userId,
      payload: result.draft.payload,
      createdAt: result.draft.createdAt.toISOString(),
      updatedAt: result.draft.updatedAt.toISOString(),
    };
  }

  @Patch("api/v1/listings/drafts/:id")
  async updateDraft(
    @Param("id") draftId: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    const parsed = this.parseOrThrow(ListingsSchemas.UpdateDraftRequestSchema, body);
    const userId = this.userId(req);
    await this.assertNotSuspended(userId);

    const result = await this.updateDraftUC.execute({
      draftId,
      userId,
      payload: parsed,
    });

    return {
      id: result.draft.id,
      userId: result.draft.userId,
      payload: result.draft.payload,
      createdAt: result.draft.createdAt.toISOString(),
      updatedAt: result.draft.updatedAt.toISOString(),
    };
  }

  @Post("api/v1/listings/drafts/:id/validate-step")
  @HttpCode(200)
  async validateStep(
    @Param("id") draftId: string,
    @Body() body: unknown,
    @Req() req: FastifyRequest,
  ) {
    const parsed = this.parseOrThrow(WizardSchemas.ValidateStepRequestSchema, body);
    const userId = this.userId(req);

    const result = await this.validateStepUC.execute({
      draftId,
      userId,
      step: parsed.step,
      payload: parsed.payload,
    });

    return {
      valid: result.valid,
      errors: result.errors,
      invalidatedSteps: result.invalidatedSteps,
    };
  }

  @Delete("api/v1/listings/drafts/:id")
  async discardDraft(
    @Param("id") draftId: string,
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);
    await this.assertNotSuspended(userId);
    await this.discardDraftUC.execute({ draftId, userId });
    return { success: true };
  }

  @Get("api/v1/me/drafts")
  async listMyDrafts(
    @Query() query: { cursor?: string; limit?: number },
    @Req() req: FastifyRequest,
  ) {
    const userId = this.userId(req);
    const pagination = this.parseOrThrow(ListingsSchemas.FeedQuerySchema, query);

    const cursor = pagination.cursor
      ? ListingsSchemas.decodeCursor(pagination.cursor)
      : undefined;

    const result = await this.listMyDraftsUC.execute({
      userId,
      ...(cursor !== undefined ? { cursor } : {}),
      limit: pagination.limit,
    });

    return {
      items: result.items.map((d) => ({
        id: d.id,
        userId: d.userId,
        payload: d.payload,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
      nextCursor: result.nextCursor
        ? ListingsSchemas.encodeCursor(result.nextCursor)
        : null,
    };
  }
}
