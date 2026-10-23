import { Controller, Get, Header, Inject, NotFoundException, Param, Query, BadRequestException } from "@nestjs/common";
import { z } from "zod";

import { Public } from "../../../common/public.decorator";
import { PUBLIC_MARKETPLACE_READ_PORT, type PublicMarketplaceReadPort } from "../domain/ports/PublicMarketplaceReadPort";

@Controller("api/v1/public-marketplace")
export class PublicMarketplaceController {
 constructor(@Inject(PUBLIC_MARKETPLACE_READ_PORT) private readonly readers: PublicMarketplaceReadPort) {}
 @Public() @Get("listings/:id") @Header("Cache-Control", "no-store")
 async listing(@Param("id") id: string) {
  const item = await this.readers.listing(this.uuid(id));
  if (!item) throw new NotFoundException({ code: "NOT_FOUND" });
  return item;
 }
 @Public() @Get("showrooms/:id") @Header("Cache-Control", "no-store")
 async showroom(@Param("id") id: string, @Query("cursor") cursor?: string) {
  const page = await this.readers.showroom(this.uuid(id), cursor ? this.uuid(cursor) : undefined);
  if (!page) throw new NotFoundException({ code: "NOT_FOUND" });
  return page;
 }
 private uuid(id: string) {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) throw new BadRequestException({ code: "VALIDATION_FAILED" });
  return parsed.data;
 }
}
