import { RateCalculator } from "../rate-calculator";
import { RatePlan, RatePlanRate, SeasonalRateRule, DurationTierRule, PromoCode } from "@carhire/types";

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Test failed: ${msg}`);
}

export function runRateCalculatorTests() {
  const mockPlan: RatePlan = {
    id: "rp-test",
    tenantId: "tenant-nairobi",
    code: "STD_2026",
    name: "Standard Plan",
    description: "Standard plan",
    status: "ACTIVE",
    currency: "KES",
    priority: 10,
    isDefault: true,
    effectiveFrom: "2026-01-01T00:00:00Z",
    effectiveTo: null,
    taxInclusive: false,
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  const mockRates: RatePlanRate[] = [
    {
      id: "rpr-economy",
      tenantId: "tenant-nairobi",
      ratePlanId: "rp-test",
      vehicleCategoryId: "cat-economy",
      vehicleId: null,
      dailyRate: 5000,
      weeklyDailyRate: 4500,
      monthlyDailyRate: 4000,
      weekendDailyRate: 5500,
      mileageAllowanceModel: "DAILY_CAPPED",
      includedKmPerDay: 200,
      excessKmRate: 30,
      depositAmount: 15000,
      depositModel: "FIXED",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ];

  // Test 1: 1 weekday base rate with 16% tax
  {
    const result = RateCalculator.calculate({
      request: {
        vehicleCategoryId: "cat-economy",
        pickupDateTime: "2026-09-01T09:00:00Z", // Tuesday
        returnDateTime: "2026-09-02T09:00:00Z", // Wednesday (1 day)
      },
      ratePlan: mockPlan,
      rateLine: mockRates[0],
      seasonalRules: [],
      durationTiers: [],
      availableFees: [],
    });

    assert(result.rentalDuration.billableDays === 1, "billableDays should be 1");
    assert(result.baseRentalAmount === 5000, "baseRentalAmount should be 5000");
    assert(result.taxCalculation.taxableAmount === 5000, "taxableAmount should be 5000");
    assert(result.taxCalculation.taxAmount === 800, "taxAmount should be 800 (16% of 5000)");
    assert(result.grossRentalTotal === 5800, "grossRentalTotal should be 5800");
    assert(result.securityDeposit.amount === 15000, "securityDeposit should be 15000");
  }

  // Test 2: duration tier discount for 7 days
  {
    const tiers: DurationTierRule[] = [
      {
        id: "tier-1",
        tenantId: "tenant-nairobi",
        ratePlanId: "rp-test",
        minDays: 7,
        maxDays: 14,
        discountPercent: 10,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    const result = RateCalculator.calculate({
      request: {
        vehicleCategoryId: "cat-economy",
        pickupDateTime: "2026-09-01T09:00:00Z",
        returnDateTime: "2026-09-08T09:00:00Z", // 7 days
      },
      ratePlan: mockPlan,
      rateLine: mockRates[0],
      seasonalRules: [],
      durationTiers: tiers,
      availableFees: [],
    });

    assert(result.rentalDuration.billableDays === 7, "billableDays should be 7");
    assert(result.baseRentalAmount === 31500, "baseRentalAmount should be 31500 (4500 * 7)");
    assert(result.totalDiscount === 3150, "totalDiscount should be 3150 (10% of 31500)");
    assert(result.taxCalculation.taxableAmount === 28350, "taxableAmount should be 28350");
  }

  // Test 3: seasonal peak multiplier
  {
    const seasonalRules: SeasonalRateRule[] = [
      {
        id: "season-dec",
        tenantId: "tenant-nairobi",
        ratePlanId: "rp-test",
        name: "Peak December",
        startDate: "2026-12-01",
        endDate: "2026-12-31",
        multiplier: 1.5, // 50% surcharge
        vehicleCategoryId: null,
        priority: 10,
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];

    const result = RateCalculator.calculate({
      request: {
        vehicleCategoryId: "cat-economy",
        pickupDateTime: "2026-12-10T09:00:00Z",
        returnDateTime: "2026-12-11T09:00:00Z",
      },
      ratePlan: mockPlan,
      rateLine: mockRates[0],
      seasonalRules,
      durationTiers: [],
      availableFees: [],
    });

    assert(result.baseRentalAmount === 7500, "baseRentalAmount should be 7500 (5000 * 1.5)");
  }

  // Test 4: promo code with discount cap
  {
    const promo: PromoCode = {
      id: "promo-1",
      tenantId: "tenant-nairobi",
      code: "SUPER20",
      description: "20% off",
      discountType: "PERCENTAGE",
      discountValue: 20,
      applicableTo: "BASE_RENTAL",
      minRentalDays: 1,
      maxDiscountAmount: 800, // Capped at 800
      validFrom: "2026-01-01T00:00:00Z",
      validTo: "2026-12-31T23:59:59Z",
      usageLimit: 100,
      usageCount: 0,
      isStackable: false,
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    const result = RateCalculator.calculate({
      request: {
        vehicleCategoryId: "cat-economy",
        pickupDateTime: "2026-09-01T09:00:00Z",
        returnDateTime: "2026-09-02T09:00:00Z",
        promoCode: "SUPER20",
      },
      ratePlan: mockPlan,
      rateLine: mockRates[0],
      seasonalRules: [],
      durationTiers: [],
      availableFees: [],
      promoCode: promo,
    });

    assert(result.totalDiscount === 800, "totalDiscount should be capped at 800");
  }
}

