import { z } from "zod";

import type { MeasurementSignInOutcomePort,MeasurementEmitterPort } from "../measurement.public";

import type { MeasurementSubjectPort } from "./AcceptClientMeasurementBatch";
/** Auth supplies only its accepted result and an opaque guest admission. No Sign-in Method or code is accepted. */
export class RecordSignInMeasurement implements MeasurementSignInOutcomePort {
 constructor(private readonly subjects:MeasurementSubjectPort,private readonly emitter:MeasurementEmitterPort,private readonly now:()=>Date) {}
 async record(input:Parameters<MeasurementSignInOutcomePort["record"]>[0]):Promise<void> {
  const parsed=z.object({attemptId:z.string().uuid(),guestCapability:z.string().regex(/^mg_[A-Za-z0-9_-]{43}$/),result:z.enum(["success","expected_rejection","technical_failure"]),durationMs:z.number().int().min(0).max(86400000),category:z.enum(["validation","permission","unknown"]).optional()}).strict().safeParse(input);
  if(!parsed.success)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
   const operation=async()=>{
    const authority=await this.subjects.resolve({guestCapability:parsed.data.guestCapability});
    if(!authority || authority.subject.kind!=="guest")return;
    const {attemptId,result,durationMs,category}=parsed.data;
    await this.emitter.afterCommit({version:1,eventId:attemptId,occurredAt:this.now().toISOString(),purpose:"product_reliability",eventName:"sign_in_result",context:{platform:"server",release:"server",build:"server",locale:"ru"},payload:{attemptId,result,durationMs,...(category?{category}:{})}},{...authority,origin:"server"});
   };
   await Promise.race([operation(),new Promise<void>(resolve=>{timer=setTimeout(resolve,250);})]);
  } catch { /* Auth outcome and failure response survive collector outage. */ }
  finally {clearTimeout(timer);}
 }
}
