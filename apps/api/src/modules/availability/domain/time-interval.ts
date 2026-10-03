// ============================================================================
// CAR HIRE OS — AVAILABILITY TIME INTERVAL VALUE OBJECT (DEV-004, DOM-001)
// Implements canonical half-open [startsAt, endsAt) interval mathematics
// ============================================================================

import { InvalidAvailabilityIntervalError } from "@carhire/database";

export class TimeInterval {
  public readonly startsAt: Date;
  public readonly endsAt: Date;

  constructor(startsAt: string | Date | number, endsAt: string | Date | number) {
    this.startsAt = new Date(startsAt);
    this.endsAt = new Date(endsAt);

    if (
      isNaN(this.startsAt.getTime()) ||
      isNaN(this.endsAt.getTime()) ||
      this.endsAt.getTime() <= this.startsAt.getTime()
    ) {
      throw new InvalidAvailabilityIntervalError(
        `Invalid interval: endsAt (${this.endsAt.toISOString()}) must be strictly after startsAt (${this.startsAt.toISOString()}).`
      );
    }
  }

  get startsAtIso(): string {
    return this.startsAt.toISOString();
  }

  get endsAtIso(): string {
    return this.endsAt.toISOString();
  }

  get durationMs(): number {
    return this.endsAt.getTime() - this.startsAt.getTime();
  }

  get durationMinutes(): number {
    return Math.ceil(this.durationMs / (60 * 1000));
  }

  get durationHours(): number {
    return Math.round((this.durationMs / (60 * 60 * 1000)) * 100) / 100;
  }

  get durationDays(): number {
    return Math.ceil(this.durationMs / (24 * 60 * 60 * 1000));
  }

  /**
   * Evaluates if two half-open intervals [A_start, A_end) and [B_start, B_end) overlap.
   * Note: Touching boundaries (e.g. [10:00, 12:00) and [12:00, 14:00)) do NOT overlap.
   */
  overlaps(other: TimeInterval): boolean {
    return (
      this.startsAt.getTime() < other.endsAt.getTime() &&
      other.startsAt.getTime() < this.endsAt.getTime()
    );
  }

  /**
   * Checks if an exact timestamp is contained in [startsAt, endsAt)
   */
  contains(date: string | Date | number): boolean {
    const time = new Date(date).getTime();
    return time >= this.startsAt.getTime() && time < this.endsAt.getTime();
  }

  /**
   * Adds an optional prep and turnaround buffer to the interval
   */
  withTurnaroundBuffer(bufferMinutes: number = 0, bufferBothEnds: boolean = false): TimeInterval {
    if (bufferMinutes <= 0) return this;
    const bufferMs = bufferMinutes * 60 * 1000;
    const newStart = bufferBothEnds
      ? new Date(this.startsAt.getTime() - bufferMs)
      : this.startsAt;
    return new TimeInterval(
      newStart,
      new Date(this.endsAt.getTime() + bufferMs)
    );
  }

  /**
   * Checks if this interval is adjacent to another (touching boundary)
   */
  isAdjacent(other: TimeInterval): boolean {
    return (
      this.endsAt.getTime() === other.startsAt.getTime() ||
      this.startsAt.getTime() === other.endsAt.getTime()
    );
  }
}
