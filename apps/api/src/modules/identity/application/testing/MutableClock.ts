import type { ClockPort } from "../../domain/ports/ClockPort";

export class MutableClock implements ClockPort {
  constructor(public current: Date) {}

  now(): Date {
    return this.current;
  }
}
