// ============================================================================
// CAR HIRE OS — DETERMINISTIC TEST HARNESS: DETERMINISTIC IDENTIFIERS
// Provides stable, collision-free UUIDs and entity reference generators
// to eliminate order dependencies and unrepeatable test runs.
// ============================================================================

export class TestIdGenerator {
  private counter: number = 1000;

  public next(domain: string = "id"): string {
    this.counter++;
    const hex = this.counter.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${hex}`;
  }

  public tenant(name: string): string {
    const hash = this.hashString(name);
    return `11111111-1111-4111-8111-${hash.padStart(12, "0")}`;
  }

  public user(name: string): string {
    const hash = this.hashString(name);
    return `22222222-2222-4222-8222-${hash.padStart(12, "0")}`;
  }

  public vehicle(reg: string): string {
    const hash = this.hashString(reg);
    return `33333333-3333-4333-8333-${hash.padStart(12, "0")}`;
  }

  public booking(ref: string): string {
    const hash = this.hashString(ref);
    return `44444444-4444-4444-8444-${hash.padStart(12, "0")}`;
  }

  public payment(ref: string): string {
    const hash = this.hashString(ref);
    return `55555555-5555-4555-8555-${hash.padStart(12, "0")}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).slice(0, 12);
  }
}

export const defaultIdGen = new TestIdGenerator();
