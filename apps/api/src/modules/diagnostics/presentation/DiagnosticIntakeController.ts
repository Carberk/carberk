import { Controller, ForbiddenException, Get, Post } from "@nestjs/common";
import { Public } from "../../../common/public.decorator";

@Controller("api/v1/diagnostics")
export class DiagnosticIntakeController {
  @Public() @Get("availability") availability(): { available: false } { return { available: false }; }
  @Post("orders") create(): never { throw new ForbiddenException({ code: "DIAGNOSTIC_SERVICE_UNAVAILABLE", message: "Inspection service is unavailable" }); }
}
