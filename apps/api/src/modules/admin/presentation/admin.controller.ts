import { Controller, Get, Header, UseGuards } from "@nestjs/common";

import { AdminGuard } from "../../../common/admin.guard";
import { Public } from "../../../common/public.decorator";

@Controller("api/v1/admin")
export class AdminController {
  @Header("Cache-Control", "no-store")
  @Get("authority")
  @UseGuards(AdminGuard)
  authority(): { marketplaceAdmin: true } {
    return { marketplaceAdmin: true };
  }

  @Public()
  @Get("ping")
  ping(): { context: "admin"; status: "ok" } {
    return { context: "admin", status: "ok" };
  }
}
