import { Catch, type ArgumentsHost } from "@nestjs/common";
import type { FastifyReply } from "fastify";

import { GlobalErrorFilter } from "../../../common/error.filter";

/** Route filters also cover guard errors before controller headers are applied. */
@Catch()
export class VideoUploadErrorFilter extends GlobalErrorFilter {
  override catch(exception: unknown, host: ArgumentsHost) {
    host.switchToHttp().getResponse<FastifyReply>().header("Cache-Control", "private, no-store");
    super.catch(exception, host);
  }
}
