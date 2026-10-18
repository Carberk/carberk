import { expect,it } from "vitest";
import { RecordSignInMeasurement } from "./RecordSignInMeasurement";
import { AcceptMeasurement } from "./AcceptMeasurement";
import { FakeMeasurementSubjects } from "./testing/FakeMeasurementSubjects";
import { FakeMeasurementLedger } from "./testing/FakeMeasurementLedger";
const now=new Date("2026-10-18T00:00:00Z"),attemptId="00000000-0000-4000-8000-000000000601",guestCapability=`mg_${"a".repeat(43)}`;
function setup() {const subjects=new FakeMeasurementSubjects(),ledger=new FakeMeasurementLedger();return {subjects,ledger,source:new RecordSignInMeasurement(subjects,new AcceptMeasurement(ledger,()=>now,{enabled:true,environment:"test",purposes:["product_reliability"],evidenceRef:"synthetic-auth-source",realCollectionApproved:false}),()=>now)};}
it("records the committed minimal server outcome once per issued attempt without Sign-in Method or code",async()=>{
 const {source,ledger}=setup();
 await source.record({attemptId,guestCapability,result:"success",durationMs:50});
 await source.record({attemptId,guestCapability,result:"success",durationMs:50});
 expect(ledger.records.map(record=>record.event)).toEqual([{version:1,eventId:attemptId,occurredAt:now.toISOString(),purpose:"product_reliability",eventName:"sign_in_result",context:{platform:"server",release:"server",build:"server",locale:"ru"},payload:{attemptId,result:"success",durationMs:50}}]);
});
it("does not create outcomes for missing/revoked identities and isolates collector outage",async()=>{
 const {source,subjects,ledger}=setup();
 await source.record({attemptId,result:"technical_failure",durationMs:30});expect(ledger.records).toEqual([]);
 subjects.authority=null;await source.record({attemptId,guestCapability,result:"success",durationMs:30});expect(ledger.records).toEqual([]);
 subjects.unavailable=true;await expect(source.record({attemptId,guestCapability,result:"success",durationMs:30})).resolves.toBeUndefined();
});
