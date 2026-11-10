import { Controller, Get, Head, Post, Param, Req, Res, Inject } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { FastifyRequest, FastifyReply } from "fastify";
import { Public } from "../../../common/public.decorator";
import { ServeListingVideo } from "../application/ServeListingVideo";

type Request = FastifyRequest & { user?: { sub?: string; sid?: string } };

@Controller("api/v1/listings")
export class VideoServingController {
  constructor(@Inject(ServeListingVideo) private readonly serving: ServeListingVideo) {}

  @Get("video-access/:audience/:type/:id")
  async cover(@Param("audience") audience: string, @Param("type") type: string, @Param("id") id: string, @Req() req: Request, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Cache-Control", "private, no-store");
    return this.serving.control(req.user ?? {}, audience, type, id, false);
  }

  @Post("video-access/:audience/:type/:id/playback")
  async playback(@Param("audience") audience: string, @Param("type") type: string, @Param("id") id: string, @Req() req: Request, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Cache-Control", "private, no-store");
    return this.serving.control(req.user ?? {}, audience, type, id, true);
  }

  @Public()
  @SkipThrottle()
  @Head("video-files/:audience/:videoId/:generationId/:resource")
  async head(@Param() params: { audience: string; videoId: string; generationId: string; resource: string }, @Req() req: Request, @Res() reply: FastifyReply) {
    return this.file(params, req, reply);
  }

  @Public()
  @SkipThrottle()
  @Get("video-files/:audience/:videoId/:generationId/:resource")
  async file(@Param() params: { audience: string; videoId: string; generationId: string; resource: string }, @Req() req: Request, @Res() reply: FastifyReply) {
    reply.headers({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, ETag, Content-Length" });
    const query = req.query as { grant?: unknown };
    const result = await this.serving.file({ ...params, token: typeof query.grant === "string" ? query.grant : "", ...(req.headers.range ? { range: req.headers.range } : {}), head: req.method === "HEAD" });
    return reply.status(result.status).headers(result.headers).send(result.body);
  }
}
