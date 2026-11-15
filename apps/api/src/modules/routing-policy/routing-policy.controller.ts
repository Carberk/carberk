import { Controller, Get, Header, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RoutingPolicySchemas } from "@auto-tm/contracts";

import type { Env } from "../../env.schema";

@Controller("api/v1/routing")
export class RoutingPolicyController {
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  @Get("policy")
  @Header("Cache-Control", "private, no-store")
  read() {
    return RoutingPolicySchemas.RoutingPolicySchema.parse({
      version: 1, disableTmPreference: this.config.get("ROUTING_DISABLE_TM_PREFERENCE", { infer: true }), maxAgeSeconds: 60,
    });
  }
}
