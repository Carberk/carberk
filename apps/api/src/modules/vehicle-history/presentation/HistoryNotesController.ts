import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req, UseFilters } from "@nestjs/common";
import { VehicleHistorySchemas as Schemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import { AddHistoryPrivateNote } from "../application/AddHistoryPrivateNote";
import { ReadHistoryPrivateNotes } from "../application/ReadHistoryPrivateNotes";
import type { HistoryRequesterClaims } from "../application/CurrentHistoryRequester";
import { HistoryRequestError } from "../domain/HistoryRequestError";
import { HistoryNotesExceptionFilter } from "./HistoryRequestExceptionFilter";

type Request = FastifyRequest & { user?: HistoryRequesterClaims };

@Controller("api/v1/vehicle-history/operator/requests")
@UseFilters(HistoryNotesExceptionFilter)
export class HistoryNotesController {
  constructor(
    @Inject(AddHistoryPrivateNote) private readonly add: AddHistoryPrivateNote,
    @Inject(ReadHistoryPrivateNotes) private readonly read: ReadHistoryPrivateNotes,
  ) {}

  @Post(":id/notes")
  @Header("Cache-Control", "private, no-store")
  addNote(@Req() request: Request, @Param("id") id: string, @Body() body: unknown, @Query() query: unknown) {
    const input = Schemas.AddHistoryPrivateNoteSchema.safeParse(body);
    if (!input.success || !Schemas.HistoryMessageSendQuerySchema.safeParse(query).success) {
      throw new HistoryRequestError("HISTORY_NOTE_INVALID");
    }
    return this.add.execute(request.user ?? {}, id, input.data);
  }

  @Get(":id/notes")
  @Header("Cache-Control", "private, no-store")
  readNotes(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    const input = Schemas.ReadHistoryPrivateNotesSchema.safeParse(query);
    if (!input.success) throw new HistoryRequestError("HISTORY_NOTE_INVALID");
    return this.read.execute(request.user ?? {}, id, input.data);
  }
}
