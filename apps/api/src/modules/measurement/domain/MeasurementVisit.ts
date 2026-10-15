export interface MeasurementVisitState {
 id: string; principalId: string; startedAt: Date; foregroundAt: Date; endedAt: Date | null;
}

/** Only foreground bootstrap advances visits. Delivery of buffered facts cannot revive them. */
export const MeasurementVisit = {
 foreground(previous: MeasurementVisitState | null, principalId: string, now: Date, newId: string): MeasurementVisitState {
  if (previous && previous.principalId === principalId && !previous.endedAt
   && now.getTime() >= previous.foregroundAt.getTime()
   && now.getTime() - previous.foregroundAt.getTime() < 30 * 60 * 1000) {
   return { ...previous, foregroundAt: now };
  }
  return { id: newId, principalId, startedAt: now, foregroundAt: now, endedAt: null };
 },
 permits(visit: MeasurementVisitState, principalId: string, occurredAt: Date): boolean {
  const time = occurredAt.getTime();
  return visit.principalId === principalId && Number.isFinite(time)
   && time >= visit.startedAt.getTime()
   && time < visit.foregroundAt.getTime() + 30 * 60 * 1000
   && (!visit.endedAt || time <= visit.endedAt.getTime());
 }
};
