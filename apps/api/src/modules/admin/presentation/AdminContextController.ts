import { BadRequestException, Controller, Get, Header, Inject, NotFoundException, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { AdminContextSchemas } from "@auto-tm/contracts";

import { AdminGuard } from "../../../common/admin.guard";
import { ADMIN_CONTEXT_READ_PORT, type AdminContextReadPort } from "../domain/ports/AdminContextReadPort";

@Controller("api/v1/admin/context")
@UseGuards(AdminGuard)
export class AdminContextController {
  constructor(@Inject(ADMIN_CONTEXT_READ_PORT) private readonly context: AdminContextReadPort) {}

  @Header("Cache-Control", "no-store")
  @Get("listings")
  listings(@Query() query: Record<string, string>) {
    const parsed = AdminContextSchemas.AdminContextListingQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_ERROR" });
    return this.context.listings(parsed.data);
  }
  @Header("Cache-Control", "no-store")
  @Get("listings/:id")
  async listing(@Param("id", new ParseUUIDPipe()) id: string) {
    const result = await this.context.listing(id);
    if (!result) throw new NotFoundException("Listing not found");
    return result;
  }
  @Header("Cache-Control", "no-store")
  @Get("users")
  users(@Query() query: Record<string, string>) {
    const parsed = AdminContextSchemas.AdminContextQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_ERROR" });
    return this.context.users(parsed.data);
  }
  @Header("Cache-Control", "no-store")
  @Get("users/:id")
  async user(@Param("id", new ParseUUIDPipe()) id: string) {
    const result = await this.context.user(id);
    if (!result) throw new NotFoundException("User not found");
    return result;
  }
}
