import type { MeasurementAuthority } from "../../measurement.public";
import type { MeasurementSubjectPort } from "../AcceptClientMeasurementBatch";
export class FakeMeasurementSubjects implements MeasurementSubjectPort {
 authority:MeasurementAuthority|null={origin:"client",environment:"test",population:"synthetic",subject:{kind:"guest",pseudonym:"a".repeat(64),generation:"synthetic-guest"}};
 unavailable=false;
 async resolve():Promise<MeasurementAuthority|null> {if(this.unavailable)throw new Error("Unavailable");return this.authority?structuredClone(this.authority):null;}
}
