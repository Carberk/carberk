import { Controller, ForbiddenException, Get, Header, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { StaffAuthorityDenied } from "../../identity/identity.public";
import { ReadOperationsHealth } from "../application/ReadOperationsHealth";

@Controller("api/v1/operations")
export class OperationsController {
  constructor(@Inject(ReadOperationsHealth) private readonly read: ReadOperationsHealth) {}
  @Header("Cache-Control", "no-store")
  @Get("health")
  async health(@Req() request: FastifyRequest & { user?: { sub?: string; sid?: string } }) {
    if (!request.user?.sub || !request.user.sid) throw new ForbiddenException({ code: "FORBIDDEN" });
    try { return await this.read.execute({ userId: request.user.sub, sessionId: request.user.sid }); }
    catch (error) {
      if (error instanceof StaffAuthorityDenied) throw new ForbiddenException({ code: "FORBIDDEN" });
      throw error;
    }
  }
}
