import { BadRequestException, Controller, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ListingsSchemas } from "@auto-tm/contracts";
import { Public } from "../../../common/public.decorator";
import { RecordListingView } from "../application/RecordListingView";

/** Explicit collection transport, independent of detail reads and seller mutations. */
@Controller("api/v1/listings")
export class ListingViewsController {
  constructor(@Inject(RecordListingView) private readonly recordViewUC: RecordListingView) {}

  /** Dedicated signal, never called by GET/prefetch/Call/detail consumers. */
  @Public()
  @Post(":id/views")
  @HttpCode(204)
  async recordView(@Param("id") listingId: string, @Req() req: FastifyRequest): Promise<void> {
    const value = req.headers["x-app-install-id"];
    const parsed = value === undefined ? undefined : ListingsSchemas.ListingViewInstallIdSchema.safeParse(value);
    if (parsed && !parsed.success) throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Invalid app identifier" });
    const userId = (req as FastifyRequest & { user?: { sub?: string; sid?: string } }).user?.sub;
    const sessionId = (req as FastifyRequest & { user?: { sid?: string } }).user?.sid;
    await this.recordViewUC.execute({
      ...(sessionId ? { sessionId } : {}),
      listingId,
      ...(parsed?.success ? { installId: parsed.data } : {}),
      ...(userId ? { requestingUserId: userId } : {}),
    });
  }

}
