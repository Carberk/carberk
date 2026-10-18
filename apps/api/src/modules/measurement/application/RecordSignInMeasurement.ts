import type { MeasurementSignInOutcomePort } from "../measurement.public";
import type { MeasurementSubjectPort } from "./AcceptClientMeasurementBatch";
import type { MeasurementEmitterPort } from "../measurement.public";
export class RecordSignInMeasurement implements MeasurementSignInOutcomePort {
 constructor(private readonly subjects:MeasurementSubjectPort,private readonly emitter:MeasurementEmitterPort,private readonly now:()=>Date) {}
 async record(_input:Parameters<MeasurementSignInOutcomePort["record"]>[0]):Promise<void> {}
}
