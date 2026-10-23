import { BadRequestException,Body,Controller,ForbiddenException,Get,Header,Inject,Param,Post,Query,Req } from "@nestjs/common";
import { ImprovementSchemas } from "@auto-tm/contracts";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { StaffAuthorityDenied, type StaffSubject } from "../../identity/identity.public";
import { ImprovementAccessDenied,PrismaImprovementRead } from "../infrastructure/PrismaImprovementRead";
import { MarketKnowledgeDenied,PrismaMarketKnowledge } from "../infrastructure/PrismaMarketKnowledge";

type StaffRequest=FastifyRequest&{user?:{sub?:string;sid?:string}};
@Controller("api/v1/improvement")
export class ImprovementController {
 constructor(@Inject(PrismaImprovementRead) private readonly reads:PrismaImprovementRead,@Inject(PrismaMarketKnowledge) private readonly knowledge:PrismaMarketKnowledge) {}
 private subject(request:StaffRequest):StaffSubject {
  if(!request.user?.sub || !request.user.sid) throw new ForbiddenException({code:"FORBIDDEN"});
  return {userId:request.user.sub,sessionId:request.user.sid};
 }
 private async authorized<T>(operation:()=>Promise<T>) {
  try{return await operation();} catch(error) {
   if(error instanceof StaffAuthorityDenied || error instanceof ImprovementAccessDenied || error instanceof MarketKnowledgeDenied) throw new ForbiddenException({code:"FORBIDDEN"});
   throw error;
  }
 }
 @Header("Cache-Control","no-store")
 @Get("scorecard")
 scorecard(@Query("period") period:unknown,@Req() request:StaffRequest) {
  const parsed=ImprovementSchemas.ImprovementPeriodSchema.safeParse(period??"completed_week");
  if(!parsed.success) throw new BadRequestException({code:"VALIDATION_FAILED"});
  return this.authorized(()=>this.reads.scorecard(this.subject(request),parsed.data));
 }
 @Header("Cache-Control","no-store")
 @Post("investigations")
 investigate(@Body() body:unknown,@Req() request:StaffRequest) {
  const parsed=ImprovementSchemas.ImprovementInvestigationRequestSchema.safeParse(body);
  if(!parsed.success) throw new BadRequestException({code:"VALIDATION_FAILED"});
  return this.authorized(()=>this.reads.investigate(this.subject(request),parsed.data));
 }
 @Header("Cache-Control","no-store")
 @Get("artifacts/:id")
 artifact(@Param("id") id:string,@Req() request:StaffRequest) {
  if(!z.string().uuid().safeParse(id).success) throw new BadRequestException({code:"VALIDATION_FAILED"});
  return this.authorized(()=>this.reads.artifact(this.subject(request),id));
 }
 @Header("Cache-Control","no-store")
 @Post("research/derivations")
 researchAdmission(@Body() body:unknown,@Req() request:StaffRequest) {return this.authorized(()=>this.knowledge.admitSynthetic(this.subject(request),body));}
 @Header("Cache-Control","no-store")
 @Post("research/sources/:id/invalidate")
 researchSourceInvalidation(@Param("id") id:string,@Body() body:unknown,@Req() request:StaffRequest) {return this.authorized(()=>this.knowledge.invalidateSource(this.subject(request),id,body));}
 @Header("Cache-Control","no-store")
 @Get("research")
 researchList(@Req() request:StaffRequest) {return this.authorized(()=>this.knowledge.list(this.subject(request)));}
 @Header("Cache-Control","no-store")
 @Get("research/:id")
 research(@Param("id") id:string,@Req() request:StaffRequest) {
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new BadRequestException({code:"VALIDATION_FAILED"});
  return this.authorized(()=>this.knowledge.read(this.subject(request),id));
 }
 @Header("Cache-Control","no-store")
 @Post("research/:id/exports")
 researchExport(@Param("id") id:string,@Body() body:unknown,@Req() request:StaffRequest) {
  const parsed=z.object({reason:z.string().trim().min(8).max(500)}).strict().safeParse(body);
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id) || !parsed.success) throw new BadRequestException({code:"VALIDATION_FAILED"});
  return this.authorized(()=>this.knowledge.export(this.subject(request),id,parsed.data.reason));
 }
 @Header("Cache-Control","no-store")
 @Get("research-artifacts/:id")
 researchArtifact(@Param("id") id:string,@Req() request:StaffRequest) {
  if(!z.string().uuid().safeParse(id).success) throw new BadRequestException({code:"VALIDATION_FAILED"});
  return this.authorized(()=>this.knowledge.artifact(this.subject(request),id));
 }
}
