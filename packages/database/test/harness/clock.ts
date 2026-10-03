// ============================================================================
// CAR HIRE OS — DETERMINISTIC TEST HARNESS: CLOCK & TIME CONTROL
// Enables frozen time, deterministic time-travel, and deadline verification
// without relying on wall-clock sleep or asynchronous timeouts.
// ============================================================================

export class TestClock {
  private currentTime: Date;

  constructor(initialTime?: Date | string) {
    this.currentTime = initialTime ? new Date(initialTime) : new Date("2026-09-16T12:00:00.000Z");
  }

  public now(): Date {
    return new Date(this.currentTime.getTime());
  }

  public iso(): string {
    return this.currentTime.toISOString();
  }

  public advanceSeconds(seconds: number): Date {
    this.currentTime = new Date(this.currentTime.getTime() + seconds * 1000);
    return this.now();
  }

  public advanceMinutes(minutes: number): Date {
    return this.advanceSeconds(minutes * 60);
  }

  public advanceHours(hours: number): Date {
    return this.advanceSeconds(hours * 3600);
  }

  public advanceDays(days: number): Date {
    return this.advanceSeconds(days * 86400);
  }

  public setTime(time: Date | string): void {
    this.currentTime = new Date(time);
  }
}

export const defaultTestClock = new TestClock("2026-09-16T12:00:00.000Z");
