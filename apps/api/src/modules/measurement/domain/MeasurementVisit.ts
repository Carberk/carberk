export interface MeasurementVisitState {
 id: string; principalId: string; startedAt: Date; foregroundAt: Date; endedAt: Date | null;
}

/** Only foreground bootstrap advances visits. Delivery of buffered facts cannot revive them. */
export class MeasurementVisit {
 static foreground(_previous: MeasurementVisitState | null, principalId: string, now: Date, newId: string): MeasurementVisitState {
  return { id: newId, principalId, startedAt: now, foregroundAt: now, endedAt: null };
 }
 static permits(_visit: MeasurementVisitState, _principalId: string, _occurredAt: Date): boolean { return false; }
}
