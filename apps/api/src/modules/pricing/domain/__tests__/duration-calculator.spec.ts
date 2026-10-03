import { BillableDurationCalculator } from "../duration-calculator";

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Test failed: ${msg}`);
}

export function runDurationCalculatorTests() {
  // Test 1: exact 24 hours
  {
    const pickup = "2026-09-01T10:00:00Z";
    const dropoff = "2026-09-02T10:00:00Z";
    const result = BillableDurationCalculator.calculate(pickup, dropoff, 120);
    assert(result.totalHours === 24, "totalHours should be 24");
    assert(result.billableDays === 1, "billableDays should be 1");
    assert(result.partialDayGraceApplied === false, "grace should not be applied");
  }

  // Test 2: within grace window
  {
    const pickup = "2026-09-01T10:00:00Z";
    const dropoff = "2026-09-02T11:30:00Z";
    const result = BillableDurationCalculator.calculate(pickup, dropoff, 120);
    assert(result.billableDays === 1, "billableDays should be 1 within grace period");
    assert(result.partialDayGraceApplied === true, "grace should be applied");
  }

  // Test 3: exceeds grace period
  {
    const pickup = "2026-09-01T10:00:00Z";
    const dropoff = "2026-09-02T13:00:00Z";
    const result = BillableDurationCalculator.calculate(pickup, dropoff, 120);
    assert(result.billableDays === 2, "billableDays should be 2 when grace exceeded");
    assert(result.partialDayGraceApplied === false, "grace should not be applied");
  }

  // Test 4: return before pickup
  {
    let threw = false;
    try {
      BillableDurationCalculator.calculate("2026-09-02T10:00:00Z", "2026-09-01T10:00:00Z");
    } catch {
      threw = true;
    }
    assert(threw, "should throw if return before pickup");
  }
}

