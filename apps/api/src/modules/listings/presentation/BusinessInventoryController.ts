import { Controller, Get, Inject, Param, Post, Req, HttpCode } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { BUSINESS_INVENTORY_REPOSITORY, type BusinessInventoryRepository } from "../domain/ports/BusinessInventoryRepository";
import { inventoryActor } from "./inventoryActor";
@Controller("api/v1/businesses/:businessId/inventory")
export class BusinessInventoryController {
  constructor(@Inject(BUSINESS_INVENTORY_REPOSITORY) private readonly inventory: BusinessInventoryRepository) {}
  @Get()
  read(@Param("businessId") businessId: string, @Req() req: FastifyRequest) {
    return this.inventory.read(inventoryActor(req, businessId));
  }
  @Post(":listingId/confirm-availability")
  @HttpCode(200)
  async confirm(@Param("businessId") businessId: string, @Param("listingId") listingId: string, @Req() req: FastifyRequest) {
    await this.inventory.confirmAvailability(inventoryActor(req, businessId), listingId);
    return { success: true };
  }
}
